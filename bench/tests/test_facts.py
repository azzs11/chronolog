from chronobench.facts import FACTS_PATH, build_facts, render_facts_ts
from chronobench.reportcard import REPORT_PATH, build_report_card, render_report_card_ts


def test_committed_ui_facts_match_the_benchmark_results():
    """If a result changes, run `uv run bench export-facts` so the UI quotes the new number."""
    assert FACTS_PATH.read_text() == render_facts_ts(build_facts())


def test_facts_are_percentages_with_the_dataset_named():
    facts = build_facts()
    assert "RCAEval" in facts["dataset"] and "359" in facts["dataset"]
    for key in ("top3AllIncidents", "top3ResourceFaults", "top3HandRules", "top3EstimatedStart"):
        assert facts[key].endswith("%")
    assert float(facts["top3TrueStart"][:-1]) > float(facts["top3EstimatedStart"][:-1])


def test_committed_report_card_matches_the_benchmark_results():
    """If a result changes, run `uv run bench export-facts` to refresh the Report card."""
    assert REPORT_PATH.read_text() == render_report_card_ts(build_report_card())


def test_report_card_agrees_with_the_published_headline_and_names_its_data():
    card = build_report_card()
    facts = build_facts()
    ours = next(r for r in card["headline"] if r["isOurs"])
    assert f"{100 * ours['value']:.1f}%" == facts["top3AllIncidents"]
    resource = next(r for r in card["byKind"] if r["name"].startswith("Resource"))
    assert f"{100 * resource['rootrank']:.1f}%" == facts["top3ResourceFaults"]
    assert "RCAEval" in card["dataset"] and "Loghub" in card["anomalyDataset"]
    for row in card["headline"]:
        if row["low"] is not None:
            assert row["low"] <= row["value"] <= row["high"]
