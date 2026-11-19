"""How much does RootRank degrade when logs are lost or clocks disagree?

A deployed model is trained on whatever data it had and then meets messy logs, so the model is
trained on CLEAN data and only the held-out cases are degraded. Folds, seeds and rounds are the
headline protocol (whole root services held out, 5 seeds). First-error is degraded the same way.

Perturbations (all seeded by case id and seed, so runs repeat exactly):
  drop p   each log line is removed independently with probability p.
  skew s   each service's clock is shifted by a whole number of seconds drawn uniformly from
           -s..+s (timestamps are whole seconds), then lines are re-sorted by time.
  gap      a burst of lost logs, as in a collector outage: every line in a window of g seconds at a
           random place is removed, either for all services or for one random service.
The injection time is unchanged, so skewed lines can cross it.
"""

import hashlib
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor
from functools import partial

import numpy as np
import pandas as pd

from .adapt import CaseLogs
from .baselines import first_error_ranking
from .cases import Case, parse_case_id
from .features import FEATURES, case_features
from .metrics import ac_at_k, hit_ranks
from .rootrank import CV_FOLDS, SEEDS, fit, fold_of, n_folds, rankings, ranks_for
from .templates import TemplatedCase, template_case

# name -> (drop probability, skew seconds, gap seconds, gap scope)
SCENARIOS = {
    "clean": (0.0, 0, 0, "all"),
    "10% of lines dropped": (0.1, 0, 0, "all"),
    "20% of lines dropped": (0.2, 0, 0, "all"),
    "40% of lines dropped": (0.4, 0, 0, "all"),
    "clock skew of up to 2 s per service": (0.0, 2, 0, "all"),
    "20% dropped and 2 s skew": (0.2, 2, 0, "all"),
    "60 s gap, all services": (0.0, 0, 60, "all"),
    "120 s gap, one random service": (0.0, 0, 120, "service"),
}


def perturb(
    frame: pd.DataFrame,
    drop: float,
    skew_s: int,
    key: str,
    gap_s: int = 0,
    gap_scope: str = "all",
) -> pd.DataFrame:
    """Drop lines, open a gap and shift service clocks, deterministically for a given key."""
    rng = np.random.default_rng(int(hashlib.sha256(key.encode()).hexdigest()[:8], 16))
    out = frame
    if drop > 0:
        out = out[rng.random(len(out)) >= drop]
    if gap_s > 0:
        first, last = int(out["timestamp"].min()), int(out["timestamp"].max())
        begin = int(rng.integers(first, max(last - gap_s, first) + 1))
        inside = (out["timestamp"] >= begin) & (out["timestamp"] < begin + gap_s)
        if gap_scope == "service":
            services = sorted(out["source"].unique())
            inside &= out["source"] == services[int(rng.integers(0, len(services)))]
        out = out[~inside]
    if skew_s > 0:
        services = sorted(frame["source"].unique())
        offsets = dict(zip(services, rng.integers(-skew_s, skew_s + 1, len(services)), strict=True))
        out = out.assign(timestamp=out["timestamp"] + out["source"].map(offsets))
        out = out.sort_values("timestamp", kind="stable")
    return out.reset_index(drop=True)


def _job(
    case_id: str, drop: float, skew_s: int, gap_s: int, gap_scope: str, seed: int
) -> tuple[pd.DataFrame, int | None]:
    case: Case = parse_case_id(case_id)
    tc = template_case(case)
    frame = perturb(tc.frame, drop, skew_s, f"{case_id}:{seed}", gap_s, gap_scope)
    degraded = TemplatedCase(case, tc.inject_time, frame, tc.templates)
    features = case_features(degraded)[FEATURES]
    features.insert(0, "label", (features.index == case.root_service).astype(int))
    features.insert(0, "service", features.index)
    features.insert(0, "case_id", case_id)
    logs = CaseLogs(case=case, inject_time=tc.inject_time, logs=frame)
    first = hit_ranks([first_error_ranking(logs)], [case.root_service])[0]
    return features.reset_index(drop=True), first


def degraded_tables(
    case_ids: Sequence[str],
    scenario: tuple[float, int, int, str],
    seed: int,
    workers: int,
) -> tuple[pd.DataFrame, dict[str, int | None]]:
    drop, skew_s, gap_s, gap_scope = scenario
    job = partial(_job, drop=drop, skew_s=skew_s, gap_s=gap_s, gap_scope=gap_scope, seed=seed)
    with ProcessPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(job, case_ids, chunksize=8))
    table = pd.concat([r[0] for r in results], ignore_index=True)
    return table, {c: r[1] for c, r in zip(case_ids, results, strict=True)}


def _fold_models(clean: pd.DataFrame, rounds: int) -> dict[tuple[int, int], object]:
    models = {}
    for seed in SEEDS:
        folds = clean["case_id"].map(lambda c, s=seed: fold_of(c, "service", s))
        for k in range(n_folds("service")):
            if (folds == k).any():
                models[(seed, k)] = fit(clean[folds != k], FEATURES, rounds, seed)
    return models


def _rootrank_ranks(models: dict, test: pd.DataFrame, seed: int) -> list[int | None]:
    folds = test["case_id"].map(lambda c: fold_of(c, "service", seed))
    ranked: dict[str, list[str]] = {}
    for k in range(CV_FOLDS):
        held = test[folds == k]
        if not held.empty:
            ranked.update(rankings(models[(seed, k)], held, FEATURES))
    return ranks_for(ranked)


def run_robustness(clean: pd.DataFrame, rounds: int, workers: int) -> dict:
    case_ids = sorted(clean["case_id"].unique())
    models = _fold_models(clean, rounds)
    result: dict = {"rounds": rounds, "cases": len(case_ids), "scenarios": {}}
    for name, scenario in SCENARIOS.items():
        rr, fe = {}, {}
        deterministic = scenario[0] == 0 and scenario[1] == 0 and scenario[2] == 0  # nothing random
        table = first = None
        for seed in SEEDS:
            if table is None or not deterministic:
                table, first = degraded_tables(case_ids, scenario, seed, workers)
            # the seed still sets the fold partition and the model, even when the logs are identical
            rr[str(seed)] = _rootrank_ranks(models, table, seed)
            fe[str(seed)] = [first[c] for c in case_ids]
        result["scenarios"][name] = {"rootrank": rr, "first_error": fe}
    return result


def summarise(ranks_by_seed: dict[str, list[int | None]], k: int) -> tuple[float, float]:
    values = [ac_at_k(r, k) for r in ranks_by_seed.values()]
    return float(np.mean(values)), float(np.std(values))
