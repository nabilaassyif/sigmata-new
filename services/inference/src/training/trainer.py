

from __future__ import annotations

import json
import logging
import math
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import jax.numpy as jnp
import numpy as np
import optax
import orbax.checkpoint as ocp
from flax import nnx

from src.evaluation.metrics import classification_metrics
from src.models import losses
from src.utils.nnx_compat import make_optimizer, opt_update, pval

logger = logging.getLogger(__name__)


@dataclass
class TrainConfig:
    lr: float = 1e-3
    epochs: int = 30
    batch_size: int = 128
    patience: int = 6
    beta: float = 0.999          
    gamma: float = 2.0           
    seed: int = 42
    ckpt_dir: Optional[str] = None
    tasks: tuple = ("category", "opd", "sla")   


def class_counts(labels: Sequence[int], num_classes: int) -> jnp.ndarray:
    arr = np.asarray([l for l in labels if l >= 0], dtype=np.int64)
    counts = np.bincount(arr, minlength=num_classes)[:num_classes]
    return jnp.asarray(np.maximum(counts, 1), dtype=jnp.float32)


_TASKS = ("category", "opd", "sla")


def _fixed_batch(assembler, chunk: Sequence[str], bs: int):

    chunk = list(chunk)
    n_real = len(chunk)
    if n_real == 0:
        return None
    if n_real < bs:
        chunk = chunk + [chunk[0]] * (bs - n_real)
    ab = assembler.assemble_batch(chunk)
    qidx = jnp.asarray(ab.query_idx)
    y = {k: jnp.asarray(np.maximum(ab.labels[k], 0)) for k in _TASKS}
    mask = {}
    for k in _TASKS:
        mk = ab.masks[k].astype(np.float32).copy()
        if n_real < bs:
            mk[n_real:] = 0.0
        mask[k] = jnp.asarray(mk)
    return ab.graph, qidx, y, mask, n_real, ab.labels


def _make_train_step(counts_cat, counts_opd, cfg, tasks, task_idx, jit: bool = True):
    def step(model, optimizer, graph, qidx, yc, yo, ys, mc, mo, ms):
        def loss_fn(m):
            out = m(graph, qidx, train=True)
            tl = {
                "category": losses.class_balanced_focal_loss(out["category"], yc, counts_cat, cfg.beta, cfg.gamma, mask=mc),
                "opd": losses.class_balanced_focal_loss(out["opd"], yo, counts_opd, cfg.beta, cfg.gamma, mask=mo),
                "sla": losses.focal_loss(out["sla"], ys, gamma=cfg.gamma, mask=ms),
            }
            return losses.uncertainty_weighted_sum([tl[t] for t in tasks], pval(m.log_vars)[task_idx])
        loss, grads = nnx.value_and_grad(loss_fn)(model)
        opt_update(optimizer, model, grads)
        return loss
    return nnx.jit(step) if jit else step


def _make_forward(jit: bool = True):
    def fwd(model, graph, qidx):
        return model(graph, qidx, train=False)
    return nnx.jit(fwd) if jit else fwd


def train_epoch(model, optimizer, assembler, train_ids, cfg, rng, step_fn) -> float:
    ids = list(map(str, train_ids))
    rng.shuffle(ids)
    total, nb = 0.0, 0
    for start in range(0, len(ids), cfg.batch_size):
        fb = _fixed_batch(assembler, ids[start:start + cfg.batch_size], cfg.batch_size)
        if fb is None:
            continue
        graph, qidx, y, m, _, _ = fb
        loss = step_fn(model, optimizer, graph, qidx,
                       y["category"], y["opd"], y["sla"], m["category"], m["opd"], m["sla"])
        total += float(loss); nb += 1
    return total / max(nb, 1)


