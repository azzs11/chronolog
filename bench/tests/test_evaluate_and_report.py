import json

import pandas as pd

from chronobench.adapt import CaseLogs, infer_severity
from chronobench.cases import parse_case_id
from chronobench.evaluate import SEEDS, build_results, evaluate_case
from chronobench.report import render_report
from chronobench.runner import ReplayResult

INJECT = 100


def make_case(case_id: str, rows: list[tuple[int, str, str]]) -> CaseLogs:
    logs = pd.DataFrame(rows, columns=["timestamp", "source", "message"])
    logs["severity"] = infer_severity(logs["message"])
    return CaseLogs(parse_case_id(case_id), INJECT, logs)


ROWS = [
    (101, "api", "ERROR api failed"),
    (102, "db", "ERROR db down"),
    (103, "db", "ERROR db down again"),
    (104, "cache", "all fine"),
]


def fake_replay(ranking: list[str]):
    def replay(_case: CaseLogs) -> ReplayResult:
        return ReplayResult(
            ranking=ranking,
            scores={s: float(len(ranking) - i) for i, s in enumerate(ranking)},
            stats={"logs": 4, "linked": 3, "linked_in_window": 3, "seconds": 0.0},
        )

    return replay


def test_evaluate_case_reports_each_methods_rank_of_the_truth():
    logs = make_case("re2ob_db_cpu_1", ROWS)
    result = evaluate_case(logs, fake_replay(["db", "api"]))
    assert result["root_service"] == "db"
    assert result["reachable"] is True
    assert result["methods"]["chronolog_h"]["rank"] == 1
    assert result["methods"]["first_error"]["rank"] == 2  # api errors first, then db
    assert result["methods"]["most_frequent_error"]["rank"] == 1  # db has two errors
    assert result["methods"]["most_logs"]["rank"] == 1  # db has two lines, ties alphabetical
    assert set(result["random_ranks"]) == {str(s) for s in SEEDS}
    assert (result["log_lines"], result["linked_lines"]) == (4, 3)


def test_unreachable_case_is_a_miss_for_every_method():
    logs = make_case("re2ob_ghost_cpu_1", ROWS)  # the service "ghost" never logs
    result = evaluate_case(logs, fake_replay(["db"]))
    assert result["reachable"] is False
    assert all(m["rank"] is None for m in result["methods"].values())
    assert all(r is None for r in result["random_ranks"].values())


def test_chronolog_h_unscored_services_are_appended_alphabetically():
    logs = make_case("re2ob_cache_cpu_1", ROWS)
    result = evaluate_case(logs, fake_replay(["db"]))  # engine only scored db
    assert result["methods"]["chronolog_h"]["top"] == ["db", "api", "cache"]
    assert result["methods"]["chronolog_h"]["rank"] == 3


def test_evaluation_is_deterministic():
    logs = make_case("re2ob_db_cpu_1", ROWS)
    first = evaluate_case(logs, fake_replay(["db", "api"]))
    assert json.dumps(first, sort_keys=True) == json.dumps(
        evaluate_case(logs, fake_replay(["db", "api"])), sort_keys=True
    )


def test_report_renders_every_section_from_results():
    cases = [
        evaluate_case(make_case("re2ob_db_cpu_1", ROWS), fake_replay(["db", "api"])),
        evaluate_case(make_case("re2ss_api_delay_2", ROWS), fake_replay(["db"])),
        evaluate_case(make_case("re3tt_ghost_f1_1", ROWS), fake_replay(["db"])),
    ]
    report = render_report(build_results("small", cases))
    for heading in (
        "# ChronoBench results",
        "## All 3 cases",
        "## Held-out test cases only",
        "## AC@3 by system",
        "## AC@3 by fault type",
        "## Every case",
    ):
        assert heading in report
    assert "**ChronoLog-H**" in report
    assert "Reachable cases:** 2 of 3" in report
    assert "⚠" in report  # the unreachable case is flagged
    assert "`re2ob_db_cpu_1`" in report
    assert report == render_report(build_results("small", cases))  # same input, same text


def test_report_numbers_match_the_results():
    cases = [
        evaluate_case(make_case("re2ob_db_cpu_1", ROWS), fake_replay(["db", "api"])),
        evaluate_case(make_case("re2ob_api_cpu_2", ROWS), fake_replay(["db", "api"])),
    ]
    report = render_report(build_results("small", cases))
    # ChronoLog-H ranks the true service 1st on the db case and 2nd on the api case:
    # AC@1 is 50% and AC@3 is 100%.
    line = next(row for row in report.splitlines() if row.startswith("| **ChronoLog-H**"))
    cells = [c.strip() for c in line.split("|")[2:5]]
    assert cells[0].startswith("50.0%")
    assert cells[1].startswith("100.0%")
