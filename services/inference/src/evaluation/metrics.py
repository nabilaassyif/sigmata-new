

from __future__ import annotations

from typing import Dict, Optional, Sequence

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
    precision_score,
    recall_score,
)


def _valid(y_true: np.ndarray, y_pred: np.ndarray):
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    keep = y_true >= 0
    return y_true[keep], y_pred[keep]


def classification_metrics(
    y_true: Sequence[int],
    y_pred: Sequence[int],
    prefix: str = "",
) -> Dict[str, float]:
    yt, yp = _valid(y_true, y_pred)
    p = f"{prefix}_" if prefix else ""
    if yt.size == 0:
        keys = ["accuracy", "balanced_accuracy", "macro_f1", "weighted_f1",
                "macro_precision", "macro_recall", "n"]
        return {f"{p}{k}": 0.0 for k in keys}
    return {
        f"{p}accuracy": float(accuracy_score(yt, yp)),
        f"{p}balanced_accuracy": float(balanced_accuracy_score(yt, yp)),
        f"{p}macro_f1": float(f1_score(yt, yp, average="macro", zero_division=0)),
        f"{p}weighted_f1": float(f1_score(yt, yp, average="weighted", zero_division=0)),
        f"{p}macro_precision": float(precision_score(yt, yp, average="macro", zero_division=0)),
        f"{p}macro_recall": float(recall_score(yt, yp, average="macro", zero_division=0)),
        f"{p}n": int(yt.size),
    }


def bucket_f1(
    y_true: Sequence[int],
    y_pred: Sequence[int],
    bucket_of_class: Dict[int, str],
    buckets: Sequence[str] = ("head", "medium", "tail", "rare"),
) -> Dict[str, float]:


    yt, yp = _valid(y_true, y_pred)
    out: Dict[str, float] = {}
    for b in buckets:
        classes = [c for c, bb in bucket_of_class.items() if bb == b]
        if not classes:
            out[f"{b}_f1"] = 0.0
            continue
        member = np.isin(yt, classes)
        if member.sum() == 0:
            out[f"{b}_f1"] = 0.0
            continue
        out[f"{b}_f1"] = float(
            f1_score(yt[member], yp[member], labels=classes, average="macro", zero_division=0)
        )
    return out
