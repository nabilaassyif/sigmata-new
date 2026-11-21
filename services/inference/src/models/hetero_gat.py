

from __future__ import annotations

import jax
import jax.numpy as jnp
import jraph
from flax import nnx

from src.graph.ego_graph import NODE_TYPES, NUM_EDGE_TYPES
from src.utils.nnx_compat import pval

_EPS = 1e-9


class NodeEncoder(nnx.Module):


    def __init__(self, in_dim: int, hidden: int, num_opd: int, num_cat: int, *, rngs: nnx.Rngs):
        self.proj = nnx.Linear(in_dim, hidden, rngs=rngs)
        self.opd_embed = nnx.Embed(num_opd, hidden, rngs=rngs)
        self.cat_embed = nnx.Embed(num_cat, hidden, rngs=rngs)
        self.hidden = hidden

    def __call__(self, feat, ntype, node_id):
        complaint_h = self.proj(feat)
        safe_id = jnp.clip(node_id, 0, None)        
        opd_h = self.opd_embed(safe_id)
        cat_h = self.cat_embed(safe_id)
        h = jnp.where((ntype == NODE_TYPES["opd"])[:, None], opd_h, complaint_h)
        h = jnp.where((ntype == NODE_TYPES["category"])[:, None], cat_h, h)
        return h


class GatedGATLayer(nnx.Module):


    def __init__(self, hidden: int, *, use_confidence_gate: bool = False,
                 use_cbrmp: bool = False, rngs: nnx.Rngs):
        self.use_confidence_gate = use_confidence_gate
        self.use_cbrmp = use_cbrmp
        self.w_msg = nnx.Linear(hidden, hidden, use_bias=False, rngs=rngs)
        self.w_self = nnx.Linear(hidden, hidden, rngs=rngs)
        self.attn_src = nnx.Linear(hidden, 1, use_bias=False, rngs=rngs)
        self.attn_dst = nnx.Linear(hidden, 1, use_bias=False, rngs=rngs)
        self.rel_bias = nnx.Param(jnp.zeros((NUM_EDGE_TYPES,)))

        self.gate = nnx.Linear(2 * hidden + 1, 1,
                               bias_init=jax.nn.initializers.constant(3.0), rngs=rngs)

        self.cb_scale = nnx.Param(jnp.zeros(()))

    def __call__(self, h, senders, receivers, etype, escore, erarity, num_nodes):
        wh = self.w_msg(h)                                   
        logit = jax.nn.leaky_relu(
            self.attn_src(wh)[senders][:, 0]
            + self.attn_dst(wh)[receivers][:, 0]
            + pval(self.rel_bias)[etype],
            negative_slope=0.2,
        )
        if self.use_cbrmp:                                    


            logit = logit + pval(self.cb_scale) * jnp.log(erarity + _EPS)
        alpha = jraph.segment_softmax(logit, receivers, num_segments=num_nodes)
        messages = alpha[:, None] * wh[senders]

        if self.use_confidence_gate:                          
            gate_in = jnp.concatenate([wh[senders], wh[receivers], escore[:, None]], axis=-1)
            g = jax.nn.sigmoid(self.gate(gate_in))            
            messages = messages * g

        agg = jraph.segment_sum(messages, receivers, num_segments=num_nodes)
        return jax.nn.elu(self.w_self(h) + agg)
