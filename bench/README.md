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
