from typing import Protocol
from uuid import UUID

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    complaintId: UUID
    municipalityId: UUID
    description: str = Field(min_length=1, max_length=10000, pattern=r'.*\S.*')
    categoryHints: list[UUID] = Field(default_factory=list, max_length=100)
    geospatialContext: dict | None = None


class PredictionResponse(BaseModel):
    complaintId: UUID
    predictedCategoryId: UUID | None = None
    predictedAgencyId: UUID | None = None
    confidence: float | None = None
    modelVersion: str | None = None
    inferenceLatencyMs: float | None = None
    requiresHumanReview: bool = True
    fallbackUsed: bool = False
    decisionReason: str = 'Model unavailable; human review required.'


class ModelAdapter(Protocol):
    def predict(self, request: PredictionRequest) -> PredictionResponse: ...


app = FastAPI(title='SIGMATA inference')


@app.get('/healthz')
def health():
    return {'status': 'ok'}


@app.get('/readyz', status_code=503)
def ready():
    return {'status': 'model_unavailable'}


@app.post('/v1/inference/predict', response_model=PredictionResponse)
def predict(request: PredictionRequest):
    return PredictionResponse(complaintId=request.complaintId)
