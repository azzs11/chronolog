import numpy as np
import pandas as pd

from chronobench.startdetect import (
    BUCKET_S,
    CROP_MAX_S,
    CROP_MIN_S,
    crop_window,
    detect_start,
    first_error_start,
)


def _frame(change_at: int = 300, length: int = 600, seed: int = 0) -> pd.DataFrame:
    """Steady traffic from two services; after `change_at`, one starts logging a new message."""
    rng = np.random.default_rng(seed)
    rows = []
    for t in range(length):
        rows += [(t, "api", 0)] * 5 + [(t, "db", 1)] * 5
        if t >= change_at:
            rows += [(t, "db", 2)] * int(rng.integers(8, 12))  # a new template appears
    frame = pd.DataFrame(rows, columns=["timestamp", "source", "template_id"])
    frame["severity"] = "info"
    return frame


def test_finds_the_change_within_a_bucket_or_two():
    start = detect_start(_frame(change_at=300))
    assert start is not None and abs(start - 300) <= 2 * BUCKET_S


def test_finds_a_drop_as_well_as_a_rise():
    rows = [(t, "api", 0) for t in range(600) for _ in range(10)]
    rows += [(t, "db", 1) for t in range(300) for _ in range(10)]  # db goes silent at 300
    frame = pd.DataFrame(rows, columns=["timestamp", "source", "template_id"])
    start = detect_start(frame)
    assert start is not None and abs(start - 300) <= 2 * BUCKET_S


def test_is_not_fooled_by_where_the_window_ends():
    """The same change is found whether it sits at 40% or 70% of the window."""
    for change in (240, 420):
        start = detect_start(_frame(change_at=change))
        assert start is not None and abs(start - change) <= 2 * BUCKET_S


def test_returns_none_when_the_window_is_too_short():
    assert detect_start(_frame(change_at=100, length=200)) is None


def test_crop_is_deterministic_and_always_contains_the_start():
    frame = _frame(length=1500)
    inject = 750
    a = crop_window(frame, inject, "re2ob_x_cpu_1")
    assert a.equals(crop_window(frame, inject, "re2ob_x_cpu_1"))
    assert not a.equals(crop_window(frame, inject, "re2ob_y_cpu_1"))
    first, last = a["timestamp"].min(), a["timestamp"].max()
    assert first >= inject - CROP_MAX_S and last <= inject + CROP_MAX_S
    assert first <= inject - CROP_MIN_S and last >= inject + CROP_MIN_S


def test_first_error_rule_needs_enough_earlier_lines():
    frame = pd.DataFrame(
        {"timestamp": range(40), "severity": ["error"] + ["info"] * 29 + ["error"] + ["info"] * 9}
    )
    assert first_error_start(frame) == 29 + 1 and first_error_start(frame.iloc[:25]) is None
