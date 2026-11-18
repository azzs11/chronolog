"""Integration test: Python -> Node replay runner -> ChronoLog engine -> ranking."""

import json

import pandas as pd
import pytest

from chronobench.adapt import CaseLogs, infer_severity
from chronobench.cases import parse_case_id
from chronobench.runner import RUNNER_ENTRY, encode_case, run_chronolog_h

pytestmark = pytest.mark.skipif(
    not RUNNER_ENTRY.exists(), reason="run `npm run build` at the repo root first"
)

INJECT = 100


def make_case(rows: list[tuple[int, str, str]]) -> CaseLogs:
    logs = pd.DataFrame(rows, columns=["timestamp", "source", "message"])
    logs["severity"] = infer_severity(logs["message"])
    return CaseLogs(parse_case_id("re2ob_adservice_cpu_1"), INJECT, logs)


def test_encode_case_writes_header_then_one_line_per_log():
    case = make_case([(90, "a", "hello"), (101, "b", "ERROR boom")])
    header, *logs = encode_case(case).decode().strip().split("\n")
    assert json.loads(header) == {"inject_time": INJECT}
    assert [json.loads(line)["severity"] for line in logs] == ["info", "error"]


def test_chain_is_credited_to_the_service_that_started_it():
    case = make_case(
        [
            (110, "database", "WARN database connection slow"),
            (116, "database", "ERROR database connection failed"),
            (122, "api", "ERROR api failed to reach database"),
        ]
    )
    result = run_chronolog_h(case)
    assert result.ranking == ["database"]
    assert result.scores["database"] > 0
    assert result.stats["logs"] == 3
    assert result.stats["linked_in_window"] == 2


def test_logs_before_the_injection_time_do_not_score():
    case = make_case(
        [
            (10, "cache", "WARN cache miss ratio high"),
            (16, "cache", "ERROR cache backend failed"),
            (22, "api", "ERROR api failed to reach cache"),
        ]
    )
    result = run_chronolog_h(case)
    assert result.ranking == []
    assert result.stats["linked"] == 2  # the engine still linked them; they just are not scored
