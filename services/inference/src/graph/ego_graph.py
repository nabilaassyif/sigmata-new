

from __future__ import annotations

from typing import Dict, List, Optional, Sequence

import jax.numpy as jnp
import jraph
import numpy as np

NODE_TYPES: Dict[str, int] = {"complaint": 0, "opd": 1, "category": 2, "location": 3}
EDGE_TYPES: Dict[str, int] = {
    "semantic": 0,
    "spatial": 1,
    "temporal": 2,
    "same_source": 3,
    "same_jenis": 4,
    "reported_to_opd": 5,
    "has_category": 6,
    "self": 7,
}
NUM_NODE_TYPES = len(NODE_TYPES)
NUM_EDGE_TYPES = len(EDGE_TYPES)


def build_ego_graph(
    query_feat: np.ndarray,
    neighbor_feats: np.ndarray,
    neighbor_scores: Sequence[float],
    neighbor_relations: Sequence[int],
    neighbor_opd_ids: Optional[Sequence[int]] = None,
    neighbor_cat_ids: Optional[Sequence[int]] = None,
    neighbor_rarity: Optional[Sequence[float]] = None,
    add_self_loop: bool = True,
) -> jraph.GraphsTuple:


    query_feat = np.asarray(query_feat, dtype=np.float32).reshape(-1)
    D = query_feat.shape[0]
    neighbor_feats = np.asarray(neighbor_feats, dtype=np.float32).reshape(-1, D)
    K = neighbor_feats.shape[0]

    feats: List[np.ndarray] = [query_feat]
    types: List[int] = [NODE_TYPES["complaint"]]
    node_ids: List[int] = [-1]
    senders: List[int] = []
    receivers: List[int] = []
    e_types: List[int] = []
    e_scores: List[float] = []
    e_rarity: List[float] = []


    for i in range(K):
        pos = len(feats)
        feats.append(neighbor_feats[i])
        types.append(NODE_TYPES["complaint"])
        node_ids.append(-1)
        senders.append(pos)
        receivers.append(0)
        e_types.append(int(neighbor_relations[i]))
        e_scores.append(float(neighbor_scores[i]))
        e_rarity.append(float(neighbor_rarity[i]) if neighbor_rarity is not None else 1.0)


    def _add_label_nodes(ids: Optional[Sequence[int]], ntype: str, etype: str) -> None:
        if ids is None:
            return
        seen: Dict[int, int] = {}
        for i in range(K):
            lid = int(ids[i])
            if lid < 0:
                continue
            if lid not in seen:
                pos = len(feats)
                feats.append(np.zeros(D, dtype=np.float32))
                types.append(NODE_TYPES[ntype])
                node_ids.append(lid)
                seen[lid] = pos
            neighbor_pos = 1 + i  
            senders.append(neighbor_pos)
            receivers.append(seen[lid])
            e_types.append(EDGE_TYPES[etype])
            e_scores.append(1.0)
            e_rarity.append(1.0)

    _add_label_nodes(neighbor_opd_ids, "opd", "reported_to_opd")
    _add_label_nodes(neighbor_cat_ids, "category", "has_category")

    if add_self_loop:
        senders.append(0)
        receivers.append(0)
        e_types.append(EDGE_TYPES["self"])
        e_scores.append(1.0)
        e_rarity.append(1.0)

    n_node = len(feats)
    n_edge = len(senders)
    nodes = {
        "feat": np.stack(feats).astype(np.float32),
        "type": np.asarray(types, dtype=np.int32),
        "node_id": np.asarray(node_ids, dtype=np.int32),
    }
    edges = {
        "type": np.asarray(e_types, dtype=np.int32),
        "score": np.asarray(e_scores, dtype=np.float32),
        "rarity": np.asarray(e_rarity, dtype=np.float32),
    }
    return jraph.GraphsTuple(
        nodes=nodes,
        edges=edges,
        senders=np.asarray(senders, dtype=np.int32),
        receivers=np.asarray(receivers, dtype=np.int32),
        globals={"n_node": np.asarray([n_node], dtype=np.int32)},
        n_node=np.asarray([n_node], dtype=np.int32),
        n_edge=np.asarray([n_edge], dtype=np.int32),
    )


def batch_ego_graphs(
    graphs: Sequence[jraph.GraphsTuple],
    pad_nodes: int,
    pad_edges: int,
) -> jraph.GraphsTuple:


    graphs = list(graphs)
    per_n = [int(g.n_node[0]) for g in graphs]
    per_e = [int(g.n_edge[0]) for g in graphs]
    total_n, total_e = sum(per_n), sum(per_e)
    if pad_nodes <= total_n:
        pad_nodes = total_n + 1
    if pad_edges < total_e:
        pad_edges = total_e + 1
    D = int(graphs[0].nodes["feat"].shape[1])

    feat = np.zeros((pad_nodes, D), dtype=np.float32)
    typ = np.zeros(pad_nodes, dtype=np.int32)
    nid = np.full(pad_nodes, -1, dtype=np.int32)
    et = np.full(pad_edges, EDGE_TYPES["self"], dtype=np.int32)
    es = np.zeros(pad_edges, dtype=np.float32)
    er = np.ones(pad_edges, dtype=np.float32)
    sd = np.full(pad_edges, total_n, dtype=np.int32)     
    rv = np.full(pad_edges, total_n, dtype=np.int32)

    npos = epos = 0
    for g, n, e in zip(graphs, per_n, per_e):
        feat[npos:npos + n] = g.nodes["feat"]
        typ[npos:npos + n] = g.nodes["type"]
        nid[npos:npos + n] = g.nodes["node_id"]
        et[epos:epos + e] = g.edges["type"]
        es[epos:epos + e] = g.edges["score"]
        er[epos:epos + e] = g.edges["rarity"]
        sd[epos:epos + e] = g.senders + npos
        rv[epos:epos + e] = g.receivers + npos
        npos += n; epos += e

    return jraph.GraphsTuple(
        nodes={"feat": feat, "type": typ, "node_id": nid},
        edges={"type": et, "score": es, "rarity": er},
        senders=sd, receivers=rv,
        globals={"n_node": np.asarray([pad_nodes], dtype=np.int32)},
        n_node=np.asarray(per_n + [pad_nodes - total_n], dtype=np.int32),
        n_edge=np.asarray(per_e + [pad_edges - total_e], dtype=np.int32),
    )


def query_node_indices(n_node_per_graph: Sequence[int]) -> np.ndarray:
    offsets = np.cumsum(np.asarray([0, *n_node_per_graph[:-1]]))
    return offsets.astype(np.int32)
