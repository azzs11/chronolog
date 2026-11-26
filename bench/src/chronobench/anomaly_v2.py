"""Anomaly v2: a template-based detector. Two unsupervised signals, both fitted without labels.

1. **Rare-template surprise** (per line): a line is rare if its Drain template made up less than
   ``RARE_SHARE`` of the lines in the fit period (templates never seen there count as rare). It can
   fire on the very line that is unusual, so it has a meaningful detection delay.
2. **Isolation Forest** (per unit): the template-count vector of an HDFS block or a BGL window is
   scored by an Isolation Forest (Liu, Ting and Zhou, ICDM 2008) fitted on the fit period's units.
   A unit is decided only once it is complete, so its flag time is the unit's last line.

The forest is written here in numpy (about 60 lines) instead of adding scikit-learn plus scipy
(over 50 MB) to the bench, and so a TypeScript port can reproduce it exactly: its random numbers
come from mulberry32, the generator the engine's simulator already uses.

Split: by time. The fit period is every line before the middle line's timestamp; the test units
are the units whose first line is at or after it. No label is read before scoring.
"""

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .loghub import Dataset

# Every constant below was fixed before the first run on Loghub and is not tuned on it.
RARE_SHARE = 1e-4  # "rare" = under 1 line in 10,000 of the fit period (a round number)
IF_TREES = 100  # Liu et al. 2008 defaults (also scikit-learn's): 100 trees ...
IF_SAMPLE = 256  # ... grown on 256-unit subsamples ...
IF_THRESHOLD = 0.5  # ... and an anomaly score above 0.5 (scikit-learn's contamination="auto")
FIT_SHARE = 0.5  # the first half of the stream (by line count) is the fit period
EULER_GAMMA = 0.5772156649015329


