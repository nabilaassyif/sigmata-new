

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

from src.data.labels import LabelEncoder
from src.embeddings.cache import EmbeddingStore
from src.graph.ego_graph import EDGE_TYPES, NODE_TYPES, batch_ego_graphs, build_ego_graph, query_node_indices
from src.retrieval.semantic_index import SemanticIndex

logger = logging.getLogger(__name__)


def _haversine(lat0: float, lng0: float, lat: np.ndarray, lng: np.ndarray) -> np.ndarray:
    r = 6371.0
    p0, p1 = np.radians(lat0), np.radians(lat)
    dphi = np.radians(lat - lat0); dlmb = np.radians(lng - lng0)
    a = np.sin(dphi / 2) ** 2 + np.cos(p0) * np.cos(p1) * np.sin(dlmb / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


@dataclass
class AssemblerConfig:
    k_semantic: int = 10
    k_spatial: int = 5          
    k_temporal: int = 5         
    k_rare: int = 3             
    use_semantic: bool = True
    use_spatial: bool = True
    use_temporal: bool = True
    use_opd_nodes: bool = True
    use_cat_nodes: bool = True
    use_retrieval: bool = True  
    add_self_loop: bool = True
    strict: bool = True         


    causal: bool = True


    source_aware: bool = False
    id_col: str = "complaintID"
    time_col: str = "timestamp"


    pad_nodes: int = 0
    pad_edges: int = 0


    cache_graphs: bool = True


@dataclass
class AssembledBatch:
    graph: object                       
    query_idx: np.ndarray               
    labels: Dict[str, np.ndarray]       
    masks: Dict[str, np.ndarray]        
    n_node_per_graph: List[int]
    n_edge_per_graph: List[int]


class EgoGraphAssembler:

    def __init__(
        self,
        df: pd.DataFrame,
        store: EmbeddingStore,
        index: SemanticIndex,
        train_ids: Sequence[str],
        encoders: Dict[str, LabelEncoder],
        inverted_lists: Optional[Dict] = None,
        cfg: Optional[AssemblerConfig] = None,
        category_rarity: Optional[np.ndarray] = None,
    ):
        self.cfg = cfg or AssemblerConfig()
        self.store = store
        self.index = index
        self.enc_cat = encoders["category"]
        self.enc_opd = encoders["opd"]
        self.inverted = inverted_lists or {}


        self.category_rarity = (
            np.ones(len(self.enc_cat), dtype=np.float32)
            if category_rarity is None else np.asarray(category_rarity, dtype=np.float32)
        )

        df = df.copy()
        df[self.cfg.id_col] = df[self.cfg.id_col].astype(str)
        df[self.cfg.time_col] = pd.to_datetime(df[self.cfg.time_col])
        for c in ("lat", "lng"):
            if c in df.columns:
                df[c] = pd.to_numeric(df[c], errors="coerce")
        if "geo_valid" in df.columns:
            df["geo_valid"] = df["geo_valid"].astype(bool)
        self.df = df.set_index(self.cfg.id_col, drop=False)
        self.train_ids = [str(t) for t in train_ids]
        self.train_set = set(self.train_ids)
        self._cache: Dict[str, tuple] = {}   


        ids = self.df[self.cfg.id_col].to_numpy()
        self._ids = ids
        self._pos = {cid: i for i, cid in enumerate(ids)}                       
        self._tsv = self.df[self.cfg.time_col].to_numpy()                       
        self._latv = pd.to_numeric(self.df.get("lat"), errors="coerce").to_numpy(dtype=float) \
            if "lat" in self.df.columns else np.full(len(ids), np.nan)
        self._lngv = pd.to_numeric(self.df.get("lng"), errors="coerce").to_numpy(dtype=float) \
            if "lng" in self.df.columns else np.full(len(ids), np.nan)
        self._geov = (self.df["geo_valid"].to_numpy(dtype=bool) if "geo_valid" in self.df.columns
                      else (np.isfinite(self._latv) & np.isfinite(self._lngv)))

        if "source" in self.df.columns:
            self._srcv = pd.factorize(self.df["source"].astype(str))[0].astype(np.int64)
        else:
            self._srcv = np.full(len(ids), -1, dtype=np.int64)
        self._catidv = np.asarray(self.enc_cat.transform(self.df["category"].tolist()), dtype=np.int64)
        self._opdidv = np.asarray(self.enc_opd.transform(self.df["label_opd_final"].tolist()), dtype=np.int64)
        self._slav = (pd.to_numeric(self.df["sla_breach_risk"], errors="coerce").to_numpy(dtype=float)
                      if "sla_breach_risk" in self.df.columns else np.full(len(ids), np.nan))
        self._emb = self.store.vectors_for(ids.tolist()).astype(np.float32)     
        self._rarity = self.category_rarity


        train_pos = np.asarray([self._pos[t] for t in self.train_ids if t in self._pos], dtype=np.int64)
        order = np.argsort(self._tsv[train_pos], kind="mergesort")
        self._train_pos_sorted = train_pos[order]
        self._train_ts_sorted = self._tsv[train_pos][order]
        self._train_mask = np.zeros(len(ids), dtype=bool)
        self._train_mask[train_pos] = True

        self._train_sorted_ids = self._ids[self._train_pos_sorted]
        self._ts = self.df[self.cfg.time_col]


    def causal_pool(self, query_id: str) -> List[str]:
        return self._ids[self._causal_pool_pos(query_id)].tolist()

    def _causal_pool_pos(self, query_id: str) -> np.ndarray:


        qp = self._pos[query_id]
        if not self.cfg.causal:
            pool = self._train_pos_sorted
        else:
            cut = np.searchsorted(self._train_ts_sorted, self._tsv[qp], side="left")
            pool = self._train_pos_sorted[:cut]
        if self._train_mask[qp]:
            pool = pool[pool != qp]
        if self.cfg.source_aware:                      
            pool = pool[self._srcv[pool] == self._srcv[qp]]
        return pool

    def _rare_exemplars(self, pool_set: set, k: int) -> List[str]:
        if k <= 0 or not self.inverted:
            return []
        rare_labels = self.inverted.get("rare_labels", {}).get("category", [])
        lists = self.inverted.get("inverted_lists", {}).get("category", {})
        out: List[str] = []
        for lbl in rare_labels:
            for cid in lists.get(lbl, []):
                if cid in pool_set:
                    out.append(cid)
                    break
            if len(out) >= k:
                break
        return out


    def _spatial_neighbors_pos(self, qp: int, pool_pos: np.ndarray, k: int) -> np.ndarray:
        if not bool(self._geov[qp]) or pool_pos.size == 0:
            return np.empty(0, dtype=np.int64)
        cand = pool_pos[self._geov[pool_pos]]
        if cand.size == 0:
            return np.empty(0, dtype=np.int64)
        d = _haversine(self._latv[qp], self._lngv[qp], self._latv[cand], self._lngv[cand])
        return cand[np.argsort(d)[:k]]

    def _assemble_one(self, query_id: str):
        cfg = self.cfg
        if cfg.cache_graphs and query_id in self._cache:
            return self._cache[query_id]
        qp = self._pos[query_id]
        qfeat = self._emb[qp]
        pool = self._causal_pool_pos(query_id)            

        nbr_pos: List[int] = []
        nbr_scores: List[float] = []
        relations: List[int] = []
        seen: set = set()

        def _add(p: int, score: float, rel: int) -> None:
            if p in seen or p == qp:
                return
            seen.add(p); nbr_pos.append(p); nbr_scores.append(score); relations.append(rel)

        if cfg.use_retrieval and pool.size:
            if cfg.use_semantic and cfg.k_semantic > 0:
                allowed = self._ids[pool].tolist()        
                for cid, sc in self.index.search(qfeat, k=cfg.k_semantic, allowed_ids=allowed):
                    p = self._pos.get(cid)
                    if p is not None:
                        _add(p, float(sc), EDGE_TYPES["semantic"])
            if cfg.use_spatial and cfg.k_spatial > 0:
                for p in self._spatial_neighbors_pos(qp, pool, cfg.k_spatial):
                    _add(int(p), 1.0, EDGE_TYPES["spatial"])
            if cfg.use_temporal and cfg.k_temporal > 0:
                for p in pool[-cfg.k_temporal:][::-1]:     
                    _add(int(p), 1.0, EDGE_TYPES["temporal"])
            if cfg.k_rare > 0 and self.inverted:
                pool_id_set = set(self._ids[pool].tolist())
                for cid in self._rare_exemplars(pool_id_set, cfg.k_rare):
                    p = self._pos.get(cid)
                    if p is not None:
                        _add(p, 1.0, EDGE_TYPES["semantic"])

        if cfg.strict and nbr_pos:
            na = np.asarray(nbr_pos, dtype=np.int64)
            if cfg.causal:   
                assert (self._tsv[na] < self._tsv[qp]).all(), f"FUTURE LEAK: {query_id}"
            assert self._train_mask[na].all(), f"POOL LEAK: {query_id} (non-train neighbour)"
            assert qp not in nbr_pos, f"SELF LEAK: {query_id}"

        if nbr_pos:
            na = np.asarray(nbr_pos, dtype=np.int64)
            nbr_feats = self._emb[na]
            cat_all = self._catidv[na]
            opd_ids = self._opdidv[na].tolist() if cfg.use_opd_nodes else None
            cat_ids = cat_all.tolist() if cfg.use_cat_nodes else None
            rarity = [float(self._rarity[c]) if 0 <= c < len(self._rarity) else 1.0 for c in cat_all]
        else:
            nbr_feats = np.zeros((0, self._emb.shape[1]), dtype=np.float32)
            opd_ids, cat_ids, rarity = None, None, []

        graph = build_ego_graph(
            qfeat, nbr_feats, nbr_scores, relations,
            neighbor_opd_ids=opd_ids, neighbor_cat_ids=cat_ids,
            neighbor_rarity=rarity, add_self_loop=cfg.add_self_loop,
        )

        y_cat = int(self._catidv[qp]); y_opd = int(self._opdidv[qp])
        s = self._slav[qp]
        y_sla = int(s) if not np.isnan(s) else -1
        result = (graph, (y_cat, y_opd, y_sla))
        if cfg.cache_graphs:
            self._cache[query_id] = result
        return result

    def assemble_batch(self, query_ids: Sequence[str]) -> AssembledBatch:
        graphs, ycat, yopd, ysla = [], [], [], []
        for qid in map(str, query_ids):
            g, (yc, yo, ys) = self._assemble_one(qid)
            graphs.append(g)
            ycat.append(yc); yopd.append(yo); ysla.append(ys)

        nnpg = [int(g.n_node[0]) for g in graphs]
        nepg = [int(g.n_edge[0]) for g in graphs]
        pad_n = self.cfg.pad_nodes if self.cfg.pad_nodes else sum(nnpg) + 1
        pad_e = self.cfg.pad_edges if self.cfg.pad_edges else sum(nepg) + 1
        if pad_n <= sum(nnpg) or pad_e <= sum(nepg):   
            pad_n, pad_e = sum(nnpg) + 1, sum(nepg) + 1
        batched = batch_ego_graphs(graphs, pad_nodes=pad_n, pad_edges=pad_e)
        qidx = query_node_indices(nnpg)

        ycat = np.asarray(ycat, np.int32); yopd = np.asarray(yopd, np.int32); ysla = np.asarray(ysla, np.int32)
        labels = {"category": ycat, "opd": yopd, "sla": ysla}
        masks = {
            "category": (ycat >= 0).astype(np.float32),
            "opd": (yopd >= 0).astype(np.float32),
            "sla": (ysla >= 0).astype(np.float32),
        }
        return AssembledBatch(batched, qidx, labels, masks, nnpg, nepg)
