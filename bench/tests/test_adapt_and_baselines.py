import pandas as pd
import pytest

from chronobench.adapt import CaseLogs, infer_severity
from chronobench.baselines import (
    first_error_ranking,
    most_frequent_error_ranking,
    random_ranking,
)
from chronobench.cases import parse_case_id


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("2024-01-23 15:14:51.239  INFO 1 --- [exec-2] auth: LOGIN USER", "info"),
        ("ERROR something broke", "error"),
        ("ts=2024 level=error msg=boom", "error"),
        ("FATAL: kernel panic", "critical"),
        ("WARN slow response", "warning"),
        ("DEBUG cache hit", "debug"),
        ("java.lang.NullPointerException: x", "error"),  # no explicit level, keyword fallback
        ("connection refused by upstream", "error"),
        ("request timed out, retrying", "warning"),
        ("conversion request successful", "info"),
        ("INFO handled the failed login attempt", "info"),  # an explicit level beats keywords
        ("", "info"),
    ],
)
def test_infer_severity(message, expected):
    assert infer_severity(pd.Series([message])).iloc[0] == expected


def test_infer_severity_treats_missing_messages_as_info():
    assert infer_severity(pd.Series([None, "ok"])).tolist() == ["info", "info"]


def make_case(rows: list[tuple[int, str, str]], inject_time: int = 100) -> CaseLogs:
    logs = pd.DataFrame(rows, columns=["timestamp", "source", "message"])
    logs["severity"] = infer_severity(logs["message"])
    return CaseLogs(parse_case_id("re2ob_adservice_cpu_1"), inject_time, logs)


ROWS = [
    (10, "early", "ERROR before the fault"),  # outside the window
    (100, "b", "all fine"),
    (101, "c", "ERROR one"),
    (102, "a", "ERROR two"),
    (103, "c", "ERROR three"),
    (104, "c", "ERROR four"),
    (105, "a", "ERROR five"),
]


def test_incident_window_starts_at_injection_time():
    case = make_case(ROWS)
    assert case.incident_window()["timestamp"].min() == 100
    assert case.services() == ["a", "b", "c", "early"]


def test_first_error_ranks_by_first_appearance_then_alphabetical():
    # c errors first (101), then a (102); b and early have no error inside the window.
    assert first_error_ranking(make_case(ROWS)) == ["c", "a", "b", "early"]


def test_most_frequent_error_ranks_by_count():
    # c has 3 errors, a has 2.
    assert most_frequent_error_ranking(make_case(ROWS)) == ["c", "a", "b", "early"]


def test_baselines_with_no_errors_fall_back_to_alphabetical():
    case = make_case([(100, "z", "fine"), (101, "m", "fine")])
    assert first_error_ranking(case) == ["m", "z"]
    assert most_frequent_error_ranking(case) == ["m", "z"]


def test_random_ranking_is_seeded_and_covers_every_service():
    case = make_case(ROWS)
    assert random_ranking(case, 1) == random_ranking(case, 1)
    assert sorted(random_ranking(case, 1)) == case.services()
    assert any(random_ranking(case, s) != random_ranking(case, 1) for s in range(2, 12))