def predict(model, assembler, ids: Sequence[str], batch_size: int = 128,
            with_proba: bool = False, fwd=None) -> Dict[str, np.ndarray]:


    import jax
    if fwd is None:
        fwd = _make_forward(jit=False)
    ids = list(map(str, ids))
    preds = {k: [] for k in _TASKS}
    golds = {k: [] for k in _TASKS}
    probs = {k: [] for k in _TASKS}
    for start in range(0, len(ids), batch_size):
        fb = _fixed_batch(assembler, ids[start:start + batch_size], batch_size)
        if fb is None:
            continue
        graph, qidx, _, _, n_real, raw = fb
        out = fwd(model, graph, qidx)
        for k in _TASKS:
            logits = np.asarray(out[k])[:n_real]
            preds[k].append(logits.argmax(-1))
            golds[k].append(raw[k][:n_real])
            if with_proba:
                probs[k].append(np.asarray(jax.nn.softmax(out[k], axis=-1))[:n_real])
    result = {
        "pred": {k: np.concatenate(v) for k, v in preds.items()},
        "gold": {k: np.concatenate(v) for k, v in golds.items()},
    }
    if with_proba:
        result["proba"] = {k: np.concatenate(v) for k, v in probs.items()}
    return result


def evaluate(model, assembler, ids: Sequence[str], batch_size: int = 128, fwd=None) -> Dict[str, float]:
    r = predict(model, assembler, ids, batch_size, fwd=fwd)
    metrics: Dict[str, float] = {}
    for task in _TASKS:
        metrics.update(classification_metrics(r["gold"][task], r["pred"][task], prefix=task))
    return metrics


def save_checkpoint(model, path: str) -> str:
    p = Path(path).resolve()
    if p.exists():
        shutil.rmtree(p)
    ckptr = ocp.StandardCheckpointer()
    ckptr.save(p, nnx.state(model))
    ckptr.wait_until_finished()
    return str(p)


def load_checkpoint(template_model, path: str):
    p = Path(path).resolve()
    ckptr = ocp.StandardCheckpointer()
    restored = ckptr.restore(p, nnx.state(template_model))
    nnx.update(template_model, restored)
    return template_model


def save_resume_state(optimizer, meta: Dict, path: str) -> None:
    p = Path(path).resolve()
    state_dir = p / "optstate"
    if state_dir.exists():
        shutil.rmtree(state_dir)
    ckptr = ocp.StandardCheckpointer()
    ckptr.save(state_dir, nnx.state(optimizer))
    ckptr.wait_until_finished()
    (p / "resume_meta.json").write_text(json.dumps(meta), encoding="utf-8")


def load_resume_state(optimizer, path: str) -> Optional[Dict]:
    p = Path(path).resolve()
    state_dir = p / "optstate"
    meta_path = p / "resume_meta.json"
    if not state_dir.exists() or not meta_path.exists():
        return None
    ckptr = ocp.StandardCheckpointer()
    restored = ckptr.restore(state_dir, nnx.state(optimizer))
    nnx.update(optimizer, restored)
    return json.loads(meta_path.read_text(encoding="utf-8"))


