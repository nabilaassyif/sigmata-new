

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from src.privacy.pii import PIIScrubber, hash_identifier

logger = logging.getLogger(__name__)


UNIFIED_COLUMNS: List[str] = [
    "complaintID",
    "source",
    "userID_hash",
    "text_raw",
    "text_clean",
    "timestamp",
    "date_only",
    "category",
    "label_opd_initial",
    "label_opd_disposisi",
    "label_opd_final",
    "status_pengaduan",
    "jenis_aduan",
    "lokasi",
    "lat",
    "lng",
    "geo_valid",
    "is_blackhole_geo",
    "tgl_proses",
    "tgl_selesai",
    "processing_days",
    "auto_closed_7d",
    "genuine_resolved",
    "sla_breach_risk",
    "category_bucket",
    "opd_bucket",
]


LABEL_ONLY_COLUMNS: Tuple[str, ...] = (
    "label_opd_disposisi",
    "label_opd_final",
    "status_pengaduan",
    "tgl_proses",
    "tgl_selesai",
    "processing_days",
    "auto_closed_7d",
    "genuine_resolved",
    "sla_breach_risk",
)


APP_REQUIRED = ("opd", "tgl_pengaduan", "kategori", "isi_pengaduan")
SOSMED_REQUIRED = ("opd", "tgl_pengaduan", "kategori", "isi_pengaduan")


FINISHED_STATUSES = frozenset({"selesai", "closed", "resolved", "finished", "done"})


@dataclass
class PreprocessConfig:

    salt: Optional[str] = None


    lat_bounds: Tuple[float, float] = (-11.0, 6.0)
    lng_bounds: Tuple[float, float] = (95.0, 141.0)
    geo_round_decimals: int = 4          
    blackhole_min_freq: int = 50         


    sla_auto_close_days: float = 7.0
    sla_tolerance_days: float = 0.5      
    genuine_proses_min_gap_hours: float = 1.0  


    enable_near_dup: bool = True
    near_dup_threshold: float = 0.90
    near_dup_max_len_diff: int = 20      


    rare_support: int = 5
    bucket_head_mass: float = 0.50       
    bucket_tail_mass: float = 0.80       


_WS_RE = re.compile(r"\s+")
_REPEAT_PUNCT_RE = re.compile(r"([!?.,])\1{2,}")


def _require_columns(df: pd.DataFrame, required: Tuple[str, ...], source_name: str) -> None:
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(
            f"[{source_name}] missing required column(s): {missing}. "
            f"Found columns: {list(df.columns)}"
        )


def _normalize_label(value: object) -> str:


    if value is None or (isinstance(value, float) and np.isnan(value)):
        return ""
    s = str(value).strip()
    if s == "" or s.lower() in {"nan", "none", "null", "<na>"}:
        return ""
    return _WS_RE.sub(" ", s).upper()


def _normalize_status(value: object) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return ""
    s = str(value).strip().lower()
    return "" if s in {"nan", "none", "null", "<na>"} else _WS_RE.sub(" ", s)


