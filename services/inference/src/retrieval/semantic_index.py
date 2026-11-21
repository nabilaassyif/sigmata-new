

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

import numpy as np

logger = logging.getLogger(__name__)

try:  
    import faiss  
    _HAS_FAISS = True
except Exception:  
    _HAS_FAISS = False

_FAISS_INDEX_FILE = "semantic.faiss"
_NPY_INDEX_FILE = "semantic_vectors.npy"
_IDS_FILE = "semantic_ids.json"
_BACKEND_FILE = "semantic_backend.json"


class SemanticIndex:

    def __init__(self, ids: Sequence[str], embeddings: np.ndarray, backend: str = "auto"):
        if embeddings.shape[0] != len(ids):
            raise ValueError("ids/embeddings length mismatch.")
        self.ids: List[str] = list(ids)
        self._pos = {cid: i for i, cid in enumerate(self.ids)}
        self.embeddings = np.ascontiguousarray(embeddings, dtype=np.float32)
        self.dim = int(self.embeddings.shape[1])
        self.backend = self._resolve_backend(backend)
        self._faiss_index = None
        if self.backend == "faiss":
            self._build_faiss()
        logger.info("SemanticIndex: %d vectors, dim=%d, backend=%s",
                    len(self.ids), self.dim, self.backend)


    @staticmethod
    def _resolve_backend(backend: str) -> str:
        if backend == "numpy":
            return "numpy"
        if backend == "faiss" and not _HAS_FAISS:
            raise RuntimeError("faiss requested but not installed (pip install faiss-cpu).")
        return "faiss" if _HAS_FAISS else "numpy"

    def _build_faiss(self) -> None:
        index = faiss.IndexFlatIP(self.dim)            
        self._faiss_index = faiss.IndexIDMap2(index)
        self._faiss_index.add_with_ids(
            self.embeddings, np.arange(len(self.ids), dtype=np.int64)
        )


    def search(
        self,
        query: np.ndarray,
        k: int,
        allowed_ids: Optional[Sequence[str]] = None,
    ) -> List[Tuple[str, float]]:


        q = np.ascontiguousarray(query, dtype=np.float32).reshape(1, -1)
        if self.backend == "faiss":
            return self._search_faiss(q, k, allowed_ids)
        return self._search_numpy(q, k, allowed_ids)

    def _search_faiss(self, q, k, allowed_ids):
        params = None
        if allowed_ids is not None:
            sel = np.fromiter(
                (self._pos[c] for c in allowed_ids if c in self._pos),
                dtype=np.int64,
            )
            if sel.size == 0:
                return []
            params = faiss.SearchParametersIVF()  
            selector = faiss.IDSelectorBatch(sel)
            params = faiss.SearchParameters(sel=selector)
        scores, idx = self._faiss_index.search(q, min(k, len(self.ids)), params=params)
        return [
            (self.ids[i], float(s))
            for i, s in zip(idx[0], scores[0]) if i != -1
        ]

    def _search_numpy(self, q, k, allowed_ids):
        sims = (self.embeddings @ q[0])
        if allowed_ids is not None:
            mask = np.full(len(self.ids), -np.inf, dtype=np.float32)
            pos = [self._pos[c] for c in allowed_ids if c in self._pos]
            if not pos:
                return []
            mask[pos] = 0.0
            sims = sims + mask
        k = min(k, int(np.isfinite(sims).sum()))
        if k <= 0:
            return []
        top = np.argpartition(-sims, k - 1)[:k]
        top = top[np.argsort(-sims[top])]
        return [(self.ids[i], float(sims[i])) for i in top]


    def save(self, out_dir: Path) -> None:
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / _IDS_FILE).write_text(json.dumps(self.ids), encoding="utf-8")
        (out_dir / _BACKEND_FILE).write_text(
            json.dumps({"backend": self.backend, "dim": self.dim}), encoding="utf-8"
        )
        if self.backend == "faiss":
            faiss.write_index(self._faiss_index, str(out_dir / _FAISS_INDEX_FILE))
        else:
            np.save(out_dir / _NPY_INDEX_FILE, self.embeddings)
        logger.info("Saved SemanticIndex (%s) -> %s", self.backend, out_dir)

    @classmethod
    def load(cls, out_dir: Path) -> "SemanticIndex":
        out_dir = Path(out_dir)
        ids = json.loads((out_dir / _IDS_FILE).read_text(encoding="utf-8"))
        info = json.loads((out_dir / _BACKEND_FILE).read_text(encoding="utf-8"))
        if info["backend"] == "faiss":
            if not _HAS_FAISS:
                raise RuntimeError("Saved FAISS index but faiss is not installed.")
            faiss_index = faiss.read_index(str(out_dir / _FAISS_INDEX_FILE))
            n = faiss_index.ntotal
            emb = faiss_index.reconstruct_n(0, n)
            obj = cls.__new__(cls)
            obj.ids = ids
            obj._pos = {cid: i for i, cid in enumerate(ids)}
            obj.embeddings = np.ascontiguousarray(emb, dtype=np.float32)
            obj.dim = int(info["dim"])
            obj.backend = "faiss"
            obj._faiss_index = faiss_index
            return obj
        emb = np.load(out_dir / _NPY_INDEX_FILE)
        return cls(ids=ids, embeddings=emb, backend="numpy")
