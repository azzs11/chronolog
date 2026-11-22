# ChronoLog 2.0 Roadmap

**Goal:** turn ChronoLog into an open, explainable root-cause engine for logs that publishes its own
benchmark scores. It should find what broke first, show the evidence, and say how often it is right.

## Why

Today the engine uses hand-tuned rules and has only been tested on synthetic logs.
Nothing yet measures whether a detected "root cause" is the real one.
The 2.0 work closes that gap first, then improves the engine against a measured baseline.
The current rules stay in the repo as the baseline, **ChronoLog-H**.

## Where things stand

- **Phases 0 to 3 are done.** The benchmark, RootRank, its ablation, robustness checks, learned service graph and an
  end-to-end test with an estimated incident start are published in [`bench/results/`](../bench/results/).
- **Phase 7 is nearly done.** The Arcade (a training game with real RCAEval incidents) and a command-line tool exist, and
  the demo is live at [chronolog.akchhya.xyz](https://chronolog.akchhya.xyz/) (GitHub Pages, see [DEPLOY.md](DEPLOY.md)).
  The demo video is still to do.
- Counterfactual blast radius was dropped for real incidents (RCAEval has no affected-service labels to score it
  against); it can be measured in the simulator, where affected services are known by construction.
- Phases 6, 4, 5 and 8 have not started.

## Phases

Phases run in this order: 0 → 1 → 2 → 3 → 7 → 6 → 4 → 5 → 8.
Each finished phase is tagged `v2.0-pN`.

| Phase | Focus | Done when |
| --- | --- | --- |
| 0 | Honesty and housekeeping: fix links and naming, add a license, give an honest comparison, remove unmeasured claims, read secrets from `.env` | No stale names or unmeasured claims remain; Compose starts |
| 1 | Foundation: monorepo (`apps/web`, `apps/api`, `apps/ml`, `packages/engine`, `bench/`), Vite + TypeScript, Node 22, FastAPI + uv | All existing tests pass; the engine package has no I/O imports |
| 2 | ChronoBench: replay real incidents (RCAEval, Loghub) through the engine and measure AC@k against simple baselines | One command reproduces `RESULTS.md` |
| 3 | Engine v2: log templates (Drain3), a service graph learned from logs, and RootRank (learning-to-rank root causes) | AC@3 vs ChronoLog-H reported over 5 seeds, with an ablation table |
| 7 | Live demo: a browser-only Fault Playground and a real-incident replay | The demo link works on a phone with no backend |
| 6 | UI/UX redesign: an incident-first interface, tested with users against the old UI (kit: [docs/user-test](user-test/README.md)) | User test results published |
| 4 | Anomaly detection v2: a template-based detector; the severity model is kept only for logs with no level | F1 and detection delay reported on HDFS and BGL |
| 5 | Evidence-locked incident stories: an optional LLM narrative where every sentence cites log lines | Citation precision reported; the app works fully with the LLM off |
| 8 | README, technical report and write-up | Published |

## Rules for numbers

- Train/test splits are fixed by incident case ID before any tuning.
- Results are reported as a mean and spread over 5 seeds, and failures are published too.
- Every number in the README or UI names its dataset and links to the script that produced it.
