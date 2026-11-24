from typing import Protocol
from uuid import UUID
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
from time import perf_counter as perfCounter

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
    predictedCategoryLabel: str | None = None
    predictedAgencyLabel: str | None = None
    confidence: float | None = None
    modelVersion: str | None = None
    inferenceLatencyMs: float | None = None
    requiresHumanReview: bool = True
    fallbackUsed: bool = False
    decisionReason: str = 'Model unavailable; human review required.'


class ModelAdapter(Protocol):
    def predict(self, request: PredictionRequest) -> PredictionResponse: ...


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model = None
    modelPath = Path(os.getenv('GRACE_ARTIFACTS', str(Path(__file__).resolve().parents[1] / 'artifacts')))
    if os.getenv('GRACE_MODEL_DOWNLOAD', '').lower() == 'true':
        from app.downloadModel import prepare
        modelRoot = Path(os.environ['GRACE_MODEL_ROOT'])
        modelPath = prepare(modelRoot, os.environ['GRACE_MODEL_REPO'],
                            os.environ['GRACE_MODEL_REVISION'], os.getenv('HF_TOKEN'))
        logger.info('Model artifacts ready at %s', modelPath)
    try:
        from app.graceModel import GraceModel
        app.state.model = GraceModel(modelPath)
    except Exception:
        logger.exception('GRACE model could not be loaded')
    yield


app = FastAPI(title='SIGMATA inference', lifespan=lifespan)


@app.get('/healthz')
def health():
    return {'status': 'ok'}


@app.get('/readyz')
def ready():
    from fastapi.responses import JSONResponse
    available = getattr(app.state, 'model', None) is not None
    return JSONResponse(status_code=200 if available else 503,
                        content={'status': 'ready' if available else 'model_unavailable'})


@app.post('/v1/inference/predict', response_model=PredictionResponse)
def predict(request: PredictionRequest):
    model = getattr(app.state, 'model', None)
    if model is None:
        return PredictionResponse(complaintId=request.complaintId)
    context = request.geospatialContext or {}
    try:
        lat, lng = context.get('latitude'), context.get('longitude')
        if (lat is None) != (lng is None) or (lat is not None and
            (not isinstance(lat, (float, int)) or isinstance(lat, bool) or not -90 <= lat <= 90 or
             not isinstance(lng, (float, int)) or isinstance(lng, bool) or not -180 <= lng <= 180)):
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail='Invalid coordinates')
        started = perfCounter()
        category, agency, confidence = model.predict(request.description, lat, lng)
        return PredictionResponse(complaintId=request.complaintId, predictedCategoryLabel=category,
                                  predictedAgencyLabel=agency, confidence=confidence,
                                  modelVersion='GRACE-Core-FT', inferenceLatencyMs=(perfCounter()-started)*1000,
                                  decisionReason='Trained on Tangerang complaints; confirm jurisdiction and review labels. Application IDs are not mapped.')
    except Exception as exc:
        from fastapi import HTTPException
        if isinstance(exc, HTTPException):
            raise
        logger.exception('GRACE prediction failed')
        return PredictionResponse(complaintId=request.complaintId)
