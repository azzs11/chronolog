"""Run every method on every case and collect the results."""

import hashlib
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import __version__
from .adapt import ADAPTER_VERSION, CaseLogs, load_case_logs
from .baselines import (
    complete_ranking,
    first_error_ranking,
    most_frequent_error_ranking,
    most_logs_ranking,
    random_ranking,
)
from .cases import TEST_PERCENT, Case, load_index
from .metrics import AVG_K, BOOTSTRAP_RESAMPLES, KS
from .runner import REPO_ROOT, ReplayResult, run_chronolog_h

SEEDS = (0, 1, 2, 3, 4)
TOP_SHOWN = 5
DEFAULT_WORKERS = 4

# Methods in table order. "random" is run once per seed; the rest are deterministic.
METHODS = ("random", "first_error", "most_frequent_error", "most_logs", "chronolog_h")

ReplayFn = Callable[[CaseLogs], ReplayResult]


def _rank_of(ranking: list[str], truth: str) -> int | None:
    return ranking.index(truth) + 1 if truth in ranking else None


def evaluate_case(logs: CaseLogs, replay: ReplayFn = run_chronolog_h) -> dict:
    """All methods' outcomes on one case: the true service's rank and the top of each ranking."""
    case = logs.case
    candidates = logs.services()
    truth = case.root_service

    h = replay(logs)
    h_ranking = complete_ranking(h.ranking, candidates)
    deterministic = {
        "first_error": first_error_ranking(logs),
        "most_frequent_error": most_frequent_error_ranking(logs),
        "most_logs": most_logs_ranking(logs),
        "chronolog_h": h_ranking,
    }
    return {
        "case_id": case.case_id,
        "dataset": case.dataset,
        "system": case.system,
        "fault": case.fault,
        "root_service": truth,
        "split": case.split,
        "candidates": len(candidates),
        "reachable": truth in candidates,
        "log_lines": h.stats["logs"],
        "linked_lines": h.stats["linked"],
        "methods": {
            name: {"rank": _rank_of(ranking, truth), "top": ranking[:TOP_SHOWN]}
            for name, ranking in deterministic.items()
        },
        "random_ranks": {str(seed): _rank_of(random_ranking(logs, seed), truth) for seed in SEEDS},
    }


def _evaluate_by_id(case: Case) -> dict:
    return evaluate_case(load_case_logs(case))


def evaluate_cases(cases: list[Case], workers: int = DEFAULT_WORKERS) -> list[dict]:
    """Evaluate cases in parallel (each replay is a separate Node process). Order is preserved."""
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(_evaluate_by_id, cases))


# Each fingerprint hashes exactly the files that define a method's output, listed by name, so an
# unrelated edit (a new export, a new feature in the engine) cannot invalidate published results.
ENGINE_SRC = REPO_ROOT / "packages" / "engine" / "src"
RUNNER_SRC = REPO_ROOT / "bench" / "runner" / "src"
FINGERPRINT_FILES = {
    "rca": [
        *(ENGINE_SRC / n for n in (
            "causalEngine.ts", "constants.ts", "entities.ts", "scoring.ts",
            "serviceGraph.ts", "sha256.ts", "types.ts",
        )),
        *(RUNNER_SRC / n for n in ("ranker.ts", "replay.ts")),
        Path(__file__).with_name("adapt.py"),
    ],
    "anomaly": [
        *(ENGINE_SRC / n for n in ("anomalyDetector.ts", "constants.ts", "sha256.ts", "types.ts")),
        *(RUNNER_SRC / n for n in ("anomaly.ts", "anomaly-replay.ts")),
        Path(__file__).with_name("loghub.py"),
    ],
}  # fmt: skip


def code_fingerprint(kind: str = "rca") -> str:
    """Hash of the code that defines a method's output, so results name the rules they used."""
    digest = hashlib.sha256()
    for path in sorted(FINGERPRINT_FILES[kind]):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:16]


def build_results(subset: str, cases: list[dict]) -> dict:
    index = load_index()
    return {
        "meta": {
            "benchmark": "ChronoBench",
            "bench_version": __version__,
            "subset": subset,
            "dataset": index["dataset"],
            "dataset_revision": index["revision"],
            "adapter_version": ADAPTER_VERSION,
            "code_fingerprint": code_fingerprint(),
            "test_percent": TEST_PERCENT,
            "seeds": list(SEEDS),
            "ks": list(KS),
            "avg_k": AVG_K,
            "bootstrap_resamples": BOOTSTRAP_RESAMPLES,
            "methods": list(METHODS),
        },
        "cases": cases,
    }
