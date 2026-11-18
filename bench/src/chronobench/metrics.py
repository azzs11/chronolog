"""Ranking metrics for root-cause localisation (RCAEval definitions).

A method returns, for each case, a list of services ordered from most to least likely root cause.
AC@k is the share of cases whose true service is in the first k. Avg@k is the mean of AC@1..AC@k.
"""

from collections.abc import Sequence

import numpy as np

KS = (1, 3, 5)
AVG_K = 5
BOOTSTRAP_RESAMPLES = 1000
BOOTSTRAP_SEED = 2026


def hit_ranks(rankings: Sequence[Sequence[str]], truths: Sequence[str]) -> list[int | None]:
    """1-based rank of the true service in each ranking, or None if it is not ranked."""
    ranks: list[int | None] = []
    for ranking, truth in zip(rankings, truths, strict=True):
        ranks.append(ranking.index(truth) + 1 if truth in ranking else None)
    return ranks


def ac_at_k(ranks: Sequence[int | None], k: int) -> float:
    if not ranks:
        return float("nan")
    return sum(1 for r in ranks if r is not None and r <= k) / len(ranks)


def avg_at_k(ranks: Sequence[int | None], k: int = AVG_K) -> float:
    return float(np.mean([ac_at_k(ranks, i) for i in range(1, k + 1)]))


def mrr(ranks: Sequence[int | None]) -> float:
    if not ranks:
        return float("nan")
    return float(np.mean([1.0 / r if r is not None else 0.0 for r in ranks]))


def summarise(ranks: Sequence[int | None]) -> dict[str, float]:
    out = {f"ac@{k}": ac_at_k(ranks, k) for k in KS}
    out[f"avg@{AVG_K}"] = avg_at_k(ranks)
    out["mrr"] = mrr(ranks)
    return out


def bootstrap_ci(ranks: Sequence[int | None], k: int, level: float = 0.95) -> tuple[float, float]:
    """Percentile bootstrap interval for AC@k, resampling cases with a fixed seed."""
    if not ranks:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    hits = np.array([1.0 if r is not None and r <= k else 0.0 for r in ranks])
    means = rng.choice(hits, size=(BOOTSTRAP_RESAMPLES, len(hits)), replace=True).mean(axis=1)
    tail = (1 - level) / 2
    low, high = np.quantile(means, [tail, 1 - tail])
    return (float(low), float(high))