def fit(model, assembler, train_ids, val_ids, num_category, num_opd,
        cfg: Optional[TrainConfig] = None, notifier=None, resume_dir: Optional[str] = None):


    cfg = cfg or TrainConfig()
    rng = np.random.default_rng(cfg.seed)
    optimizer = make_optimizer(model, optax.adamw(cfg.lr))

    tr = list(map(str, train_ids))
    counts_cat = class_counts(assembler.enc_cat.transform(assembler.df.loc[tr]["category"].tolist()), num_category)
    counts_opd = class_counts(assembler.enc_opd.transform(assembler.df.loc[tr]["label_opd_final"].tolist()), num_opd)


    tasks = tuple(t for t in _TASKS if t in cfg.tasks)
    task_idx = jnp.asarray([_TASKS.index(t) for t in tasks])
    step_fn = _make_train_step(counts_cat, counts_opd, cfg, tasks, task_idx, jit=True)
    fwd_fn = _make_forward(jit=True)
    try:
        _probe = _fixed_batch(assembler, list(map(str, train_ids))[:cfg.batch_size], cfg.batch_size)
        if _probe is not None:
            g, q, y, m, _, _ = _probe
            step_fn(model, optimizer, g, q, y["category"], y["opd"], y["sla"],
                    m["category"], m["opd"], m["sla"])
        logger.info("JIT train step compiled OK.")
    except Exception as exc:
        logger.warning("JIT unavailable (%s) -> non-jit fallback (slower).", str(exc)[:200])
        step_fn = _make_train_step(counts_cat, counts_opd, cfg, tasks, task_idx, jit=False)
        fwd_fn = _make_forward(jit=False)

    best_f1, best_epoch, patience, start_epoch = -1.0, -1, 0, 0
    history: List[Dict] = []
    if resume_dir:
        meta = load_resume_state(optimizer, resume_dir)
        if meta:
            start_epoch = int(meta.get("epoch", -1)) + 1
            best_f1 = float(meta.get("best_f1", -1.0))
            best_epoch = int(meta.get("best_epoch", -1))
            history = meta.get("history", [])
            logger.info("resumed at epoch %d (best %.4f)", start_epoch, best_f1)

    t0 = time.time()
    best_state = None      
    if notifier:
        notifier.notify_start(f"epochs={cfg.epochs} patience={cfg.patience} lr={cfg.lr} seed={cfg.seed}")
    try:
        for epoch in range(start_epoch, cfg.epochs):
            te = time.time()
            loss = train_epoch(model, optimizer, assembler, train_ids, cfg, rng, step_fn)
            if not math.isfinite(loss):
                logger.error("non-finite loss at epoch %d", epoch)
                if notifier:
                    notifier.notify_nan(epoch)
                raise FloatingPointError(f"NaN/Inf loss at epoch {epoch}")

            val = evaluate(model, assembler, val_ids, cfg.batch_size, fwd=fwd_fn)
            f1 = val["category_macro_f1"]
            history.append({"epoch": epoch, "loss": loss,
                            "val_category_macro_f1": f1, "val_opd_macro_f1": val["opd_macro_f1"]})

            print(f"[fit] epoch {epoch} | {time.time()-te:.1f}s | loss {loss:.4f} | "
                  f"val cat-F1 {f1:.4f}", flush=True)

            if f1 > best_f1:
                best_f1, best_epoch, patience = f1, epoch, 0
                best_state = nnx.state(model)      
            else:
                patience += 1


            if resume_dir and (epoch % 10 == 0):
                save_resume_state(optimizer, {"epoch": epoch, "best_f1": best_f1,
                                              "best_epoch": best_epoch, "history": history}, resume_dir)
            if patience >= cfg.patience:
                logger.info("early stop at epoch %d (best %.4f @ %d)", epoch, best_f1, best_epoch)
                break


        if best_state is not None:
            nnx.update(model, best_state)
        if cfg.ckpt_dir and best_state is not None:
            save_checkpoint(model, cfg.ckpt_dir)
            if notifier:
                notifier.notify_best_checkpoint(best_epoch, {"category_macro_f1": best_f1}, cfg.ckpt_dir)
    except (MemoryError, RuntimeError) as exc:
        if "RESOURCE_EXHAUSTED" in str(exc) or "out of memory" in str(exc).lower() or isinstance(exc, MemoryError):
            if notifier:
                notifier.notify_oom(str(exc)[:300])
        if notifier:
            notifier.notify_failure(str(exc)[:300])
        raise
    except Exception as exc:
        if notifier:
            notifier.notify_failure(str(exc)[:300])
        raise

    runtime = time.time() - t0
    summary = {"best_val_macro_f1": best_f1, "best_epoch": best_epoch,
               "runtime_seconds": round(runtime, 1), "history": history}
    if notifier:
        notifier.notify_success(f"best cat Macro-F1={best_f1:.4f} @ epoch {best_epoch}, "
                                f"runtime={runtime/60:.1f} min")
    return summary
