

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class SplitConfig:

    train_ratio: float = 0.70
    val_ratio: float = 0.15
    test_ratio: float = 0.15
    n_folds: int = 5
    time_col: str = "timestamp"
    id_col: str = "complaintID"
    rare_support: int = 5

    def validate(self) -> None:
        total = self.train_ratio + self.val_ratio + self.test_ratio
        if not np.isclose(total, 1.0):
            raise ValueError(f"Split ratios must sum to 1.0, got {total:.4f}")
        if self.n_folds < 2:
            raise ValueError("n_folds must be >= 2")


def _sorted_ids(df: pd.DataFrame, cfg: SplitConfig) -> List[str]:
    if cfg.time_col not in df.columns or cfg.id_col not in df.columns:
        raise ValueError(f"DataFrame must contain '{cfg.time_col}' and '{cfg.id_col}'.")
    ordered = df.sort_values([cfg.time_col, cfg.id_col], kind="mergesort")
    return ordered[cfg.id_col].astype(str).tolist()


def temporal_split(df: pd.DataFrame, cfg: Optional[SplitConfig] = None) -> Dict:


    cfg = cfg or SplitConfig()
    cfg.validate()
    ts = pd.to_datetime(df[cfg.time_col])
    df = df.assign(**{cfg.time_col: ts})

    ids = _sorted_ids(df, cfg)
    n = len(ids)
    n_train = int(round(n * cfg.train_ratio))
    n_val = int(round(n * cfg.val_ratio))
    train_ids = ids[:n_train]
    val_ids = ids[n_train:n_train + n_val]
    test_ids = ids[n_train + n_val:]

    ts_by_id = dict(zip(df[cfg.id_col].astype(str), ts))

    def _bounds(id_list: List[str]) -> Dict[str, Optional[str]]:
        if not id_list:
            return {"start": None, "end": None}
        times = [ts_by_id[i] for i in id_list]
        return {"start": str(min(times)), "end": str(max(times))}

    result = {
        "kind": "temporal_holdout",
        "train_ids": train_ids,
        "val_ids": val_ids,
        "test_ids": test_ids,
        "metadata": {
            "n_total": n,
            "n_train": len(train_ids),
            "n_val": len(val_ids),
            "n_test": len(test_ids),
            "ratios": {"train": cfg.train_ratio, "val": cfg.val_ratio, "test": cfg.test_ratio},
            "time_bounds": {
                "train": _bounds(train_ids),
                "val": _bounds(val_ids),
                "test": _bounds(test_ids),
            },
            "leakage_contract": _LEAKAGE_CONTRACT,
        },
    }
    logger.info(
        "Temporal split: train=%d val=%d test=%d (boundaries %s | %s)",
        len(train_ids), len(val_ids), len(test_ids),
        result["metadata"]["time_bounds"]["train"]["end"],
        result["metadata"]["time_bounds"]["val"]["end"],
    )
    return result


def rolling_origin_cv(df: pd.DataFrame, cfg: Optional[SplitConfig] = None) -> List[Dict]:


    cfg = cfg or SplitConfig()
    cfg.validate()
    ts = pd.to_datetime(df[cfg.time_col])
    df = df.assign(**{cfg.time_col: ts})
    ids = _sorted_ids(df, cfg)
    n = len(ids)

    blocks = np.array_split(np.arange(n), cfg.n_folds + 1)
    ts_by_id = dict(zip(df[cfg.id_col].astype(str), ts))
    folds: List[Dict] = []
    for k in range(cfg.n_folds):
        train_pos = np.concatenate(blocks[: k + 1])
        eval_pos = blocks[k + 1]
        mid = len(eval_pos) // 2
        val_pos, test_pos = eval_pos[:mid], eval_pos[mid:]

        train_ids = [ids[i] for i in train_pos]
        val_ids = [ids[i] for i in val_pos]
        test_ids = [ids[i] for i in test_pos]

        def _end(id_list: List[str]) -> Optional[str]:
            return str(max(ts_by_id[i] for i in id_list)) if id_list else None

        folds.append({
            "fold": k,
            "train_ids": train_ids,
            "val_ids": val_ids,
            "test_ids": test_ids,
            "metadata": {
                "n_train": len(train_ids),
                "n_val": len(val_ids),
                "n_test": len(test_ids),
                "train_end": _end(train_ids),
                "val_end": _end(val_ids),
                "test_end": _end(test_ids),
            },
        })
        logger.info(
            "CV fold %d: train=%d val=%d test=%d",
            k, len(train_ids), len(val_ids), len(test_ids),
        )
    return folds


_LEAKAGE_CONTRACT = (
    "Retrieval pool for any val/test query = TRAIN rows with timestamp < query "
    "timestamp. Test rows never retrieve other test rows. Use get_causal_pool()."
)


def get_causal_pool(
    query_timestamp,
    train_df: pd.DataFrame,
    time_col: str = "timestamp",
) -> pd.DataFrame:


    qt = pd.Timestamp(query_timestamp)
    pool = train_df[pd.to_datetime(train_df[time_col]) < qt]
    return pool


def _load_table(path: Path) -> pd.DataFrame:
    path = Path(path)
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path, parse_dates=["timestamp", "tgl_proses", "tgl_selesai"])
    return pd.read_parquet(path)


def _train_frequency_buckets(df: pd.DataFrame, train_ids: List[str], cfg: SplitConfig) -> Dict:
    from src.data.stats import assign_frequency_buckets, compute_class_distribution

    train_df = df[df[cfg.id_col].astype(str).isin(set(train_ids))]
    return {
        "category": assign_frequency_buckets(
            compute_class_distribution(train_df, "category"), rare_support=cfg.rare_support
        ),
        "label_opd_final": assign_frequency_buckets(
            compute_class_distribution(train_df, "label_opd_final"), rare_support=cfg.rare_support
        ),
    }


def make_splits(
    data_path: Path,
    out_dir: Path,
    cfg: Optional[SplitConfig] = None,
) -> Dict:


    cfg = cfg or SplitConfig()
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    df = _load_table(Path(data_path))
    if cfg.id_col not in df.columns:
        raise ValueError(f"'{cfg.id_col}' not found in {data_path}.")

    holdout = temporal_split(df, cfg)

    holdout["train_frequency_buckets"] = _train_frequency_buckets(
        df, holdout["train_ids"], cfg
    )

    folds = rolling_origin_cv(df, cfg)
    cv_payload = {
        "kind": "rolling_origin_cv",
        "n_folds": cfg.n_folds,
        "config": asdict(cfg),
        "leakage_contract": _LEAKAGE_CONTRACT,
        "folds": folds,
    }

    holdout_path = out_dir / "temporal_split.json"
    cv_path = out_dir / "rolling_cv_folds.json"
    holdout_path.write_text(json.dumps(holdout, indent=2, default=str), encoding="utf-8")
    cv_path.write_text(json.dumps(cv_payload, indent=2, default=str), encoding="utf-8")

    logger.info("Wrote %s and %s", holdout_path, cv_path)
    return {
        "holdout_path": str(holdout_path),
        "cv_path": str(cv_path),
        "n_total": holdout["metadata"]["n_total"],
        "n_folds": cfg.n_folds,
    }
