# ChronoLog ML service

FastAPI service that predicts a log's severity from its message text
(TF-IDF 1-3 grams + Random Forest). It is trained on synthetic logs only; no accuracy
number is reported until it is measured on real, labelled data.

## Run

```bash
uv sync
uv run python -m chronolog_ml.train_model        # writes models/*.pkl
uv run uvicorn chronolog_ml.app:app --port 5001
```

## Test and lint

```bash
uv run pytest
uv run ruff check . && uv run ruff format --check .
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness and whether the model is loaded |
| `GET` | `/metrics` | Prometheus metrics |
| `POST` | `/api/classify` | `{ "message": "..." }` → predicted severity, confidence, probabilities |
| `POST` | `/api/classify/batch` | `{ "messages": [...] }` → one prediction per message |
| `GET` | `/api/model/info` | Classes, feature count, top features |
| `GET` | `/api/model/metadata` | Training date, sample counts, per-class scores |
| `POST` | `/api/model/retrain` | Not implemented (returns 501) |

Errors always look like `{ "status": "error", "message": "..." }`. FastAPI also serves
interactive docs at `/docs`.

## Layout

```
src/chronolog_ml/   app.py (API) · classifier.py · train_model.py · data_generator.py · config.py
tests/              classifier and API tests
models/             trained artifacts (gitignored)
```
