

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

BUCKET_ORDER = ("head", "medium", "tail", "rare")


def compute_class_distribution(df: pd.DataFrame, col: str) -> pd.Series:
    s = df[col].replace("", np.nan).dropna()
    return s.value_counts().sort_values(ascending=False)


def assign_frequency_buckets(
    counts: pd.Series,
    rare_support: int = 5,
    head_mass: float = 0.50,
    tail_mass: float = 0.80,
) -> Dict[str, str]:


    if counts.empty:
        return {}
    total = float(counts.sum())
    counts = counts.sort_values(ascending=False)
    cum = counts.cumsum() / total
    buckets: Dict[str, str] = {}
    for label, n in counts.items():
        if n < rare_support:
            buckets[label] = "rare"
        elif cum[label] <= head_mass:
            buckets[label] = "head"
        elif cum[label] <= tail_mass:
            buckets[label] = "medium"
        else:
            buckets[label] = "tail"
    return buckets


def bucket_summary(buckets: Dict[str, str], counts: pd.Series) -> pd.DataFrame:
    rows = []
    for b in BUCKET_ORDER:
        labels = [k for k, v in buckets.items() if v == b]
        n_samples = int(counts.reindex(labels).fillna(0).sum())
        rows.append({"bucket": b, "n_classes": len(labels), "n_samples": n_samples})
    return pd.DataFrame(rows)


def compute_source_overlap(df: pd.DataFrame) -> Dict:

    def _jaccard(a: set, b: set) -> float:
        union = a | b
        return len(a & b) / len(union) if union else 0.0

    by_source = df["source"].value_counts().to_dict()
    cat = {s: set(df.loc[df["source"] == s, "category"].unique()) for s in by_source}
    opd = {s: set(df.loc[df["source"] == s, "label_opd_final"].unique()) for s in by_source}
    a, m = "app", "sosmed"
    return {
        "counts": by_source,
        "category_overlap_jaccard": _jaccard(cat.get(a, set()), cat.get(m, set())),
        "opd_overlap_jaccard": _jaccard(opd.get(a, set()), opd.get(m, set())),
        "category_only_app": len(cat.get(a, set()) - cat.get(m, set())),
        "category_only_sosmed": len(cat.get(m, set()) - cat.get(a, set())),
        "opd_only_app": len(opd.get(a, set()) - opd.get(m, set())),
        "opd_only_sosmed": len(opd.get(m, set()) - opd.get(a, set())),
    }


def summarize_text_lengths(df: pd.DataFrame) -> pd.DataFrame:
    tmp = df.assign(
        _chars=df["text_clean"].str.len(),
        _words=df["text_clean"].str.split().apply(len),
    )
    return tmp.groupby("source")[["_chars", "_words"]].agg(["mean", "median", "max"])


def summarize_geo_quality(df: pd.DataFrame, geo_meta: Optional[Dict] = None) -> Dict:
    overall = float(df["geo_valid"].mean()) if len(df) else 0.0
    per_source = df.groupby("source")["geo_valid"].mean().to_dict()
    out = {
        "geo_valid_pct_overall": overall,
        "geo_valid_pct_by_source": per_source,
        "blackhole_pct": float(df["is_blackhole_geo"].mean()) if len(df) else 0.0,
    }
    if geo_meta:
        out["blackhole_coord"] = geo_meta.get("blackhole_coord")
        out["blackhole_count"] = geo_meta.get("blackhole_count")
    return out


def summarize_sla_coverage(df: pd.DataFrame) -> Dict:
    n = len(df)
    valid_proses = float(df["tgl_proses"].notna().mean()) if n else 0.0
    valid_selesai = float(df["tgl_selesai"].notna().mean()) if n else 0.0

    proc = pd.to_numeric(df["processing_days"], errors="coerce")
    breach = pd.to_numeric(df["sla_breach_risk"], errors="coerce")
    n_breach_labeled = int(breach.notna().sum())
    breach_pos = int((breach == 1).sum())
    breach_neg = int((breach == 0).sum())


    usable = (
        valid_selesai >= 0.50
        and n_breach_labeled >= 200
        and breach_pos >= 30
        and breach_neg >= 30
    )
    if usable:
        reason = (
            f"{valid_selesai:.1%} rows have completion dates; "
            f"{n_breach_labeled} breach labels ({breach_pos} breach / {breach_neg} ok). "
            "Both classes are sufficiently populated."
        )
    else:
        reason = (
            f"Insufficient/uninformative SLA labels: valid_selesai={valid_selesai:.1%}, "
            f"labeled={n_breach_labeled}, pos={breach_pos}, neg={breach_neg}. "
            "Ship category+OPD only; treat SLA as future work."
        )

    return {
        "valid_proses_pct": valid_proses,
        "valid_selesai_pct": valid_selesai,
        "auto_closed_count": int(df["auto_closed_7d"].sum()),
        "auto_closed_pct": float(df["auto_closed_7d"].mean()) if n else 0.0,
        "genuine_resolved_count": int(df["genuine_resolved"].sum()),
        "genuine_resolved_pct": float(df["genuine_resolved"].mean()) if n else 0.0,
        "breach_labeled": n_breach_labeled,
        "breach_pos": breach_pos,
        "breach_neg": breach_neg,
        "breach_pos_pct": float(breach_pos / n) if n else 0.0,
        "processing_days_describe": proc.describe().to_dict(),
        "sla_label_usable": bool(usable),
        "recommendation_reason": reason,
    }