class Mulberry32:
    """Same generator as ``packages/engine/src/sim/rng.ts``, bit for bit."""

    def __init__(self, seed: int) -> None:
        self.state = seed & 0xFFFFFFFF

    def next(self) -> float:
        self.state = (self.state + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.state
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    def int(self, low: int, high: int) -> int:
        return low + math.floor(self.next() * (high - low + 1))


def _imul(a: int, b: int) -> int:
    return (a * b) & 0xFFFFFFFF


def average_path(n: float) -> float:
    """c(n): average path length of an unsuccessful search in a binary search tree of n."""
    if n <= 1:
        return 0.0
    if n == 2:
        return 1.0
    return 2 * (math.log(n - 1) + EULER_GAMMA) - 2 * (n - 1) / n


@dataclass
class Tree:
    """Flat arrays; feature < 0 marks a leaf, whose ``size`` is how many points reached it."""

    feature: list[int]
    threshold: list[float]
    left: list[int]
    right: list[int]
    size: list[int]


def _sample(n: int, k: int, rng: Mulberry32) -> list[int]:
    """k distinct indices out of n by a partial Fisher-Yates shuffle."""
    order = list(range(n))
    for i in range(k):
        j = rng.int(i, n - 1)
        order[i], order[j] = order[j], order[i]
    return order[:k]


def _grow(x: np.ndarray, rng: Mulberry32, height_limit: int) -> Tree:
    tree = Tree([], [], [], [], [])

    def node(rows: np.ndarray, depth: int) -> int:
        at = len(tree.feature)
        for column in (tree.feature, tree.threshold, tree.left, tree.right, tree.size):
            column.append(-1)
        tree.size[at] = len(rows)
        tree.threshold[at] = 0.0
        if depth >= height_limit or len(rows) <= 1:
            return at
        part = x[rows]
        low, high = part.min(axis=0), part.max(axis=0)
        splittable = np.flatnonzero(high > low)
        if len(splittable) == 0:
            return at
        feature = int(splittable[rng.int(0, len(splittable) - 1)])
        threshold = float(low[feature] + rng.next() * (high[feature] - low[feature]))
        goes_left = part[:, feature] < threshold
        tree.feature[at], tree.threshold[at] = feature, threshold
        tree.left[at] = node(rows[goes_left], depth + 1)
        tree.right[at] = node(rows[~goes_left], depth + 1)
        return at

    node(np.arange(len(x)), 0)
    return tree


def fit_forest(x: np.ndarray, seed: int) -> tuple[list[Tree], int]:
    """Grow IF_TREES trees on subsamples of the rows of x. Returns the trees and the sample size."""
    rng = Mulberry32(seed)
    sample = min(IF_SAMPLE, len(x))
    height_limit = math.ceil(math.log2(max(sample, 2)))
    trees = [_grow(x[_sample(len(x), sample, rng)], rng, height_limit) for _ in range(IF_TREES)]
    return trees, sample


def _path_lengths(tree: Tree, x: np.ndarray) -> np.ndarray:
    feature = np.array(tree.feature)
    threshold = np.array(tree.threshold)
    left, right, size = np.array(tree.left), np.array(tree.right), np.array(tree.size)
    at = np.zeros(len(x), dtype=np.int64)
    depth = np.zeros(len(x))
    rows = np.arange(len(x))
    while True:
        inner = feature[at] >= 0
        if not inner.any():
            break
        r, a = rows[inner], at[inner]
        go_left = x[r, feature[a]] < threshold[a]
        at[inner] = np.where(go_left, left[a], right[a])
        depth[inner] += 1
    leaf_c = np.array([average_path(s) for s in size])
    return depth + leaf_c[at]


def forest_scores(trees: list[Tree], sample: int, x: np.ndarray) -> np.ndarray:
    """Anomaly score in (0, 1]: 2 ** (-mean path length / c(sample)). Near 1 means isolated fast."""
    mean_path = np.mean([_path_lengths(t, x) for t in trees], axis=0)
    return np.power(2.0, -mean_path / average_path(sample))


@dataclass
class Split:
    cutoff_t: int  # lines with t < cutoff_t form the fit period
    fit_units: pd.Index
    test_units: pd.Index


def time_split(data: Dataset) -> Split:
    t = data.lines["t"].to_numpy()
    cutoff = int(t[int(len(t) * FIT_SHARE)])
    first = (
        pd.Series(t[data.pairs["line"]], index=data.pairs.index).groupby(data.pairs["unit"]).min()
    )
    first = first.reindex(data.unit_is_anomalous.index).dropna()
    return Split(cutoff, first.index[first < cutoff], first.index[first >= cutoff])


def rare_lines(template_ids: np.ndarray, t: np.ndarray, cutoff_t: int, share: float) -> np.ndarray:
    """Boolean per line: its template's share of fit-period lines is below ``share``."""
    fit = template_ids[t < cutoff_t]
    counts = pd.Series(fit).value_counts()
    common = counts.index[counts / len(fit) >= share]
    return ~np.isin(template_ids, common.to_numpy())


def count_matrix(data: Dataset, template_ids: np.ndarray, units: pd.Index, vocab: np.ndarray):
    """log1p template counts per unit over the fit period's vocabulary (rows follow ``units``)."""
    pairs = data.pairs[data.pairs["unit"].isin(units)]
    tpl = pd.Series(template_ids[pairs["line"].to_numpy()], index=pairs.index)
    keep = tpl.isin(vocab)
    table = pd.crosstab(pairs["unit"][keep], tpl[keep])
    table = table.reindex(index=units, columns=vocab, fill_value=0)
    return np.log1p(table.to_numpy(dtype=float))


def unit_last_time(data: Dataset) -> pd.Series:
    t = data.lines["t"].to_numpy()
    return (
        pd.Series(t[data.pairs["line"]], index=data.pairs.index).groupby(data.pairs["unit"]).max()
    )


def line_flags_to_units(data: Dataset, flags: np.ndarray) -> tuple[pd.Series, pd.Series]:
    """(any flagged line per unit, time of its first flagged line) for every labelled unit."""
    t = data.lines["t"].to_numpy()
    lines = data.pairs["line"].to_numpy()
    paired = pd.DataFrame({"unit": data.pairs["unit"], "t": t[lines], "flag": flags[lines]})
    index = data.unit_is_anomalous.index
    predicted = paired.groupby("unit")["flag"].any().reindex(index, fill_value=False)
    first = paired[paired["flag"]].groupby("unit")["t"].min().reindex(index)
    return predicted.astype(bool), first


def score_units(
    data: Dataset, units: pd.Index, predicted: pd.Series, first_flag_t: pd.Series, windowed: bool
) -> dict[str, float | int | None]:
    """Precision, recall, F1 and episode delay over ``units`` only (same rules as anomaly_eval)."""
    truth = data.unit_is_anomalous.reindex(units).astype(bool)
    pred = predicted.reindex(units).fillna(False).astype(bool)
    tp, fp, fn = int((pred & truth).sum()), int((pred & ~truth).sum()), int((~pred & truth).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    reference = _reference_times(data, windowed).reindex(units)
    anomalous = pd.Series(units[truth.to_numpy()])
    episode = _episodes(anomalous, windowed)
    flag_t = first_flag_t.where(pred).reindex(anomalous.to_numpy())
    frame = pd.DataFrame(
        {"episode": episode, "ref": reference.reindex(anomalous.to_numpy()).to_numpy(),
         "flag": flag_t.to_numpy()}
    )  # fmt: skip
    grouped = frame.groupby("episode").agg(ref=("ref", "min"), flag=("flag", "min"))
    detected = grouped.dropna()
    delay = detected["flag"] - detected["ref"]
    return {
        "precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "fn": fn,
        "episodes": len(grouped), "episodes_detected": len(detected),
        "median_delay_s": float(delay.median()) if len(delay) else None,
    }  # fmt: skip


def _episodes(anomalous: pd.Series, windowed: bool) -> np.ndarray:
    """BGL: consecutive anomalous windows form one episode; HDFS blocks (string ids) are alone."""
    if not windowed:
        return np.arange(len(anomalous))
    return (anomalous.diff() != 1).cumsum().to_numpy()


def _reference_times(data: Dataset, windowed: bool) -> pd.Series:
    """BGL: the first alarm line of each window; HDFS: the block's first line."""
    t = data.lines["t"].to_numpy()
    lines = data.pairs["line"].to_numpy()
    frame = pd.DataFrame({"unit": data.pairs["unit"], "t": t[lines]})
    if windowed:
        frame = frame[data.lines["is_alarm"].to_numpy()[lines]]
    return frame.groupby("unit")["t"].min()
