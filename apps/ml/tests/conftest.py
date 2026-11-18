import pytest

from chronolog_ml.config import MODEL_PATH
from chronolog_ml.train_model import train_model


@pytest.fixture(scope="session", autouse=True)
def trained_model() -> None:
    """Train once if no model exists, so tests never skip in CI."""
    if not MODEL_PATH.exists():
        train_model()
