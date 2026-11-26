import numpy as np
import pandas as pd

from chronobench import anomaly_v2 as v2
from chronobench.anomaly_eval import score
from chronobench.loghub import Dataset


def test_mulberry32_matches_the_engine_rng():
    # Values printed by packages/engine/src/sim/rng.ts: new Rng(42).next() x 3
    rng = v2.Mulberry32(42)
    assert [rng.next() for _ in range(3)] == [
        0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
    ]  # fmt: skip


def test_average_path_known_values():
    assert v2.average_path(1) == 0.0
    assert v2.average_path(2) == 1.0
    assert abs(v2.average_path(256) - 10.244770920119917) < 1e-12


def test_forest_isolates_an_outlier_and_is_seeded():
    rng = np.random.default_rng(0)
    x = np.vstack([rng.normal(0, 1, (300, 3)), [[12.0, 12.0, 12.0]]])
    trees, sample = v2.fit_forest(x, seed=1)
    scores = v2.forest_scores(trees, sample, x)
    assert scores[-1] == scores.max() and scores[-1] > v2.IF_THRESHOLD
    assert np.median(scores) < v2.IF_THRESHOLD
    again = v2.forest_scores(*v2.fit_forest(x, seed=1), x)
    assert np.array_equal(scores, again)


def test_rare_lines_uses_fit_period_only():
    ids = np.array([1, 1, 1, 2, 3, 3])
    t = np.array([0, 1, 2, 3, 10, 11])
    # fit period t < 5: shares 1 -> 0.75, 2 -> 0.25; 3 never seen there, so it is rare
    assert v2.rare_lines(ids, t, 5, 0.5).tolist() == [False] * 3 + [True] * 3


def _toy() -> Dataset:
    lines = pd.DataFrame(
        {"t": [0, 1, 2, 3, 4, 5], "source": "s", "severity": "info", "is_alarm": [False] * 6}
    )
    pairs = pd.DataFrame({"line": range(6), "unit": ["a", "a", "b", "b", "c", "c"]})
    truth = pd.Series([False, True, True], index=["a", "b", "c"])
    return Dataset("HDFS", lines, pairs, truth)


def test_score_units_matches_the_v1_scorer_on_all_units():
    data = _toy()
    flags = np.array([False, False, False, True, True, False])
    predicted, first = v2.line_flags_to_units(data, flags)
    ours = v2.score_units(data, data.unit_is_anomalous.index, predicted, first, windowed=False)
    assert ours == score(data, flags, windowed=False)


def test_time_split_puts_units_by_their_first_line():
    split = v2.time_split(_toy())
    assert split.cutoff_t == 3  # the middle line (index 3)
    assert list(split.fit_units) == ["a", "b"] and list(split.test_units) == ["c"]
