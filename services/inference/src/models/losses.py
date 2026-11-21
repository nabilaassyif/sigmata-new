

from __future__ import annotations

from typing import Optional, Sequence

import jax
import jax.numpy as jnp


def _masked_mean(per_example: jnp.ndarray, mask: Optional[jnp.ndarray]) -> jnp.ndarray:
    if mask is None:
        return per_example.mean()
    mask = mask.astype(per_example.dtype)
    return (per_example * mask).sum() / jnp.clip(mask.sum(), 1.0)


def cross_entropy(
    logits: jnp.ndarray,
    labels: jnp.ndarray,
    mask: Optional[jnp.ndarray] = None,
) -> jnp.ndarray:
    logp = jax.nn.log_softmax(logits, axis=-1)
    nll = -jnp.take_along_axis(logp, labels[:, None], axis=-1)[:, 0]
    return _masked_mean(nll, mask)


def weighted_cross_entropy(
    logits: jnp.ndarray,
    labels: jnp.ndarray,
    class_weights: jnp.ndarray,
    mask: Optional[jnp.ndarray] = None,
) -> jnp.ndarray:
    logp = jax.nn.log_softmax(logits, axis=-1)
    nll = -jnp.take_along_axis(logp, labels[:, None], axis=-1)[:, 0]
    w = class_weights[labels]
    return _masked_mean(nll * w, mask)


def focal_loss(
    logits: jnp.ndarray,
    labels: jnp.ndarray,
    gamma: float = 2.0,
    class_weights: Optional[jnp.ndarray] = None,
    mask: Optional[jnp.ndarray] = None,
) -> jnp.ndarray:
    logp = jax.nn.log_softmax(logits, axis=-1)
    logp_t = jnp.take_along_axis(logp, labels[:, None], axis=-1)[:, 0]
    p_t = jnp.exp(logp_t)
    loss = -((1.0 - p_t) ** gamma) * logp_t
    if class_weights is not None:
        loss = loss * class_weights[labels]
    return _masked_mean(loss, mask)


def effective_number_weights(
    class_counts: jnp.ndarray,
    beta: float = 0.999,
    normalize: bool = True,
) -> jnp.ndarray:
    counts = jnp.asarray(class_counts, dtype=jnp.float32)
    eff_num = 1.0 - jnp.power(beta, jnp.maximum(counts, 1.0))
    weights = (1.0 - beta) / eff_num
    if normalize:
        weights = weights * (len(counts) / jnp.sum(weights))
    return weights


def class_balanced_focal_loss(
    logits: jnp.ndarray,
    labels: jnp.ndarray,
    class_counts: jnp.ndarray,
    beta: float = 0.999,
    gamma: float = 2.0,
    mask: Optional[jnp.ndarray] = None,
) -> jnp.ndarray:


    weights = effective_number_weights(class_counts, beta=beta)
    return focal_loss(logits, labels, gamma=gamma, class_weights=weights, mask=mask)


def uncertainty_weighted_sum(
    losses: Sequence[jnp.ndarray],
    log_vars: jnp.ndarray,
) -> jnp.ndarray:


    stacked = jnp.stack(list(losses))
    precision = jnp.exp(-log_vars)
    return jnp.sum(precision * stacked + log_vars)
