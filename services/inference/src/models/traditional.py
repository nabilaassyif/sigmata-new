

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Sequence

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.svm import LinearSVC

logger = logging.getLogger(__name__)

TRADITIONAL = {"B-LR", "B-SVM", "B-RF", "B-XGB", "B-IndoBERT", "B-E5"}

EMBEDDING_ENCODERS = {"e5", "indobert"}


def _classifier(name: str):


    if name == "B-LR":

        return LogisticRegression(solver="saga", max_iter=200, n_jobs=-1, tol=1e-3)
    if name == "B-SVM":
        return LinearSVC()
    if name == "B-RF":
        return RandomForestClassifier(n_estimators=100, n_jobs=-1, random_state=42)
    if name in ("B-E5", "B-E5-FT", "B-IndoBERT", "B-IndoBERT-FT"):   


        return MLPClassifier(hidden_layer_sizes=(256,), max_iter=200,
                             early_stopping=True, random_state=42)
    if name == "B-XGB":
        try:
            from xgboost import XGBClassifier
            return XGBClassifier(n_estimators=150, max_depth=6, learning_rate=0.3,
                                 subsample=0.8, colsample_bytree=0.6,
                                 tree_method="hist", n_jobs=-1, verbosity=0)
        except Exception:
            return None
    raise ValueError(name)


def _features(encoder: str, df: pd.DataFrame, train_ids, test_ids, store):
    tr = df.loc[list(map(str, train_ids))]; te = df.loc[list(map(str, test_ids))]
    if encoder != "tfidf":                 
        if store is None:
            raise ValueError(f"encoder '{encoder}' requires its EmbeddingStore.")
        return store.vectors_for(tr.index.tolist()), store.vectors_for(te.index.tolist())
    vec = TfidfVectorizer(max_features=10000, ngram_range=(1, 2), min_df=3)
    Xtr = vec.fit_transform(tr["text_clean"].fillna("").astype(str))
    Xte = vec.transform(te["text_clean"].fillna("").astype(str))
    return Xtr, Xte


def run_traditional(name: str, encoder: str, df: pd.DataFrame, train_ids, test_ids,
                    encoders, store=None) -> Optional[Dict]:


    df = df.copy(); df["complaintID"] = df["complaintID"].astype(str)
    df = df.set_index("complaintID", drop=False)
    if _classifier(name) is None:
        logger.warning("%s unavailable (xgboost not installed); skipping.", name)
        return None

    Xtr, Xte = _features(encoder, df, train_ids, test_ids, store)
    tr = df.loc[list(map(str, train_ids))]; te = df.loc[list(map(str, test_ids))]
    pred, gold = {}, {}
    for task, col in (("category", "category"), ("opd", "label_opd_final")):
        ytr = np.asarray(encoders[task].transform(tr[col].tolist()))
        yte = np.asarray(encoders[task].transform(te[col].tolist()))
        keep = ytr >= 0
        clf = _classifier(name)
        clf.fit(Xtr[keep], ytr[keep])
        pred[task] = clf.predict(Xte)
        gold[task] = yte
    return {"pred": pred, "gold": gold}
