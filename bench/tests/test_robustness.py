import pandas as pd

from chronobench.robustness import perturb, summarise


def _frame(n: int = 4000) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "timestamp": range(n),
            "source": ["a", "b"] * (n // 2),
            "severity": "info",
            "template_id": 0,
        }
    )


def test_no_perturbation_changes_nothing():
    frame = _frame()
    assert perturb(frame, 0.0, 0, "k").equals(frame)


def test_drop_removes_about_the_requested_share_and_repeats_exactly():
    frame = _frame()
    out = perturb(frame, 0.4, 0, "case:1")
    assert abs(len(out) / len(frame) - 0.6) < 0.03
    assert out.equals(perturb(frame, 0.4, 0, "case:1"))
    assert not out.equals(perturb(frame, 0.4, 0, "case:2"))  # the seed changes which lines drop


def test_skew_shifts_each_service_by_a_constant_within_range_and_keeps_time_order():
    frame = _frame()
    out = perturb(frame, 0.0, 2, "case:1")
    assert out["timestamp"].is_monotonic_increasing
    for service in ("a", "b"):
        before = frame[frame["source"] == service]["timestamp"].to_numpy()
        after = out[out["source"] == service]["timestamp"].to_numpy()
        shift = after - before
        assert len(set(shift)) == 1 and -2 <= shift[0] <= 2


def test_summarise_reports_mean_and_spread_over_seeds():
    ranks = {"0": [1, 5, None], "1": [1, 2, 9]}
    mean, std = summarise(ranks, 3)
    assert abs(mean - (1 / 3 + 2 / 3) / 2) < 1e-9 and std > 0
