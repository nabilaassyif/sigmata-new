
import json
from pathlib import Path
from threading import Lock
from uuid import uuid4

import jax
import jax.numpy as jnp
import numpy as np
import pandas as pd
import torch
from flax import nnx
from transformers import AutoModel, AutoTokenizer

from src.data.labels import load_label_encoders as loadLabelEncoders
from src.data.preprocess_raw import _clean_text as cleanText
from src.embeddings.cache import EmbeddingStore
from src.graph.assembler import AssemblerConfig, EgoGraphAssembler
from src.models.grace import GRACE, GraceConfig
from src.privacy.pii import PIIScrubber
from src.retrieval.semantic_index import SemanticIndex
from src.training.trainer import load_checkpoint as loadCheckpoint


class GraceModel:
    def __init__(self, root: Path):
        modelDir = root / 'grace_core_ft'

        summary = json.loads((modelDir / 'training_summary.json').read_text(encoding='utf-8'))
        if summary['best_epoch'] < 0:
            raise ValueError('No trained checkpoint')
        self.encoders = loadLabelEncoders(modelDir / 'labels.json')
        self.trainIds = json.loads((modelDir / 'train_ids.json').read_text(encoding='utf-8'))
        self.metadata = pd.read_parquet(modelDir / 'training_metadata.parquet')
        self.store = EmbeddingStore.from_dir(root / 'embeddings')
        self.index = SemanticIndex.load(root / 'retrieval')
        self.inverted = json.loads((root / 'retrieval/inverted_lists.json').read_text(encoding='utf-8'))
        if len(self.trainIds) != len(set(self.trainIds)) or len(self.metadata) != len(self.trainIds) or set(self.trainIds) != set(self.metadata['complaintID'].astype(str)):
            raise ValueError('Training metadata does not match training IDs')
        if not set(self.trainIds).issubset(self.store.ids) or not set(self.trainIds).issubset(self.index.ids):
            raise ValueError('Training IDs missing from embeddings or retrieval index')
        if self.store.dim != self.index.dim:
            raise ValueError('Embedding and index dimensions differ')
        self.model = GRACE(GraceConfig(in_dim=self.store.dim, hidden=256,
                           num_category=len(self.encoders['category']), num_opd=len(self.encoders['opd'])), rngs=nnx.Rngs(42))
        loadCheckpoint(self.model, str(modelDir / 'best_checkpoint'))
        self.tokenizer = AutoTokenizer.from_pretrained(root / 'encoder', local_files_only=True)
        self.textModel = AutoModel.from_pretrained(root / 'encoder', local_files_only=True).eval()
        self.scrubber = PIIScrubber()
        self.lock = Lock()

    def predict(self, text: str, latitude: float | None, longitude: float | None):
        with self.lock, torch.inference_mode():
            text = cleanText(text, self.scrubber)
            tokens = self.tokenizer('query: ' + text, max_length=384, truncation=True, return_tensors='pt')
            hidden = self.textModel(**tokens).last_hidden_state
            mask = tokens['attention_mask'].unsqueeze(-1)
            vector = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1)
            vector = torch.nn.functional.normalize(vector, p=2, dim=1).cpu().numpy().astype(np.float32)
            queryId = 'inference-' + str(uuid4())
            row = {'complaintID': queryId, 'timestamp': pd.Timestamp.now(tz='UTC').tz_localize(None),
                   'source': 'app', 'category': '', 'label_opd_final': '', 'lat': latitude,
                   'lng': longitude, 'geo_valid': latitude is not None and longitude is not None}
            df = pd.concat([self.metadata, pd.DataFrame([row])], ignore_index=True)
            ids = [*self.store.ids, queryId]
            store = EmbeddingStore(ids, np.concatenate([self.store.embeddings, vector]), self.store.manifest)
            assembler = EgoGraphAssembler(df, store, self.index, self.trainIds, self.encoders,
                                           self.inverted, AssemblerConfig(strict=True, cache_graphs=False))
            batch = assembler.assemble_batch([queryId])
            output = self.model(batch.graph, jnp.asarray(batch.query_idx), train=False)
            cat = np.asarray(jax.nn.softmax(output['category'], axis=-1))[0]
            opd = np.asarray(jax.nn.softmax(output['opd'], axis=-1))[0]
            if not np.isfinite(cat).all() or not np.isfinite(opd).all():
                raise ValueError('Model returned non-finite predictions')
            return (self.encoders['category'].classes_[int(cat.argmax())],
                    self.encoders['opd'].classes_[int(opd.argmax())], float(min(cat.max(), opd.max())))
