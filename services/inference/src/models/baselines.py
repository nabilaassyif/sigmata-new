

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence

import jax.numpy as jnp
import numpy as np
import optax
from flax import nnx

from src.evaluation.metrics import classification_metrics
from src.models import losses
from src.utils.nnx_compat import make_optimizer, opt_update, pval

logger = logging.getLogger(__name__)


def bret_predict(assembler, ids: Sequence[str], k: int = 10) -> Dict[str, Dict[str, np.ndarray]]:
    enc_cat, enc_opd = assembler.enc_cat, assembler.enc_opd
    df = assembler.df
    pred = {t: [] for t in ("category", "opd", "sla")}
    gold = {t: [] for t in ("category", "opd", "sla")}
    for qid in map(str, ids):
        pool = assembler.causal_pool(qid)
        retr = assembler.index.search(assembler.store.vector(qid), k=k, allowed_ids=pool)
        votes = {"category": {}, "opd": {}, "sla": {}}
        for cid, score in retr:
            row = df.loc[cid]
            for task, val in (
                ("category", enc_cat.transform_one(row["category"])),
                ("opd", enc_opd.transform_one(row["label_opd_final"])),
                ("sla", int(row["sla_breach_risk"]) if not _isnan(row.get("sla_breach_risk")) else -1),
            ):
                if val >= 0:
                    votes[task][val] = votes[task].get(val, 0.0) + float(score)
        for task in pred:
            pred[task].append(max(votes[task], key=votes[task].get) if votes[task] else 0)
        qrow = df.loc[qid]
        gold["category"].append(enc_cat.transform_one(qrow["category"]))
        gold["opd"].append(enc_opd.transform_one(qrow["label_opd_final"]))
        gold["sla"].append(int(qrow["sla_breach_risk"]) if not _isnan(qrow.get("sla_breach_risk")) else -1)
    return {
        "pred": {t: np.asarray(v) for t, v in pred.items()},
        "gold": {t: np.asarray(v) for t, v in gold.items()},
    }


def _isnan(x) -> bool:
    import pandas as pd
    return bool(pd.isna(x))


@dataclass
class BMemConfig:
    hidden: int = 256
    lr: float = 1e-3
    epochs: int = 30
    patience: int = 6
    batch_size: int = 128
    beta: float = 0.999
    gamma: float = 2.0
    k: int = 10
    seed: int = 42


class BMemMLP(nnx.Module):
    def __init__(self, in_dim: int, hidden: int, n_cat: int, n_opd: int, *, rngs: nnx.Rngs):
        self.l1 = nnx.Linear(in_dim, hidden, rngs=rngs)
        self.l2 = nnx.Linear(hidden, hidden, rngs=rngs)
        self.cat = nnx.Linear(hidden, n_cat, rngs=rngs)
        self.opd = nnx.Linear(hidden, n_opd, rngs=rngs)
        self.sla = nnx.Linear(hidden, 2, rngs=rngs)
        self.log_vars = nnx.Param(jnp.zeros((3,)))

    def __call__(self, x):
        h = nnx.relu(self.l1(x)); h = nnx.relu(self.l2(h))
        return {"category": self.cat(h), "opd": self.opd(h), "sla": self.sla(h)}


def bmem_features(assembler, ids: Sequence[str], k: int):
    D = assembler.store.dim
    X, yc, yo, ys = [], [], [], []
    for qid in map(str, ids):
        q = assembler.store.vector(qid)
        pool = assembler.causal_pool(qid)
        retr = assembler.index.search(q, k=k, allowed_ids=pool)
        if retr:
            feats = assembler.store.vectors_for([c for c, _ in retr])
            pooled_mean, pooled_max = feats.mean(0), feats.max(0)
        else:
            pooled_mean = pooled_max = np.zeros(D, np.float32)
        X.append(np.concatenate([q, pooled_mean, pooled_max]))
        row = assembler.df.loc[qid]
        yc.append(assembler.enc_cat.transform_one(row["category"]))
        yo.append(assembler.enc_opd.transform_one(row["label_opd_final"]))
        ys.append(int(row["sla_breach_risk"]) if not _isnan(row.get("sla_breach_risk")) else -1)
    return (np.asarray(X, np.float32),
            {"category": np.asarray(yc), "opd": np.asarray(yo), "sla": np.asarray(ys)})


def bmem_fit(assembler, train_ids, val_ids, n_cat, n_opd, cfg: Optional[BMemConfig] = None):
    cfg = cfg or BMemConfig()
    rng = np.random.default_rng(cfg.seed)
    Xtr, ytr = bmem_features(assembler, train_ids, cfg.k)
    model = BMemMLP(Xtr.shape[1], cfg.hidden, n_cat, n_opd, rngs=nnx.Rngs(cfg.seed))
    opt = make_optimizer(model, optax.adamw(cfg.lr))

    cc = _counts(ytr["category"], n_cat); co = _counts(ytr["opd"], n_opd)
    idx = np.arange(len(Xtr))
    best, best_state, patience = -1.0, None, 0
    for epoch in range(cfg.epochs):
        rng.shuffle(idx)
        for s in range(0, len(idx), cfg.batch_size):
            b = idx[s:s + cfg.batch_size]
            xb = jnp.asarray(Xtr[b])
            yb = {k: jnp.asarray(np.maximum(v[b], 0)) for k, v in ytr.items()}
            mb = {k: jnp.asarray((v[b] >= 0).astype(np.float32)) for k, v in ytr.items()}

            def loss_fn(m):
                o = m(xb)
                lc = losses.class_balanced_focal_loss(o["category"], yb["category"], cc, cfg.beta, cfg.gamma, mask=mb["category"])
                lo = losses.class_balanced_focal_loss(o["opd"], yb["opd"], co, cfg.beta, cfg.gamma, mask=mb["opd"])
                ls = losses.focal_loss(o["sla"], yb["sla"], gamma=cfg.gamma, mask=mb["sla"])
                return losses.uncertainty_weighted_sum([lc, lo, ls], pval(m.log_vars))

            _, grads = nnx.value_and_grad(loss_fn)(model)
            opt_update(opt, model, grads)

        vm = bmem_evaluate(model, assembler, val_ids, cfg.k)
        f1 = vm["category_macro_f1"]
        if f1 > best:
            best, patience = f1, 0
            best_state = nnx.state(model)
        else:
            patience += 1
            if patience >= cfg.patience:
                break
    if best_state is not None:
        nnx.update(model, best_state)
    return model, {"best_val_macro_f1": best}


def bmem_predict(model, assembler, ids, k: int):
    X, y = bmem_features(assembler, ids, k)
    out = model(jnp.asarray(X))
    return {
        "pred": {t: np.asarray(out[t]).argmax(-1) for t in ("category", "opd", "sla")},
        "gold": y,
    }


def bmem_evaluate(model, assembler, ids, k: int) -> Dict[str, float]:
    r = bmem_predict(model, assembler, ids, k)
    m: Dict[str, float] = {}
    for t in ("category", "opd", "sla"):
        m.update(classification_metrics(r["gold"][t], r["pred"][t], prefix=t))
    return m


def _counts(labels, n):
    arr = np.asarray([l for l in labels if l >= 0], dtype=np.int64)
    return jnp.asarray(np.maximum(np.bincount(arr, minlength=n)[:n], 1), dtype=jnp.float32)
