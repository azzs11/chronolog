"""Paths, training settings and model parameters. Read from the environment once, at import."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# apps/ml/ (this file lives in apps/ml/src/chronolog_ml/)
BASE_DIR = Path(__file__).resolve().parents[2]
MODEL_DIR = BASE_DIR / "models"
DATA_DIR = BASE_DIR / "data"

MODEL_DIR.mkdir(exist_ok=True)
DATA_DIR.mkdir(exist_ok=True)

HOST = os.getenv("ML_HOST", "0.0.0.0")
PORT = int(os.getenv("ML_PORT", "5001"))

MODEL_PATH = MODEL_DIR / "log_classifier.pkl"
VECTORIZER_PATH = MODEL_DIR / "vectorizer.pkl"
LABEL_ENCODER_PATH = MODEL_DIR / "label_encoder.pkl"
METRICS_PATH = MODEL_DIR / "training_metrics.json"

TRAINING_DATA_SIZE = int(os.getenv("TRAINING_DATA_SIZE", "5000"))
TEST_SIZE = float(os.getenv("TEST_SIZE", "0.2"))
RANDOM_STATE = int(os.getenv("RANDOM_STATE", "42"))

SEVERITY_LEVELS = ["critical", "error", "warning", "info", "debug"]

# Hand-picked in ChronoLog v1; not tuned on real data.
MODEL_PARAMS = {
    "n_estimators": 100,
    "max_depth": 20,
    "min_samples_split": 5,
    "min_samples_leaf": 2,
    "random_state": RANDOM_STATE,
}
