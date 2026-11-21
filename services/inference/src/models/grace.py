

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import jax.numpy as jnp
import jraph
from flax import nnx

from src.models.hetero_gat import GatedGATLayer, NodeEncoder
from src.utils.nnx_compat import module_list


@dataclass
class GraceConfig:

    in_dim: int = 768           
    hidden: int = 256
    num_layers: int = 2
    num_category: int = 301
    num_opd: int = 131
    num_sla: int = 2
    dropout: float = 0.3
    use_confidence_gate: bool = False   
    use_cbrmp: bool = False             


class GRACE(nnx.Module):

    def __init__(self, cfg: GraceConfig, *, rngs: nnx.Rngs):
        self.cfg = cfg
        self.encoder = NodeEncoder(
            cfg.in_dim, cfg.hidden, cfg.num_opd, cfg.num_category, rngs=rngs
        )
        self.layers = module_list([
            GatedGATLayer(cfg.hidden, use_confidence_gate=cfg.use_confidence_gate,
                          use_cbrmp=cfg.use_cbrmp, rngs=rngs)
            for _ in range(cfg.num_layers)
        ])
        self.dropout = nnx.Dropout(cfg.dropout, rngs=rngs)


        head_in = cfg.hidden + cfg.in_dim
        self.trunk = nnx.Linear(head_in, cfg.hidden, rngs=rngs)
        self.cat_head = nnx.Linear(cfg.hidden, cfg.num_category, rngs=rngs)
        self.opd_head = nnx.Linear(cfg.hidden, cfg.num_opd, rngs=rngs)
        self.sla_head = nnx.Linear(cfg.hidden, cfg.num_sla, rngs=rngs)

        self.log_vars = nnx.Param(jnp.zeros((3,)))

    def __call__(
        self,
        graph: jraph.GraphsTuple,
        query_idx: jnp.ndarray,
        *,
        train: bool = False,
    ) -> Dict[str, jnp.ndarray]:
        nodes = graph.nodes
        num_nodes = nodes["feat"].shape[0]
        h = self.encoder(nodes["feat"], nodes["type"], nodes["node_id"])
        for layer in self.layers:
            h = layer(h, graph.senders, graph.receivers,
                      graph.edges["type"], graph.edges["score"], graph.edges["rarity"], num_nodes)
            h = self.dropout(h, deterministic=not train)
        hq = h[query_idx]                                    
        q_raw = nodes["feat"][query_idx]                     
        readout = jnp.concatenate([hq, q_raw], axis=-1)      
        z = nnx.relu(self.trunk(readout))                    
        z = self.dropout(z, deterministic=not train)
        return {
            "category": self.cat_head(z),
            "opd": self.opd_head(z),
            "sla": self.sla_head(z),
        }
