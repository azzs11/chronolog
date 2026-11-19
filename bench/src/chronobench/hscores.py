"""Cache ChronoLog-H's per-service scores for every case, so RootRank can use them as a feature.

The score is the same quantity ChronoLog-H ranks by: blast radius summed over incident-window logs
and credited to the service that logged the chain root. Replaying a case takes 10-14 s, so the
scores are computed once and stored in ``data/cache/hscores.<code fingerprint>.json``.
"""

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .adapt import load_case_logs
from .cases import DATA_DIR, Case
from .evaluate import code_fingerprint
from .runner import run_chronolog_h


def cache_path() -> Path:
    return DATA_DIR.parent / "cache" / f"hscores.{code_fingerprint()}.json"


def _scores_for(case: Case) -> tuple[str, dict[str, float]]:
    return case.case_id, run_chronolog_h(load_case_logs(case)).scores


def compute_hscores(cases: list[Case], workers: int) -> dict[str, dict[str, float]]:
    path = cache_path()
    scores: dict[str, dict[str, float]] = json.loads(path.read_text()) if path.exists() else {}
    todo = [c for c in cases if c.case_id not in scores]
    path.parent.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=workers) as pool:  # each worker waits on a Node process
        for case_id, result in pool.map(_scores_for, todo):
            scores[case_id] = result
            path.write_text(json.dumps(scores, sort_keys=True))
    return scores


def load_hscores() -> dict[str, dict[str, float]] | None:
    path = cache_path()
    return json.loads(path.read_text()) if path.exists() else None
