

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import numpy as np
import pandas as pd

from src.embeddings.cache import EmbeddingManifest, save_embeddings

logger = logging.getLogger(__name__)


_META_COLS = [
    "complaintID", "timestamp", "source", "category",
    "label_opd_final", "lat", "lng", "geo_valid",
]


@dataclass
class EmbedConfig:

    model_name: str = "intfloat/multilingual-e5-base"
    prefix: str = "query: "          
    max_length: int = 384
    batch_size: int = 32
    normalize: bool = True
    device: Optional[str] = None     
    text_col: str = "text_clean"
    id_col: str = "complaintID"


def _resolve_device(requested: Optional[str]) -> str:
    import torch

    if requested:
        return requested
    return "cuda" if torch.cuda.is_available() else "cpu"


def _average_pool(last_hidden, attention_mask):
    import torch

    mask = attention_mask.unsqueeze(-1).to(last_hidden.dtype)
    summed = (last_hidden * mask).sum(dim=1)
    counts = mask.sum(dim=1).clamp(min=1e-9)
    return summed / counts


def embed_texts(texts: List[str], cfg: Optional[EmbedConfig] = None) -> np.ndarray:


    import torch
    from transformers import AutoModel, AutoTokenizer

    cfg = cfg or EmbedConfig()
    device = _resolve_device(cfg.device)
    logger.info("Embedding %d texts with %s on %s", len(texts), cfg.model_name, device)

    tokenizer = AutoTokenizer.from_pretrained(cfg.model_name)
    model = AutoModel.from_pretrained(cfg.model_name).to(device).eval()

    out: List[np.ndarray] = []
    with torch.no_grad():
        for start in range(0, len(texts), cfg.batch_size):
            batch = [cfg.prefix + (t if isinstance(t, str) else "") for t in
                     texts[start:start + cfg.batch_size]]
            enc = tokenizer(
                batch, max_length=cfg.max_length, padding=True,
                truncation=True, return_tensors="pt",
            ).to(device)
            hidden = model(**enc).last_hidden_state
            pooled = _average_pool(hidden, enc["attention_mask"])
            if cfg.normalize:
                pooled = torch.nn.functional.normalize(pooled, p=2, dim=1)
            out.append(pooled.cpu().numpy().astype(np.float32))
            if (start // cfg.batch_size) % 20 == 0:
                logger.info("  ...%d/%d", min(start + cfg.batch_size, len(texts)), len(texts))
    return np.vstack(out)


def _load_table(path: Path) -> pd.DataFrame:
    path = Path(path)
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path)
    return pd.read_parquet(path)


def extract_and_cache(
    data_path: Path,
    out_dir: Path,
    cfg: Optional[EmbedConfig] = None,
    limit: Optional[int] = None,
) -> Path:


    cfg = cfg or EmbedConfig()
    df = _load_table(Path(data_path))
    for col in (cfg.id_col, cfg.text_col):
        if col not in df.columns:
            raise ValueError(f"Column '{col}' missing in {data_path}.")
    if limit:
        df = df.head(limit).copy()
        logger.warning("LIMIT active: embedding only %d rows (smoke test).", len(df))

    texts = df[cfg.text_col].fillna("").astype(str).tolist()
    ids = df[cfg.id_col].astype(str).tolist()
    emb = embed_texts(texts, cfg)

    manifest = EmbeddingManifest(
        model_name=cfg.model_name,
        dim=int(emb.shape[1]),
        n=int(emb.shape[0]),
        prefix=cfg.prefix,
        normalized=cfg.normalize,
        text_col=cfg.text_col,
        source_table=str(data_path),
        max_length=cfg.max_length,
    )
    meta = df[[c for c in _META_COLS if c in df.columns]].copy()
    save_embeddings(out_dir, ids, emb, manifest, meta=meta)
    return Path(out_dir)