def _clean_text(raw: object, scrubber: PIIScrubber) -> str:


    if raw is None:
        return ""
    s = str(raw)
    if s.strip() == "":
        return ""
    s = scrubber.scrub(s)
    s = s.lower()
    s = _REPEAT_PUNCT_RE.sub(r"\1", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def _coerce_dt(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce")


def load_app(path: Path) -> pd.DataFrame:
    logger.info("Loading app source: %s", path)
    df = pd.read_excel(path)
    _require_columns(df, APP_REQUIRED, "app")
    df = df.reset_index(drop=True)

    out = pd.DataFrame(index=df.index)
    out["source"] = "app"
    out["complaintID"] = "APP-" + df.index.astype(str)


    user_raw = df.get("id_user")
    if user_raw is None:
        user_raw = pd.Series([np.nan] * len(df), index=df.index)
    nik = df.get("nik")
    if nik is not None:
        user_raw = user_raw.where(user_raw.notna(), nik)
    out["_user_raw"] = user_raw

    out["text_raw"] = df["isi_pengaduan"]
    out["timestamp"] = df["tgl_pengaduan"]
    out["category"] = df["kategori"]
    out["_opd_initial_raw"] = df["opd"]
    out["_opd_disposisi_raw"] = df.get("opd_disposisi")
    out["_tgl_disposisi"] = df.get("tgl_disposisi")
    out["_alasan_disposisi"] = df.get("alasan_disposisi")
    out["tgl_proses"] = df.get("tgl_proses")
    out["tgl_selesai"] = df.get("tgl_selesai")
    out["status_pengaduan"] = df.get("status_pengaduan")
    out["jenis_aduan"] = df.get("jenis_aduan")
    out["lokasi"] = df.get("lokasi")
    out["lat"] = df.get("lat")
    out["lng"] = df.get("lng")
    logger.info("  app rows: %d", len(out))
    return out


def load_sosmed(path: Path) -> pd.DataFrame:
    logger.info("Loading sosmed source: %s", path)
    df = pd.read_excel(path)
    _require_columns(df, SOSMED_REQUIRED, "sosmed")
    df = df.reset_index(drop=True)

    out = pd.DataFrame(index=df.index)
    out["source"] = "sosmed"
    out["complaintID"] = "SOC-" + df.index.astype(str)


    out["_user_raw"] = df.get("nama_sosmed")

    out["text_raw"] = df["isi_pengaduan"]
    out["timestamp"] = df["tgl_pengaduan"]
    out["category"] = df["kategori"]
    out["_opd_initial_raw"] = df["opd"]
    out["_opd_disposisi_raw"] = np.nan          
    out["_tgl_disposisi"] = pd.NaT
    out["_alasan_disposisi"] = np.nan
    out["tgl_proses"] = df.get("tgl_proses")
    out["tgl_selesai"] = df.get("tgl_selesai")
    out["status_pengaduan"] = df.get("status_pengaduan")
    out["jenis_aduan"] = df.get("jenis_aduan")
    out["lokasi"] = df.get("lokasi")
    out["lat"] = df.get("lat")
    out["lng"] = df.get("lng")
    logger.info("  sosmed rows: %d", len(out))
    return out


def _derive_text_and_ids(df: pd.DataFrame, cfg: PreprocessConfig) -> pd.DataFrame:
    scrubber = PIIScrubber()
    df = df.copy()

    df["userID_hash"] = df["_user_raw"].apply(lambda v: hash_identifier(v, cfg.salt))
    df["text_raw"] = df["text_raw"].astype("string")
    df["text_clean"] = df["text_raw"].apply(lambda t: _clean_text(t, scrubber))

    df["category"] = df["category"].apply(_normalize_label)
    df["label_opd_initial"] = df["_opd_initial_raw"].apply(_normalize_label)
    df["label_opd_disposisi"] = df["_opd_disposisi_raw"].apply(_normalize_label)
    df["label_opd_final"] = df["label_opd_disposisi"].where(
        df["label_opd_disposisi"] != "", df["label_opd_initial"]
    )
    df["status_pengaduan"] = df["status_pengaduan"].apply(_normalize_status)
    df["jenis_aduan"] = df["jenis_aduan"].apply(
        lambda v: _WS_RE.sub(" ", str(v).strip()) if pd.notna(v) else ""
    )

    df["timestamp"] = _coerce_dt(df["timestamp"])
    df["tgl_proses"] = _coerce_dt(df["tgl_proses"])
    df["tgl_selesai"] = _coerce_dt(df["tgl_selesai"])
    df["_tgl_disposisi"] = _coerce_dt(df["_tgl_disposisi"])
    return df


def _drop_invalid_rows(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, int]]:
    n0 = len(df)
    missing_text = int((df["text_clean"].str.len().fillna(0) == 0).sum())
    missing_category = int((df["category"] == "").sum())
    missing_timestamp = int(df["timestamp"].isna().sum())

    keep = (
        (df["text_clean"].str.len().fillna(0) > 0)
        & (df["category"] != "")
        & (df["timestamp"].notna())
    )
    df = df[keep].copy()
    counts = {
        "missing_text": missing_text,
        "missing_category": missing_category,
        "missing_timestamp": missing_timestamp,
        "dropped_total": n0 - len(df),
    }
    logger.info(
        "Dropped invalid rows: text=%d, category=%d, timestamp=%d (total dropped=%d)",
        missing_text, missing_category, missing_timestamp, counts["dropped_total"],
    )
    return df, counts


def _derive_geo(df: pd.DataFrame, cfg: PreprocessConfig) -> Tuple[pd.DataFrame, Dict]:
    df = df.copy()
    df["lat"] = pd.to_numeric(df["lat"], errors="coerce")
    df["lng"] = pd.to_numeric(df["lng"], errors="coerce")
    df.replace([np.inf, -np.inf], np.nan, inplace=True)

    lat_lo, lat_hi = cfg.lat_bounds
    lng_lo, lng_hi = cfg.lng_bounds
    in_bounds = (
        df["lat"].between(lat_lo, lat_hi)
        & df["lng"].between(lng_lo, lng_hi)
    )
    nonzero = ~((df["lat"].abs() < 1e-6) & (df["lng"].abs() < 1e-6))
    present = df["lat"].notna() & df["lng"].notna()
    base_valid = present & nonzero & in_bounds


    df["is_blackhole_geo"] = False
    blackhole_coord: Optional[Tuple[float, float]] = None
    blackhole_count = 0
    if base_valid.any():
        rounded = (
            df.loc[base_valid, ["lat", "lng"]]
            .round(cfg.geo_round_decimals)
            .apply(tuple, axis=1)
        )
        vc = rounded.value_counts()
        if len(vc) > 0 and int(vc.iloc[0]) >= cfg.blackhole_min_freq:
            blackhole_coord = tuple(map(float, vc.index[0]))
            blackhole_count = int(vc.iloc[0])
            is_bh = (
                df["lat"].round(cfg.geo_round_decimals) == blackhole_coord[0]
            ) & (df["lng"].round(cfg.geo_round_decimals) == blackhole_coord[1])
            df.loc[is_bh, "is_blackhole_geo"] = True

    df["geo_valid"] = base_valid & ~df["is_blackhole_geo"]
    meta = {
        "blackhole_coord": blackhole_coord,
        "blackhole_count": blackhole_count,
        "geo_valid_count": int(df["geo_valid"].sum()),
    }
    logger.info(
        "Geo: valid=%d/%d, blackhole=%s (n=%d)",
        meta["geo_valid_count"], len(df), blackhole_coord, blackhole_count,
    )
    return df, meta


def _derive_sla(df: pd.DataFrame, cfg: PreprocessConfig) -> pd.DataFrame:


    df = df.copy()
    both = df["timestamp"].notna() & df["tgl_selesai"].notna()
    proc = (df["tgl_selesai"] - df["timestamp"]).dt.total_seconds() / 86400.0
    proc = proc.where(both)
    proc = proc.where(proc >= 0, other=np.nan)        
    df["processing_days"] = proc


    disposisi_signal = df["_tgl_disposisi"].notna()
    alasan_signal = df["_alasan_disposisi"].apply(
        lambda v: bool(str(v).strip()) and str(v).strip().lower() not in {"nan", "none", "null"}
        if pd.notna(v) else False
    )
    gap_seconds = (df["tgl_selesai"] - df["tgl_proses"]).dt.total_seconds()
    proses_signal = (
        df["tgl_proses"].notna()
        & df["tgl_selesai"].notna()
        & (gap_seconds > cfg.genuine_proses_min_gap_hours * 3600.0)
    )
    genuine_signal = disposisi_signal | alasan_signal | proses_signal


    near_seven = (df["processing_days"] - cfg.sla_auto_close_days).abs() <= cfg.sla_tolerance_days
    df["auto_closed_7d"] = (df["processing_days"].notna() & near_seven & ~genuine_signal)

    status_finished = df["status_pengaduan"].isin(FINISHED_STATUSES)
    df["genuine_resolved"] = status_finished & ~df["auto_closed_7d"]


    within7 = (
        df["genuine_resolved"]
        & df["processing_days"].notna()
        & (df["processing_days"] <= cfg.sla_auto_close_days + cfg.sla_tolerance_days)
    )
    breach = (~within7).astype("Int64")
    breach = breach.where(df["processing_days"].notna(), other=pd.NA)
    df["sla_breach_risk"] = breach
    logger.info(
        "SLA: auto_closed=%d, genuine_resolved=%d, breach_labeled=%d",
        int(df["auto_closed_7d"].sum()),
        int(df["genuine_resolved"].sum()),
        int(df["sla_breach_risk"].notna().sum()),
    )
    return df


def _deduplicate(df: pd.DataFrame, cfg: PreprocessConfig) -> Tuple[pd.DataFrame, Dict[str, int]]:
    n0 = len(df)
    df = df.drop_duplicates(subset=["text_clean", "date_only", "source"], keep="first").copy()
    exact_removed = n0 - len(df)

    near_removed = 0
    if cfg.enable_near_dup:
        drop_idx: List[int] = []


        sub = df[df["userID_hash"].notna()].sort_values(["userID_hash", "date_only"])
        prev_user = prev_date = prev_text = None
        prev_label = None
        for idx, row in sub[["userID_hash", "date_only", "text_clean"]].iterrows():
            u, d, t = row["userID_hash"], row["date_only"], row["text_clean"]
            if (
                prev_user == u
                and prev_date == d
                and prev_text is not None
                and abs(len(t) - len(prev_text)) <= cfg.near_dup_max_len_diff
                and SequenceMatcher(None, t, prev_text).ratio() >= cfg.near_dup_threshold
            ):
                drop_idx.append(idx)
                continue
            prev_user, prev_date, prev_text = u, d, t
        if drop_idx:
            df = df.drop(index=drop_idx).copy()
        near_removed = len(drop_idx)

    counts = {"exact_dups_removed": exact_removed, "near_dups_removed": near_removed}
    logger.info("Dedup: exact=%d, near=%d", exact_removed, near_removed)
    return df, counts


def run_preprocess(
    app_path: Path,
    sosmed_path: Path,
    out_path: Path,
    cfg: Optional[PreprocessConfig] = None,
) -> Tuple[pd.DataFrame, Dict]:


    cfg = cfg or PreprocessConfig()
    app = load_app(Path(app_path))
    sosmed = load_sosmed(Path(sosmed_path))
    raw_app, raw_sosmed = len(app), len(sosmed)

    df = pd.concat([app, sosmed], ignore_index=True)
    df = _derive_text_and_ids(df, cfg)
    df["date_only"] = df["timestamp"].dt.date

    df, drop_counts = _drop_invalid_rows(df)
    after_clean = len(df)

    df, geo_meta = _derive_geo(df, cfg)
    df = _derive_sla(df, cfg)
    df, dup_counts = _deduplicate(df, cfg)


    from src.data.stats import assign_frequency_buckets, compute_class_distribution

    cat_buckets = assign_frequency_buckets(
        compute_class_distribution(df, "category"),
        rare_support=cfg.rare_support,
        head_mass=cfg.bucket_head_mass,
        tail_mass=cfg.bucket_tail_mass,
    )
    opd_buckets = assign_frequency_buckets(
        compute_class_distribution(df, "label_opd_final"),
        rare_support=cfg.rare_support,
        head_mass=cfg.bucket_head_mass,
        tail_mass=cfg.bucket_tail_mass,
    )
    df["category_bucket"] = df["category"].map(cat_buckets)
    df["opd_bucket"] = df["label_opd_final"].map(opd_buckets)


    df = df[UNIFIED_COLUMNS].reset_index(drop=True)

    meta = {
        "raw_app": raw_app,
        "raw_sosmed": raw_sosmed,
        "after_clean": after_clean,
        "final_rows": len(df),
        **drop_counts,
        **dup_counts,
        "geo": geo_meta,
        "config": cfg,
    }

    _write_table(df, Path(out_path))
    logger.info("Wrote unified table (%d rows) -> %s", len(df), out_path)
    return df, meta


def _write_table(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".csv":
        df.to_csv(path, index=False)
        return
    try:
        df.to_parquet(path, index=False)
    except Exception as exc:  
        csv_path = path.with_suffix(".csv")
        logger.warning("Parquet write failed (%s); writing CSV -> %s", exc, csv_path)
        df.to_csv(csv_path, index=False)
