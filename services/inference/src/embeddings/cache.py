

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

EMB_FILE = "embeddings.npy"
IDS_FILE = "ids.json"
MANIFEST_FILE = "manifest.json"
META_FILE = "meta.parquet"


@dataclass
class EmbeddingManifest:

    model_name: str
    dim: int
    n: int
    prefix: str
    normalized: bool
    text_col: str
    source_table: str
    max_length: int
    pooling: str = "mean"

    def to_dict(self) -> Dict:
        return asdict(self)


def save_embeddings(
    out_dir: Path,
    ids: List[str],
    embeddings: np.ndarray,
    manifest: EmbeddingManifest,
    meta=None,
) -> None:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if embeddings.shape[0] != len(ids):
        raise ValueError(
            f"embeddings rows ({embeddings.shape[0]}) != ids ({len(ids)})."
        )
    np.save(out_dir / EMB_FILE, embeddings.astype(np.float32))
    (out_dir / IDS_FILE).write_text(json.dumps(ids), encoding="utf-8")
    (out_dir / MANIFEST_FILE).write_text(
        json.dumps(manifest.to_dict(), indent=2), encoding="utf-8"
    )
    if meta is not None:
        try:
            meta.to_parquet(out_dir / META_FILE, index=False)
        except Exception as exc:  
            logger.warning("meta parquet write failed (%s); writing CSV", exc)
            meta.to_csv(out_dir / "meta.csv", index=False)
    logger.info("Saved %d embeddings (dim=%d) -> %s", len(ids), embeddings.shape[1], out_dir)


def load_embeddings(out_dir: Path) -> Tuple[List[str], np.ndarray, Dict]:
    out_dir = Path(out_dir)
    ids = json.loads((out_dir / IDS_FILE).read_text(encoding="utf-8"))
    emb = np.load(out_dir / EMB_FILE)
    manifest = json.loads((out_dir / MANIFEST_FILE).read_text(encoding="utf-8"))
    return ids, emb, manifest


@dataclass
class EmbeddingStore:

    ids: List[str]
    embeddings: np.ndarray
    manifest: Dict = field(default_factory=dict)
    _pos: Dict[str, int] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._pos = {cid: i for i, cid in enumerate(self.ids)}

    @classmethod
    def from_dir(cls, out_dir: Path) -> "EmbeddingStore":
        ids, emb, manifest = load_embeddings(out_dir)
        return cls(ids=ids, embeddings=emb, manifest=manifest)

    @property
    def dim(self) -> int:
        return int(self.embeddings.shape[1])

    def vector(self, complaint_id: str) -> np.ndarray:
        return self.embeddings[self._pos[complaint_id]]

    def vectors_for(self, complaint_ids: List[str]) -> np.ndarray:
        idx = [self._pos[c] for c in complaint_ids]
        return self.embeddings[idx]

    def position(self, complaint_id: str) -> Optional[int]:
        return self._pos.get(complaint_id)
