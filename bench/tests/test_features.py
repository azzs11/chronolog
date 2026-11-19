import pandas as pd

from chronobench.cases import parse_case_id
from chronobench.features import FEATURES, MISSING_TIME_FACTOR, case_features
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
    assert list(f.columns) == FEATURES
    assert f.notna().all().all()
    ranks = f[[c for c in FEATURES if c.startswith("rank_")]]
    assert ((ranks > 0) & (ranks <= 1)).all().all()
