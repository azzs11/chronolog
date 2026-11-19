from chronobench.facts import FACTS_PATH, build_facts, render_facts_ts


def test_committed_ui_facts_match_the_benchmark_results():
    """If a result changes, run `uv run bench export-facts` so the UI quotes the new number."""
    assert FACTS_PATH.read_text() == render_facts_ts(build_facts())


def test_facts_are_percentages_with_the_dataset_named():
    facts = build_facts()
    assert "RCAEval" in facts["dataset"] and "359" in facts["dataset"]
    for key in ("top3AllIncidents", "top3ResourceFaults", "top3HandRules", "top3EstimatedStart"):
        assert facts[key].endswith("%")
    assert float(facts["top3TrueStart"][:-1]) > float(facts["top3EstimatedStart"][:-1])
