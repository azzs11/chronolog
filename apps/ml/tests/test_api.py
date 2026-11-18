import pytest
from fastapi.testclient import TestClient

from chronolog_ml.app import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    with TestClient(app) as c:  # runs the lifespan, which loads the model
        yield c


def test_health_reports_model_loaded(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {
        "status": "success",
        "message": "ML Service is running",
        "model_loaded": True,
    }


def test_classify_single(client: TestClient) -> None:
    res = client.post("/api/classify", json={"message": "Failed to connect to PostgreSQL"})
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["predicted_severity"] in {"critical", "error", "warning", "info", "debug"}
    assert 0 <= data["confidence"] <= 1
    assert set(data["probabilities"]) == {"critical", "error", "warning", "info", "debug"}


def test_classify_missing_message_is_400(client: TestClient) -> None:
    res = client.post("/api/classify", json={})
    assert res.status_code == 400
    assert res.json() == {"status": "error", "message": "Missing 'message' in request body"}


def test_classify_without_body_is_400(client: TestClient) -> None:
    assert client.post("/api/classify").status_code == 400


def test_batch_classify(client: TestClient) -> None:
    res = client.post("/api/classify/batch", json={"messages": ["User logged in", "kernel panic"]})
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 2
    assert len(body["data"]) == 2


def test_batch_missing_messages_is_400(client: TestClient) -> None:
    res = client.post("/api/classify/batch", json={})
    assert res.status_code == 400
    assert res.json()["message"] == "Missing 'messages' array in request body"


def test_batch_messages_must_be_array(client: TestClient) -> None:
    res = client.post("/api/classify/batch", json={"messages": "nope"})
    assert res.status_code == 400
    assert res.json()["message"] == "'messages' must be an array"


def test_model_info(client: TestClient) -> None:
    res = client.get("/api/model/info")
    assert res.status_code == 200
    assert res.json()["data"]["classes"]


def test_model_metadata(client: TestClient) -> None:
    res = client.get("/api/model/metadata")
    assert res.status_code == 200
    assert "class_distribution" in res.json()["data"]


def test_retrain_is_not_implemented(client: TestClient) -> None:
    assert client.post("/api/model/retrain").status_code == 501


def test_metrics_endpoint_exposes_prometheus(client: TestClient) -> None:
    client.post("/api/classify", json={"message": "hello"})
    res = client.get("/metrics")
    assert res.status_code == 200
    assert "ml_predictions_total" in res.text
