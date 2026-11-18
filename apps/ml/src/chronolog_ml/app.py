"""ML service API (FastAPI). Same endpoints and response shapes as the old Flask service."""

import json
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import BaseModel

from .classifier import LogClassifier
from .config import METRICS_PATH, MODEL_PATH

classifier = LogClassifier()

prediction_counter = Counter("ml_predictions_total", "Total ML predictions", ["severity"])
prediction_duration = Histogram("ml_prediction_duration_seconds", "ML prediction duration")
prediction_confidence = Histogram("ml_prediction_confidence", "ML prediction confidence")
classification_errors = Counter("ml_classification_errors_total", "Total classification errors")

# Fields reported in /api/model/metadata, rounded to 4 places.
METADATA_PRECISION = 4
TOP_FEATURES_COUNT = 15


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if not classifier.load_model():
        print("⚠️ Warning: Model not loaded. Run: python -m chronolog_ml.train_model")
    yield


app = FastAPI(title="ChronoLog ML Service", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class ClassifyRequest(BaseModel):
    message: str


class BatchRequest(BaseModel):
    messages: list[str]


def error(status_code: int, message: str) -> JSONResponse:
    """The one error shape this service returns."""
    return JSONResponse({"status": "error", "message": message}, status_code=status_code)


@app.exception_handler(RequestValidationError)
async def on_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    classification_errors.inc()
    first = exc.errors()[0] if exc.errors() else {}
    field = first.get("loc", ("body",))[-1]
    if field == "message":
        return error(400, "Missing 'message' in request body")
    if field == "messages" and first.get("type") == "missing":
        return error(400, "Missing 'messages' array in request body")
    if field == "messages":
        return error(400, "'messages' must be an array")
    return error(400, "Invalid request body")


@app.get("/health")
def health_check() -> dict[str, Any]:
    return {
        "status": "success",
        "message": "ML Service is running",
        "model_loaded": classifier.is_trained,
    }


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/api/classify", response_model=None)
def classify_log(body: ClassifyRequest) -> Response | dict[str, Any]:
    """Classify a single log message."""
    start = time.perf_counter()
    if not classifier.is_trained:
        classification_errors.inc()
        return error(503, "Model not loaded. Please train the model first.")
    try:
        result = classifier.predict(body.message)
        prediction_counter.labels(severity=result["predicted_severity"]).inc()
        prediction_confidence.observe(result["confidence"])
        prediction_duration.observe(time.perf_counter() - start)
        return {"status": "success", "data": result}
    except Exception as exc:
        classification_errors.inc()
        prediction_duration.observe(time.perf_counter() - start)
        return error(500, str(exc))


@app.post("/api/classify/batch", response_model=None)
def classify_batch(body: BatchRequest) -> Response | dict[str, Any]:
    """Classify several log messages."""
    start = time.perf_counter()
    if not classifier.is_trained:
        classification_errors.inc()
        return error(503, "Model not loaded")
    try:
        results = classifier.predict(body.messages)
        for result in results:
            prediction_counter.labels(severity=result["predicted_severity"]).inc()
            prediction_confidence.observe(result["confidence"])
        prediction_duration.observe(time.perf_counter() - start)
        return {"status": "success", "data": results, "count": len(results)}
    except Exception as exc:
        classification_errors.inc()
        prediction_duration.observe(time.perf_counter() - start)
        return error(500, str(exc))


@app.get("/api/model/info", response_model=None)
def model_info() -> Response | dict[str, Any]:
    if not classifier.is_trained:
        return error(503, "Model not loaded")
    try:
        return {
            "status": "success",
            "data": {
                "model_loaded": True,
                "classes": classifier.label_encoder.classes_.tolist(),
                "num_features": len(classifier.vectorizer.get_feature_names_out()),
                "top_features": classifier.get_feature_importance(TOP_FEATURES_COUNT),
                "model_path": str(MODEL_PATH),
            },
        }
    except Exception as exc:
        return error(500, str(exc))


@app.get("/api/model/metadata", response_model=None)
def model_metadata() -> Response | dict[str, Any]:
    """Training metadata: date, version, accuracy, per-class scores."""
    try:
        if not METRICS_PATH.exists():
            return error(404, "training_metrics.json not found — run train_model first")

        metrics_data = json.loads(METRICS_PATH.read_text())
        class_distribution = {
            cls: {
                "precision": round(scores["precision"], METADATA_PRECISION),
                "recall": round(scores["recall"], METADATA_PRECISION),
                "f1_score": round(scores["f1-score"], METADATA_PRECISION),
                "support": int(scores["support"]),
            }
            for cls, scores in metrics_data.get("classification_report", {}).items()
            if isinstance(scores, dict) and "f1-score" in scores
        }
        return {
            "status": "success",
            "data": {
                "version": metrics_data.get("version", "1.0.0"),
                "training_date": metrics_data.get("training_date"),
                "accuracy": round(metrics_data.get("accuracy", 0), METADATA_PRECISION),
                "training_samples": metrics_data.get("training_samples"),
                "test_samples": metrics_data.get("test_samples"),
                "classes": metrics_data.get("classes", []),
                "class_distribution": class_distribution,
                "model_loaded": classifier.is_trained,
            },
        }
    except Exception as exc:
        return error(500, str(exc))


@app.post("/api/model/retrain", response_model=None)
def retrain_model() -> Response:
    """Reserved for a later phase."""
    return error(501, "Retraining endpoint not yet implemented")
