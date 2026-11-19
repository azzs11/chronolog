"""Estimate when an incident started, from the logs alone.

The benchmark gives every method the true injection time, but a live system does not know it. The
estimate scans every candidate start time in the window and keeps the one where log behaviour
changes most: the sum over every (service, template) series of a Poisson likelihood-ratio
statistic comparing the counts before and after the split, in either direction. A volume shift, a
new message and a vanished message all raise it.

It locates a change; it does not decide whether an incident happened. On calm windows it scores
about as high as on incident windows, so ChronoLog asks the user (or an alert) to say that
something went wrong, and estimates only the start. Measured by ``bench autostart``.
"""

import hashlib

import numpy as np
import pandas as pd

BUCKET_S = 10  # width of a time bucket
MIN_SEGMENT_BUCKETS = 12  # each side of the split must span at least 120 s
# Evaluation crops the window to a random 300-720 s before and after the start (720 s is the full
# RCAEval window), so that guessing the middle of the window gives no clue.
CROP_MIN_S = 300
CROP_MAX_S = 720


def _xlogx(x: np.ndarray, t: np.ndarray | float) -> np.ndarray:
    """x * ln(x / t), with 0 ln 0 = 0."""
    safe = np.maximum(x, 1e-12)
    return np.where(x > 0, x * np.log(safe / t), 0.0)


def detect_start(frame: pd.DataFrame) -> int | None:
    """Estimated start (Unix seconds) of the biggest change in the frame, or None if too short.

    ``frame`` needs columns timestamp (int seconds), source and template_id.
    """
    t0 = int(frame["timestamp"].min())
    n = int((int(frame["timestamp"].max()) - t0) // BUCKET_S) + 1
    if n < 2 * MIN_SEGMENT_BUCKETS:
        return None
    bucket = ((frame["timestamp"] - t0) // BUCKET_S).to_numpy()
    keys = (frame["source"] + "|" + frame["template_id"].astype(str)).to_numpy()
    _, series = np.unique(keys, return_inverse=True)
    counts = np.zeros((int(series.max()) + 1, n))
    np.add.at(counts, (series, bucket), 1)
    cum = np.cumsum(counts, axis=1)
    total = cum[:, -1:]
    split = np.arange(MIN_SEGMENT_BUCKETS, n - MIN_SEGMENT_BUCKETS + 1)
    before = cum[:, split - 1]
    after = total - before
    score = (
        _xlogx(before, split[None, :]) + _xlogx(after, (n - split)[None, :]) - _xlogx(total, n)
    ).sum(axis=0)
    return t0 + int(split[int(np.argmax(score))]) * BUCKET_S


def crop_window(frame: pd.DataFrame, inject: int, case_id: str) -> pd.DataFrame:
    """A seeded random crop of the window around the true start, for fair evaluation."""
    rng = np.random.default_rng(int(hashlib.sha256(case_id.encode()).hexdigest()[:8], 16))
    before, after = (int(rng.integers(CROP_MIN_S, CROP_MAX_S + 1)) for _ in range(2))
    keep = (frame["timestamp"] >= inject - before) & (frame["timestamp"] <= inject + after)
    return frame[keep].reset_index(drop=True)


def first_error_start(frame: pd.DataFrame, min_baseline_lines: int = 20) -> int | None:
    """The heuristic the API used before: the first error-level line after enough other lines.

    Kept only as a measured baseline for the estimator.
    """
    severity = frame["severity"].to_numpy()
    stamps = frame["timestamp"].to_numpy()
    for i in range(min_baseline_lines, len(frame)):
        if severity[i] in ("error", "critical"):
            return int(stamps[i])
    return None
