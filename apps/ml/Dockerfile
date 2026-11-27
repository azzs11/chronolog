FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.9 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1

# Dependencies first so this layer is cached until pyproject.toml / uv.lock change.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src
RUN uv sync --frozen --no-dev

# Train at build time. The model is synthetic-data only.
RUN python -m chronolog_ml.train_model

EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5001/health')" || exit 1
CMD ["uvicorn", "chronolog_ml.app:app", "--host", "0.0.0.0", "--port", "5001"]
