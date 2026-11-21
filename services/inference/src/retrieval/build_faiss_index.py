

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from src.embeddings.cache import EmbeddingStore, load_embeddings
from src.retrieval.semantic_index import SemanticIndex

logger = logging.getLogger(__name__)


@dataclass
class IndexConfig:

    backend: str = "auto"            
    rare_support: int = 5
    id_col: str = "complaintID"


def build_spatial(meta: pd.DataFrame, out_dir: Path) -> Dict:
    ids = meta["complaintID"].astype(str).to_numpy()
    lat = pd.to_numeric(meta.get("lat"), errors="coerce").to_numpy(dtype=np.float64)
    lng = pd.to_numeric(meta.get("lng"), errors="coerce").to_numpy(dtype=np.float64)
    geo_valid = (
        meta["geo_valid"].astype(bool).to_numpy()
        if "geo_valid" in meta.columns
        else np.isfinite(lat) & np.isfinite(lng)
    )
    np.savez(
        Path(out_dir) / "spatial.npz",
        ids=ids, lat=lat, lng=lng, geo_valid=geo_valid,
    )
    n_valid = int(geo_valid.sum())
    logger.info("Spatial: %d/%d geo-valid coordinates saved.", n_valid, len(ids))
    return {"n_geo_valid": n_valid, "n_total": int(len(ids))}


def build_inverted_lists(
    meta: pd.DataFrame,
    train_ids: List[str],
    out_dir: Path,
    cfg: IndexConfig,
) -> Dict:
    train_set = set(train_ids)
    train_meta = meta[meta[cfg.id_col].astype(str).isin(train_set)]

    def _lists(field: str) -> Dict[str, List[str]]:
        out: Dict[str, List[str]] = {}
        if field not in train_meta.columns:
            return out
        for label, grp in train_meta.groupby(field):
            label = str(label)
            if label == "" or label.lower() == "nan":
                continue
            out[label] = grp[cfg.id_col].astype(str).tolist()
        return out

    inverted = {"category": _lists("category"), "opd": _lists("label_opd_final")}
    rare = {
        "category": [lbl for lbl, v in inverted["category"].items() if len(v) < cfg.rare_support],
        "opd": [lbl for lbl, v in inverted["opd"].items() if len(v) < cfg.rare_support],
    }
    payload = {
        "inverted_lists": inverted,
        "rare_labels": rare,
        "n_train": len(train_set),
        "note": "Train-only. Used for class-balanced rare-exemplar retrieval.",
    }
    (Path(out_dir) / "inverted_lists.json").write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8"
    )
    logger.info(
        "Inverted lists: %d categories (%d rare), %d OPDs (%d rare).",
        len(inverted["category"]), len(rare["category"]),
        len(inverted["opd"]), len(rare["opd"]),
    )
    return {
        "n_categories": len(inverted["category"]),
        "n_opds": len(inverted["opd"]),
        "n_rare_categories": len(rare["category"]),
        "n_rare_opds": len(rare["opd"]),
    }


def _load_meta(emb_dir: Path) -> pd.DataFrame:
    emb_dir = Path(emb_dir)
    pq = emb_dir / "meta.parquet"
    csv = emb_dir / "meta.csv"
    if pq.exists():
        return pd.read_parquet(pq)
    if csv.exists():
        return pd.read_csv(csv)
    raise FileNotFoundError(f"No meta.parquet/meta.csv in {emb_dir}.")


def _train_ids_from_split(split_path: Optional[Path]) -> Optional[List[str]]:
    if split_path is None:
        return None
    data = json.loads(Path(split_path).read_text(encoding="utf-8"))
    return [str(x) for x in data.get("train_ids", [])]


def build_indices(
    emb_dir: Path,
    out_dir: Path,
    split_path: Optional[Path] = None,
    cfg: Optional[IndexConfig] = None,
) -> Dict:
    cfg = cfg or IndexConfig()
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    ids, emb, emb_manifest = load_embeddings(Path(emb_dir))
    meta = _load_meta(Path(emb_dir))


    sem = SemanticIndex(ids=ids, embeddings=emb, backend=cfg.backend)
    sem.save(out_dir)


    spatial_summary = build_spatial(meta, out_dir)


    train_ids = _train_ids_from_split(split_path)
    if train_ids is None:
        logger.warning(
            "No split_path given; inverted lists built over ALL ids. "
            "This is leakage-unsafe -- pass --split_path for real runs."
        )
        train_ids = [str(c) for c in ids]
    inv_summary = build_inverted_lists(meta, train_ids, out_dir, cfg)

    manifest = {
        "embedding_manifest": emb_manifest,
        "semantic_backend": sem.backend,
        "n_vectors": len(ids),
        "dim": sem.dim,
        "split_path": str(split_path) if split_path else None,
        "spatial": spatial_summary,
        "inverted": inv_summary,
        "config": asdict(cfg),
        "leakage_note": (
            "Semantic index spans all rows; train-only + causal (timestamp<query) "
            "filtering is enforced at query time via allowed_ids."
        ),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    logger.info("Retrieval artifacts written -> %s", out_dir)
    return manifest
