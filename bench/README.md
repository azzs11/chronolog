# ChronoBench

Reproducible benchmark for root-cause localisation. It replays real incidents through ChronoLog and
simple baselines and reports how often the true root-cause service is ranked first, in the top 3 and
in the top 5.

## Data

[RCAEval](https://github.com/phamquiluan/RCAEval) (MIT), RE2 and RE3 cases, from Hugging Face pinned to
one dataset revision (`index/rcaeval_cases.json`). Only `logs.parquet` and `inject_time.txt` are downloaded.
RCAEval's `root_cause.txt` files contain the answer and are never read.

Each case is a 24-minute window (12 minutes either side of the fault injection) of container logs
from one of three microservice systems: Online Boutique (`ob`), Sock Shop (`ss`), Train Ticket (`tt`).
The ground truth is the service the fault was injected into, which is encoded in the case id.

## Setup

```bash
cd bench
uv sync
uv run bench select --subset small      # writes subsets/small.json (40 cases, already committed)
uv run bench download --subset small    # about 36 MB into bench/data/ (gitignored)
uv run pytest && uv run ruff check .
```

## Run it

```bash
npm ci && npm run build                 # once, at the repo root: builds the engine and the Node replay runner
cd bench && uv run bench all            # download, evaluate every method, write results and ../RESULTS.md
uv run bench replay <case_id>           # one case: where does ChronoLog-H rank the true service?
```

`bench all` takes about 4 minutes for the 40-case subset and is deterministic: two runs give byte-identical
`results/rcaeval-small.json` and `RESULTS.md`. Both are committed.

## Methods

| Method | Definition |
|---|---|
| Random | Candidate services in a seeded random order; 5 seeds. |
| First error | Services in the order they first log an error-level line in the incident window. |
| Most frequent error | Services by number of error-level lines in the window. |
| Most logs | Services by number of log lines in the window. A diagnostic added after the first two ChronoLog-H replays showed it ranking the chattiest services first; it shows how much of a score log volume alone explains. It was never used to tune anything. |
| **ChronoLog-H** | The v1 rules (`packages/engine`): each log is linked to a causal parent. Every in-window log in a chain adds its blast radius to the service that logged the chain's root; services are ranked by that total (`runner/src/ranker.ts`). |

"Error-level" means `error` or `critical` after the log adapter. Ties are broken alphabetically.

## Rules of the benchmark

- **Frozen split.** A case is a test case if `sha256(case_id) % 100 < 30`. The split never changes and a larger
  subset can never move a case from test to train. Nothing is tuned on test cases.
- **Same input for every method.** Every method sees the case's logs. The injection time only marks the start of
  the incident window: logs before it warm up streaming state, and only logs at or after it count.
- **Log adapter v1** (`adapt.py`). RCAEval logs have no severity, so it is read from the message text with fixed
  rules. They were fixed before any result was measured.
- **Every candidate is ranked.** Candidates are all containers that logged. Services a method does not score
  are appended alphabetically.
- **Unreachable cases stay in.** If the true service never writes a log in a case, no log-based method can find
  it. The case still counts as a miss, and reports state how many cases are reachable.
- **Honest uncertainty.** AC@k comes with a 95% bootstrap interval over cases. Stochastic methods use 5 seeds.
