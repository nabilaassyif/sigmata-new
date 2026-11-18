from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_and_readiness():
    assert client.get('/healthz').status_code == 200
    assert client.get('/readyz').status_code == 503


def test_unavailable_model_requires_review():
    body = {'complaintId': '00000000-0000-0000-0000-000000000001',
            'municipalityId': '00000000-0000-0000-0000-000000000002', 'description': 'Road damage'}
    response = client.post('/v1/inference/predict', json=body)
    assert response.status_code == 200
    assert response.json()['requiresHumanReview'] is True
    assert response.json()['predictedAgencyId'] is None
    assert response.json()['fallbackUsed'] is False
    body['municipalityId'] = 'invalid'
    assert client.post('/v1/inference/predict', json=body).status_code == 422
