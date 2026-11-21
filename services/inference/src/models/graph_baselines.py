

from __future__ import annotations

from dataclasses import dataclass

import jax
import jax.numpy as jnp
import jraph
from flax import nnx

from src.utils.nnx_compat import module_list


@dataclass
class GraphBaselineConfig:
    in_dim: int = 768
    hidden: int = 256
    num_layers: int = 2
    num_category: int = 301
    num_opd: int = 131
    num_sla: int = 2
    dropout: float = 0.3
    conv_type: str = "gcn"        


class _ConvLayer(nnx.Module):
    def __init__(self, hidden: int, conv_type: str, *, rngs: nnx.Rngs):
        self.conv_type = conv_type
        self.w_self = nnx.Linear(hidden, hidden, rngs=rngs)
        self.w_neigh = nnx.Linear(hidden, hidden, rngs=rngs)
        if conv_type == "gat":
            self.a_src = nnx.Linear(hidden, 1, use_bias=False, rngs=rngs)
            self.a_dst = nnx.Linear(hidden, 1, use_bias=False, rngs=rngs)

    def __call__(self, h, senders, receivers, num_nodes):
        if self.conv_type == "gat":
            wh = self.w_neigh(h)
            logit = self.a_src(wh)[senders][:, 0] + self.a_dst(wh)[receivers][:, 0]
            logit = jax.nn.leaky_relu(logit, 0.2)
            alpha = jraph.segment_softmax(logit, receivers, num_segments=num_nodes)
            agg = jraph.segment_sum(alpha[:, None] * wh[senders], receivers, num_segments=num_nodes)
            return jax.nn.elu(self.w_self(h) + agg)

        agg = jraph.segment_mean(h[senders], receivers, num_segments=num_nodes)
        return jax.nn.elu(self.w_self(h) + self.w_neigh(agg))


class GraphBaseline(nnx.Module):

    def __init__(self, cfg: GraphBaselineConfig, *, rngs: nnx.Rngs):
        self.cfg = cfg
        self.proj = nnx.Linear(cfg.in_dim, cfg.hidden, rngs=rngs)
        self.layers = module_list([_ConvLayer(cfg.hidden, cfg.conv_type, rngs=rngs)
                                   for _ in range(cfg.num_layers)])
        self.dropout = nnx.Dropout(cfg.dropout, rngs=rngs)
        self.cat_head = nnx.Linear(cfg.hidden, cfg.num_category, rngs=rngs)
        self.opd_head = nnx.Linear(cfg.hidden, cfg.num_opd, rngs=rngs)
        self.sla_head = nnx.Linear(cfg.hidden, cfg.num_sla, rngs=rngs)
        self.log_vars = nnx.Param(jnp.zeros((3,)))

    def __call__(self, graph, query_idx, *, train: bool = False):
        num_nodes = graph.nodes["feat"].shape[0]
        h = self.proj(graph.nodes["feat"])          
        for layer in self.layers:
            h = layer(h, graph.senders, graph.receivers, num_nodes)
            h = self.dropout(h, deterministic=not train)
        hq = h[query_idx]
        return {"category": self.cat_head(hq), "opd": self.opd_head(hq), "sla": self.sla_head(hq)}
