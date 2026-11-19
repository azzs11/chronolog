# ◈ ChronoLog

> Real-time log intelligence with causal chain detection

[![CI](https://github.com/azzs11/chronolog/actions/workflows/ci.yml/badge.svg)](https://github.com/azzs11/chronolog/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-22-339933?logo=node.js)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python)](https://python.org/)

**ChronoLog** is an open, self-hosted log monitoring system that links log events into
*causal chains*. It shows you what broke, what probably caused it, and how far the damage spread.

> **Status:** ChronoLog 2.0 is in progress. It now ships a learned root-cause ranker, **RootRank**, that is measured
> on real incidents and clearly beats the older hand-tuned rules, though it is far from perfect. See
> [Benchmark](#benchmark) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Try it

- **Fault Playground** (no install): break a simulated system, or replay five real incidents, and see whether ChronoLog
  finds the broken service. It runs entirely in your browser: `npm run build:demo -w chronolog-web`, and
  [docs/DEPLOY.md](docs/DEPLOY.md) explains hosting it. Locally, open the **Playground** view of the app.
- **Your own logs** from the command line, one file per service:

  ```bash
  npm ci && npm run build
  node apps/cli/dist/cli.js analyze logs/api.log logs/db.log logs/cache.log --start 2026-11-19T10:02:00Z
  ```

  Plain-text lines that begin with a time, and JSON lines, are understood. If you leave out `--start`, ChronoLog
  estimates when the incident began (less accurate). Nothing leaves your machine.
- **The running app**: `docker compose up -d`, then the **Root Cause** view or `POST /api/rca/rank` (below).

---

## Benchmark

Every number below comes from a script in this repo. The data is 359 real incidents from
[RCAEval](https://github.com/phamquiluan/RCAEval) (RE2 and RE3, logs only). The question is: does the method name
the true root-cause service in its top 3 (AC@3)? Intervals are 95% bootstrap intervals that resample whole
(system, root service) groups, because several incidents are repeats of the same fault on the same service.

| Method | AC@3 | 95% interval |
|---|---|---|
| Random guessing | 10.7% | ± 4.8 over 5 seeds |
| First service to log an error | 28.1% | 16–41% |
| ChronoLog-H (the hand-written rules the app runs today) | 26.5% | 14–40% |
| **RootRank** (learned ranker; whole root services held out of training) | **52.6%** | 43–61% |

On the same cases RootRank beats first-error by 24.5 points (interval +10.6 to +36.6) and ChronoLog-H by 26.2
points (+10.5 to +40.3). ChronoLog-H is better than chance but not distinguishable from the trivial baseline.

What to know before quoting these:

- **Easy and hard faults differ a lot.** On the 90 Train Ticket code-fault cases RootRank is right every time, and
  the reason is measured: those faults were injected by restarting the service, so in 81 of 90 cases the faulty
  service logs shutdown or startup lines it never logged before. That is a real production signal too, but an
  artifact of this benchmark's fault injection. On the 269 resource-fault cases (cpu, memory, disk, delay, packet
  loss, socket) RootRank gets **36.8%**, against 20.8% for first-error.
- **One signal does most of the work:** templates a service never logged before. Two further feature families I
  tried did not help, and ChronoLog-H's own score made RootRank worse.
- **It holds up on messy logs:** dropping 40% of lines costs 1.3 points; ±2 s of clock skew costs 0.4; a 60 s outage of
  all logs or a 120 s outage of one service, placed at random, costs under half a point (a gap that hides the faulty
  service exactly when it breaks would cost more).
- **Leaving one whole system out** gives 53.5%. Splitting by case id would give a higher number, because the model
  could recognise repeated services, so the strict figure is the one to quote.
- In 26 of the 359 cases the faulty service writes no logs, so no log-based method can name it.
- **The service graph can be learned from logs, unevenly.** Compared with the real call graphs of Online Boutique and
  Sock Shop (Train Ticket is not scored), "A's logs name B" edges have 93% precision on Sock Shop but 2% on Online
  Boutique, whose logs never name other services; volume-correlation edges reach F1 51% there. Neither wins everywhere
  ([RESULTS-graph.md](bench/results/RESULTS-graph.md), `uv run bench graph`; served by `GET /api/rca/graph`).
- **Anomaly detection is weak.** On Loghub HDFS and BGL the current rules score F1 1.5% and 19.1%, and a plain
  "flag error lines" rule gets 67.9% on BGL.
- **RootRank is in the app** (the Root Cause view, and `POST /api/rca/rank`, below). Given the true incident start it
  scores 53.2% AC@3 on randomly cropped windows. When the start is estimated from the logs instead, as the app does if
  you do not give one, it scores **45.0%** (36–53%); the old "first error line" rule for finding the start scored 31.6%
  ([RESULTS-autostart.md](bench/results/RESULTS-autostart.md), `uv run bench autostart`). The estimate finds *when* the
  logs changed most; it cannot tell a calm window from an incident, so you tell it something went wrong.

Details: [RESULTS-rootrank.md](bench/results/RESULTS-rootrank.md) (`uv run bench rootrank`),
[RESULTS-ablation.md](bench/results/RESULTS-ablation.md) (`uv run bench ablate`),
[RESULTS-robustness.md](bench/results/RESULTS-robustness.md) (`uv run bench robustness`),
[RESULTS-anomaly.md](bench/results/RESULTS-anomaly.md) (`uv run bench anomaly`),
[RESULTS-full.md](bench/results/RESULTS-full.md) and [RESULTS.md](RESULTS.md) (`uv run bench all`).

---

## How ChronoLog Differs

Automated root-cause analysis is not new. Commercial tools already do it well:
[Datadog Watchdog RCA](https://docs.datadoghq.com/watchdog/)
has been generally available since 2021, and Datadog's Bits AI SRE investigates alerts on its own.
ChronoLog aims to be different in four ways:

- **Open:** the engine, the rules and the data pipeline are all MIT-licensed and readable.
- **Explainable:** every causal link comes with the signals that created it (timing, severity, shared entities, service dependency).
- **Benchmarked (planned):** root-cause accuracy will be measured on public RCA benchmarks, and every number will link to the script that produced it.
- **Self-hosted:** one `docker compose up` on your own machine. No log data leaves it.

---

## Causal Intelligence

When your database goes down, ChronoLog shows you:

```
[CRITICAL] db: connection pool exhausted          ← ROOT CAUSE (blast radius: 14.2)
  └─[ERROR]  api: failed to fetch user data        ← depth 1
      └─[ERROR]  auth: session validation failed   ← depth 2
          └─[WARNING] api: returning 503           ← depth 3

Fix the root node. The downstream symptoms resolve automatically.
```

The causal engine works by correlating log timestamps, source services, and error signatures
within a sliding 30-second window. When a chain is detected, a `causal:chain-detected`
WebSocket event fires within 500ms and the D3 graph updates live.

---

## Architecture

```mermaid
graph TD
    A[Browser / React 19] -->|WebSocket + REST| B[Node.js Backend :5000]
    B -->|HTTP| C[ML Service :5001]
    B -->|SQL| D[(PostgreSQL :5432)]
    B -->|metrics| E[Prometheus :9090]
    E --> F[Grafana :3001]
    C -->|scikit-learn| G[Random Forest Model]
```

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS 3, D3.js, Socket.io-client |
| Backend | Node.js 22, TypeScript, Express, Socket.io, Winston |
| ML Service | Python 3.12, FastAPI, scikit-learn |
| Database | PostgreSQL 15 |
| Monitoring | Prometheus, Grafana |
| Infrastructure | Docker, nginx |

---

## ML Model

- **Algorithm**: Random Forest with TF-IDF (n-grams 1–3)
- **Task**: predicts a log's severity level from its message text
- **Training data**: synthetic logs from `apps/ml/src/data_generator.py`
- **Accuracy**: not reported yet. Scores on synthetic data say little about real logs, so
  no number is shown until the model is evaluated on real, labelled datasets.

Real logs usually carry their own level, so the roadmap repurposes this model for logs that
arrive without one.

---

## Quick Start

```bash
git clone https://github.com/azzs11/chronolog.git
cd chronolog
cp .env.example .env   # then set your own passwords, including GRAFANA_PASSWORD
docker compose up -d                        # app only: 4 containers
docker compose --profile monitoring up -d   # also Prometheus + Grafana
docker compose down                         # stop and remove everything
```

Each container has a memory cap (about 1.1 GB for the app, 1.6 GB with monitoring).

Open [http://localhost:3000](http://localhost:3000)

| Service | URL | Credentials |
|---------|-----|-------------|
| App | http://localhost:3000 | — |
| Backend API | http://localhost:5050 (`BACKEND_PORT`) | — |
| ML Service | http://localhost:5001 | — |
| Grafana (monitoring profile) | http://localhost:3001 | `admin` / `GRAFANA_PASSWORD` from `.env` |
| Prometheus (monitoring profile) | http://localhost:9090 | — |

> **First run**: the `ml-service` container trains the model during build (`~30s`).
> Subsequent starts use the cached image and are instant.

---

## Development (without Docker)

### Backend

```bash
npm install                          # at the repo root (npm workspaces)
npm run build                        # builds packages/engine
npm run dev -w chronolog-backend     # tsx watch, port 5000
```

### ML Service

```bash
cd apps/ml                                  # needs uv: https://docs.astral.sh/uv/
uv sync                                     # Python 3.12 + dependencies
uv run python -m chronolog_ml.train_model   # one-time
uv run uvicorn chronolog_ml.app:app --port 5001
uv run pytest && uv run ruff check .        # tests and lint
```

### Frontend

```bash
npm run dev -w chronolog-web     # Vite dev server, port 3000
```

Set `VITE_API_URL=http://localhost:5000` and `VITE_WS_URL=http://localhost:5000` in
`apps/web/.env` if your backend is not on port 5000.

---

## API Reference

All endpoints return `{ status, data, meta }`.

### Backend (`:5000`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/logs` | Paginated log list (`?limit=50&offset=0&severity=error`) |
| `POST` | `/api/logs` | Ingest a log entry |
| `GET` | `/api/logs/stats` | Severity counts + throughput |
| `GET` | `/api/anomalies` | Detected anomalies |
| `POST` | `/api/rca/rank` | Rank the services most likely to have caused an incident (see below) |
| `GET` | `/api/metrics` | Prometheus metrics |

#### `POST /api/rca/rank`

Ranks which service most likely broke first, with evidence. Body, all optional:

- `incident_start`: Unix seconds or an ISO time. If you leave it out, ChronoLog estimates it from the logs.
- `lookback_minutes` (1 to 120, default 15): which stored logs to use, when you do not send `logs`.
- `logs`: up to 20,000 lines `{ timestamp, source, message, severity?, id? }` to rank instead of the stored logs.

```bash
curl -X POST localhost:5050/api/rca/rank -H 'Content-Type: application/json' -d '{"lookback_minutes": 15}'
```

Each candidate has a `rank`, a relative `weight` (not a probability) and `evidence` built from real log lines: when it
first logged an error, the messages it never logged before (with a log id), and how often other services mention it.
It answers `422` if the logs span under 4 minutes (too short to estimate a start) or there are no logs. The accuracy
you should expect is in the [Benchmark](#benchmark) section.

### ML Service (`:5001`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health + model metadata |
| `POST` | `/api/classify` | Classify a single log message |
| `POST` | `/api/classify/batch` | Classify up to 100 messages |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `log:new` | server → client | New log entry ingested |
| `log:stats` | server → client | Updated severity counts |
| `causal:chain-detected` | server → client | New causal chain identified |
| `anomaly:detected` | server → client | Temporal anomaly fingerprint |

---

## Environment Variables

Copy `.env.example` to `.env` and change values for production.

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | `debug_secret` | PostgreSQL password |
| `ADMIN_API_KEY` | `dev_key_change_in_prod` | Admin endpoint key |
| `GRAFANA_PASSWORD` | none (required) | Grafana admin password. Compose refuses to start without it |

---

## Screenshots

<div align="center">

<img src="./images/Dashboard-1.png" alt="Dashboard Overview" width="800"/>

**Main Dashboard — real-time log stream with causal chain overlay**

<br/>

<img src="./images/Dashboard-2.png" alt="ML Analytics" width="800"/>

**ML Analytics — confidence scores and severity distribution**

<br/>

<img src="./images/Grafana-1.png" alt="Grafana" width="800"/>

**Grafana — throughput, WebSocket connections, ML latency**

</div>

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [roadmap](docs/ROADMAP.md).

---

## License

[MIT](LICENSE) — free for personal and commercial use.

---

## Author

**Akchhya Singh** — [GitHub](https://github.com/azzs11) · [LinkedIn](https://linkedin.com/in/akchhya-singh11) · akchhya.dev@gmail.com