def _fmt_pct(x: float) -> str:
    return f"{x * 100:.2f}%"


def generate_coverage_report(
    df: pd.DataFrame,
    meta: Dict,
    report_path: Path,
    cfg=None,
) -> str:


    report_path = Path(report_path)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    cat_counts = compute_class_distribution(df, "category")
    opd_init_counts = compute_class_distribution(df, "label_opd_initial")
    opd_final_counts = compute_class_distribution(df, "label_opd_final")
    geo_meta = meta.get("geo", {})

    overlap = compute_source_overlap(df)
    text_len = summarize_text_lengths(df)
    geo = summarize_geo_quality(df, geo_meta)
    sla = summarize_sla_coverage(df)


    n = len(df)
    has_disposisi = (df["label_opd_disposisi"] != "").sum()
    fallback = (df["label_opd_disposisi"] == "").sum()
    cat_buckets = assign_frequency_buckets(cat_counts)
    opd_buckets = assign_frequency_buckets(opd_final_counts)

    L: List[str] = []
    L.append("# GRACE — Data Coverage Report\n")
    L.append("_Auto-generated by `src.data.stats.generate_coverage_report`. "
             "This report gates whether the SLA-breach head ships._\n")

    L.append("## 1. Row counts by source")
    L.append(f"- App (dataset 1) raw rows: **{meta.get('raw_app', 'n/a')}**")
    L.append(f"- Sosmed (dataset 2) raw rows: **{meta.get('raw_sosmed', 'n/a')}**")
    L.append(f"- Combined raw rows: **{meta.get('raw_app', 0) + meta.get('raw_sosmed', 0)}**\n")

    L.append("## 2-5. Cleaning & duplicates")
    L.append(f"- Rows after dropping invalid (missing text/category/timestamp): "
             f"**{meta.get('after_clean', 'n/a')}**")
    L.append(f"- Missing text dropped: **{meta.get('missing_text', 'n/a')}**")
    L.append(f"- Missing timestamp dropped: **{meta.get('missing_timestamp', 'n/a')}**")
    L.append(f"- Missing category dropped: **{meta.get('missing_category', 'n/a')}**")
    L.append(f"- Exact duplicates removed: **{meta.get('exact_dups_removed', 'n/a')}**")
    L.append(f"- Near duplicates removed: **{meta.get('near_dups_removed', 'n/a')}**")
    L.append(f"- **Final row count: {meta.get('final_rows', len(df))}**\n")

    L.append("## 6. Category coverage")
    L.append(f"- Unique categories: **{len(cat_counts)}**")
    L.append("- Top 10 categories:")
    for label, c in cat_counts.head(10).items():
        L.append(f"  - `{label}` — {c} ({_fmt_pct(c / n)})")
    L.append("- Bottom 10 categories:")
    for label, c in cat_counts.tail(10).items():
        L.append(f"  - `{label}` — {c}")
    L.append("")
    L.append("- Category buckets:")
    L.append(_df_to_md(bucket_summary(cat_buckets, cat_counts)))

    L.append("\n## 7-9. OPD routing coverage")
    L.append(f"- Unique OPD (initial, `opd`): **{len(opd_init_counts)}**")
    n_disposisi_unique = int(df.loc[df["label_opd_disposisi"] != "", "label_opd_disposisi"].nunique())
    L.append(f"- Unique OPD (disposisi, non-empty): **{n_disposisi_unique}**")
    L.append(f"- Unique OPD (final target): **{len(opd_final_counts)}**")
    L.append(f"- Rows with a non-empty `opd_disposisi`: **{int(has_disposisi)}** ({_fmt_pct(has_disposisi / n)})")
    L.append(f"- **OPD fallback rate (used `opd` because `opd_disposisi` empty): "
             f"{int(fallback)} ({_fmt_pct(fallback / n)})**")
    if fallback / max(n, 1) > 0.95:
        L.append("  - ⚠️ `opd_disposisi` is essentially empty in this dataset; "
                 "`label_opd_final` ≈ `opd` (initial). Report this in the paper; "
                 "the routing target is effectively the *initial* OPD.")
    L.append("- OPD buckets (final target):")
    L.append(_df_to_md(bucket_summary(opd_buckets, opd_final_counts)))

    L.append("\n## 10. Status distribution")
    status_vc = df["status_pengaduan"].replace("", "<empty>").value_counts()
    for label, c in status_vc.items():
        L.append(f"- `{label}`: {c} ({_fmt_pct(c / n)})")
    L.append("- _Note: Status prediction is intentionally dropped (7-day auto-close "
             "contaminates `status`). See RESEARCH_DESIGN.md §6.1._\n")

    L.append("## 11-17. SLA / auto-close coverage")
    L.append(f"- Valid `tgl_proses`: **{_fmt_pct(sla['valid_proses_pct'])}**")
    L.append(f"- Valid `tgl_selesai`: **{_fmt_pct(sla['valid_selesai_pct'])}**")
    L.append("- Valid `tgl_disposisi`: **derived signal only (column dropped from unified schema)**")
    pdd = sla["processing_days_describe"]
    L.append(f"- `processing_days` summary: mean={pdd.get('mean', float('nan')):.2f}, "
             f"median={pdd.get('50%', float('nan')):.2f}, "
             f"min={pdd.get('min', float('nan')):.2f}, max={pdd.get('max', float('nan')):.2f}")
    L.append(f"- Auto-closed @7d: **{sla['auto_closed_count']}** ({_fmt_pct(sla['auto_closed_pct'])})")
    L.append(f"- Genuinely resolved: **{sla['genuine_resolved_count']}** ({_fmt_pct(sla['genuine_resolved_pct'])})")
    L.append(f"- SLA-breach labels available: **{sla['breach_labeled']}** "
             f"(breach={sla['breach_pos']}, ok={sla['breach_neg']})")

    L.append("\n## 18. Recommendation — ship SLA head?")
    decision = "✅ YES" if sla["sla_label_usable"] else "❌ NO"
    L.append(f"- **Ship SLA-breach head: {decision}**")
    L.append(f"- Reason: {sla['recommendation_reason']}\n")

    L.append("## 19-20. Geo quality")
    L.append(f"- `geo_valid` overall: **{_fmt_pct(geo['geo_valid_pct_overall'])}**")
    for s, v in geo["geo_valid_pct_by_source"].items():
        L.append(f"  - {s}: {_fmt_pct(v)}")
    bh = geo.get("blackhole_coord")
    L.append(f"- Blackhole coordinate detected: **{bh}** "
             f"(n={geo.get('blackhole_count', 0)}, {_fmt_pct(geo.get('blackhole_pct', 0.0))} of rows)\n")

    L.append("## 21. Per-source comparison (app vs sosmed)")
    L.append(f"- Row counts: {overlap['counts']}")
    L.append(f"- Category overlap (Jaccard): **{overlap['category_overlap_jaccard']:.3f}** "
             f"(app-only={overlap['category_only_app']}, sosmed-only={overlap['category_only_sosmed']})")
    L.append(f"- OPD overlap (Jaccard): **{overlap['opd_overlap_jaccard']:.3f}** "
             f"(app-only={overlap['opd_only_app']}, sosmed-only={overlap['opd_only_sosmed']})")
    L.append("- Text length (chars/words) by source:")
    L.append(_df_to_md(text_len.round(1).reset_index()))
    L.append(f"- geo_valid difference (app − sosmed): "
             f"{_diff_by_source(geo['geo_valid_pct_by_source']):.3f}")
    L.append("\n- _This per-source comparison feeds the Cross-Source Generalization "
             "experiment (RESEARCH_DESIGN.md §8.2a)._")

    report = "\n".join(L) + "\n"
    report_path.write_text(report, encoding="utf-8")
    logger.info("Wrote coverage report -> %s", report_path)
    return report


def _diff_by_source(d: Dict[str, float]) -> float:
    return float(d.get("app", 0.0) - d.get("sosmed", 0.0))


def _df_to_md(df: pd.DataFrame) -> str:
    cols = list(df.columns)
    head = "| " + " | ".join(map(str, cols)) + " |"
    sep = "| " + " | ".join(["---"] * len(cols)) + " |"
    rows = [
        "| " + " | ".join(str(v) for v in row) + " |"
        for row in df.itertuples(index=False, name=None)
    ]
    return "\n".join([head, sep, *rows])
