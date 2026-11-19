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


def group_of(case_id: str) -> str:
    """Cluster key for a case: its system and root service. Instances of the same fault on the same
    service are near-copies, so they must be resampled together, not as independent cases."""
    system, service = case_id.split("_")[0][3:], case_id.split("_")[1]
    return f"{system}/{service}"


def cluster_bootstrap(
    hits: np.ndarray, groups: Sequence[str], level: float = 0.95
) -> tuple[float, float]:
    """Percentile interval for a mean of per-case hits, resampling whole groups with replacement.

    Wider than a case-level bootstrap whenever cases within a group are alike, which is the honest
    width here. Fixed seed, so results repeat exactly.
    """
    labels = np.asarray(groups)
    names = sorted(set(labels))
    sums = np.array([hits[labels == g].sum() for g in names], dtype=float)
    sizes = np.array([(labels == g).sum() for g in names], dtype=float)
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    picks = rng.integers(0, len(names), size=(BOOTSTRAP_RESAMPLES, len(names)))
    means = sums[picks].sum(axis=1) / sizes[picks].sum(axis=1)
    tail = (1 - level) / 2
    low, high = np.quantile(means, [tail, 1 - tail])
    return (float(low), float(high))


def paired_difference_ci(
    hits_a: np.ndarray, hits_b: np.ndarray, groups: Sequence[str], level: float = 0.95
) -> tuple[float, float]:
    """Interval for mean(a) - mean(b) on the same cases, resampling whole groups together.

    Pairing removes the case-to-case difficulty that both methods share, so this answers
    'is A better than B' far more sharply than comparing two separate intervals.
    """
    gap = np.asarray(hits_a, dtype=float) - np.asarray(hits_b, dtype=float)
    return cluster_bootstrap(gap, groups, level)


def bootstrap_ci(
    ranks: Sequence[int | None], k: int, level: float = 0.95, groups: Sequence[str] | None = None
) -> tuple[float, float]:
    """Percentile bootstrap interval for AC@k. With ``groups`` whole groups are resampled."""
    if not ranks:
        return (float("nan"), float("nan"))
    hits = np.array([1.0 if r is not None and r <= k else 0.0 for r in ranks])
    if groups is not None:
        return cluster_bootstrap(hits, groups, level)
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    means = rng.choice(hits, size=(BOOTSTRAP_RESAMPLES, len(hits)), replace=True).mean(axis=1)
    tail = (1 - level) / 2
    low, high = np.quantile(means, [tail, 1 - tail])
    return (float(low), float(high))
