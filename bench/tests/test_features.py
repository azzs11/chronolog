import pandas as pd

from chronobench.cases import parse_case_id
from chronobench.features import ALL_FEATURES, FEATURES, MISSING_TIME_FACTOR, case_features
from chronobench.templates import TemplatedCase

INJECT = 100
TEMPLATES = {0: "heartbeat ok", 1: "database connection failed", 2: "call to alpha failed"}


def _case() -> TemplatedCase:
    rows = []  # (timestamp, source, severity, template_id)
    for t in range(0, 200, 5):  # every service heartbeats before and after
        rows += [(t, s, "info", 0) for s in ("alpha", "beta", "gamma")]
    rows += [(105, "alpha", "error", 1), (106, "alpha", "error", 1)]  # alpha breaks first
    rows += [(120, "beta", "error", 2), (121, "beta", "error", 2), (122, "beta", "warning", 2)]
    frame = pd.DataFrame(rows, columns=["timestamp", "source", "severity", "template_id"])
    frame = frame.sort_values("timestamp", kind="stable").reset_index(drop=True)
    frame["template_id"] = frame["template_id"].astype("int32")
    return TemplatedCase(parse_case_id("re2ob_alpha_cpu_1"), INJECT, frame, TEMPLATES)


def test_first_error_times_and_missing_sentinel():
    f = case_features(_case())
    window = 96  # logs run to t=195, so the window is t=100..195 inclusive: 96 s
    assert f.loc["alpha", "t_first_error"] == 5
    assert f.loc["beta", "t_first_error"] == 20
    assert f.loc["gamma", "t_first_error"] == MISSING_TIME_FACTOR * window
    assert f.loc["alpha", "rank_t_first_error"] < f.loc["beta", "rank_t_first_error"]
    assert f.loc["beta", "rank_t_first_error"] < f.loc["gamma", "rank_t_first_error"]


def test_novel_templates_count_only_what_the_baseline_never_saw():
    f = case_features(_case())
    assert f.loc["alpha", "novel_templates"] == 1  # "database connection failed" is new
    assert f.loc["gamma", "novel_templates"] == 0
    assert f.loc["beta", "t_first_novel"] == 20


def test_mentions_and_graph_point_at_the_named_service():
    f = case_features(_case())
    assert f.loc["alpha", "mentions"] == 3  # beta logs "call to alpha failed" three times
    assert f.loc["alpha", "mentions_warn"] == 3
    assert f.loc["alpha", "in_degree"] == 1 and f.loc["beta", "out_degree"] == 1
    assert f["mentions"].idxmax() == "alpha"
    assert f["pagerank"].idxmax() == "alpha"
    assert abs(f["pagerank"].sum() - 1.0) < 1e-9


def test_all_features_present_finite_and_ranks_in_unit_range():
    f = case_features(_case())
    assert list(f.columns) == ALL_FEATURES
    assert set(FEATURES) <= set(ALL_FEATURES)
    assert f.notna().all().all()
    ranks = f[[c for c in FEATURES if c.startswith("rank_")]]
    assert ((ranks > 0) & (ranks <= 1)).all().all()


def test_shift_features_flag_a_service_whose_logging_changes():
    f = case_features(_case())
    # alpha logs new templates after injection and beta too; gamma only keeps its heartbeat
    assert f.loc["gamma", "template_shift"] < 1e-9
    assert f.loc["alpha", "template_shift"] > f.loc["gamma", "template_shift"]
    assert (f["template_shift"].between(0, 1)).all()
    assert (f["vanished_mass"].between(0, 1)).all()
    assert f.loc["gamma", "silence_increase"] == 0


def test_a_service_that_goes_quiet_has_silence_and_vanished_mass():
    # 10 lines per 10 s bucket, so a drop to zero is a real change
    rows = [(t, s, "info", 0) for t in range(0, 200) for s in ("alpha", "beta")]
    rows = [r for r in rows if not (r[1] == "alpha" and r[0] >= INJECT)]  # alpha falls silent
    frame = pd.DataFrame(rows, columns=["timestamp", "source", "severity", "template_id"])
    frame["template_id"] = frame["template_id"].astype("int32")
    case = TemplatedCase(parse_case_id("re2ob_alpha_cpu_1"), INJECT, frame, {0: "heartbeat ok"})
    f = case_features(case)
    assert f.loc["alpha", "silence_increase"] > f.loc["beta", "silence_increase"]
    assert f.loc["alpha", "vanished_mass"] == 1.0 and f.loc["beta", "vanished_mass"] == 0.0
    assert f.loc["alpha", "t_first_deviation"] < f.loc["beta", "t_first_deviation"]


def test_precedence_features_reward_deviating_before_correlated_neighbours():
    rows = []
    for t in range(0, 100):  # alpha and beta share a bursty rhythm; gamma is flat
        burst = 6 if (t // 10) % 2 else 1
        rows += [(t, "alpha", "info", 0)] * burst + [(t, "beta", "info", 0)] * burst
        rows += [(t, "gamma", "info", 0)] * 3
    for t in range(100, 200):  # after injection: alpha floods at once, beta follows 30 s later
        rows += [(t, "alpha", "info", 0)] * (40 if t >= 110 else 3)
        rows += [(t, "beta", "info", 0)] * (40 if t >= 140 else 3)
        rows += [(t, "gamma", "info", 0)] * 3
    frame = pd.DataFrame(rows, columns=["timestamp", "source", "severity", "template_id"])
    frame["template_id"] = frame["template_id"].astype("int32")
    case = TemplatedCase(parse_case_id("re2ob_alpha_cpu_1"), INJECT, frame, {0: "heartbeat ok"})
    f = case_features(case)
    assert f.loc["alpha", "t_first_any"] < f.loc["beta", "t_first_any"]
    assert f.loc["alpha", "lead_share"] > f.loc["beta", "lead_share"]
    assert f.loc["alpha", "neighbour_delay"] > f.loc["beta", "neighbour_delay"]
    assert f["neighbour_corr"].between(-1, 1).all()
