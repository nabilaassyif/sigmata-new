

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import pandas as pd


@dataclass
class LabelEncoder:

    name: str
    classes_: List[str] = field(default_factory=list)
    _to_id: Dict[str, int] = field(default_factory=dict, repr=False)

    @classmethod
    def fit(cls, name: str, labels: Sequence[str]) -> "LabelEncoder":
        uniq = sorted({str(x) for x in labels if str(x) != "" and str(x).lower() != "nan"})
        enc = cls(name=name, classes_=uniq)
        enc._to_id = {c: i for i, c in enumerate(uniq)}
        return enc

    def __len__(self) -> int:
        return len(self.classes_)

    def transform_one(self, label: object) -> int:
        return self._to_id.get(str(label), -1)

    def transform(self, labels: Sequence[object]) -> List[int]:
        return [self.transform_one(x) for x in labels]

    def to_json(self) -> Dict:
        return {"name": self.name, "classes": self.classes_}

    @classmethod
    def from_json(cls, d: Dict) -> "LabelEncoder":
        enc = cls(name=d["name"], classes_=list(d["classes"]))
        enc._to_id = {c: i for i, c in enumerate(enc.classes_)}
        return enc


def build_label_encoders(
    df: pd.DataFrame,
    train_ids: Sequence[str],
    id_col: str = "complaintID",
) -> Dict[str, LabelEncoder]:
    train = df[df[id_col].astype(str).isin(set(map(str, train_ids)))]
    return {
        "category": LabelEncoder.fit("category", train["category"].tolist()),
        "opd": LabelEncoder.fit("opd", train["label_opd_final"].tolist()),
    }


def save_label_encoders(encoders: Dict[str, LabelEncoder], path: Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({k: v.to_json() for k, v in encoders.items()}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def load_label_encoders(path: Path) -> Dict[str, LabelEncoder]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return {k: LabelEncoder.from_json(v) for k, v in data.items()}
