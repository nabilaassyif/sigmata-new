

from __future__ import annotations

from flax import nnx


def module_list(items):
    List = getattr(nnx, "List", None)
    return List(list(items)) if List is not None else list(items)


def pval(param):
    try:
        return param.value
    except Exception:
        return param[...]


def make_optimizer(model, tx):
    try:
        return nnx.Optimizer(model, tx, wrt=nnx.Param)
    except TypeError:
        return nnx.Optimizer(model, tx)


def opt_update(optimizer, model, grads) -> None:
    try:
        optimizer.update(model, grads)
    except TypeError:
        optimizer.update(grads)
