import pandas as pd

from chronobench.cases import parse_case_id
from chronobench.servicegraph import (
    MIN_MENTIONS,
    TRUE_EDGES,
    learn_graph,
    pooled_scores,
    score_edges,
)
from chronobench.templates import TemplatedCase

TEMPLATES = {0: "heartbeat ok", 1: "call to beta failed", 2: "queue ok"}


def _case() -> TemplatedCase:
    rows = []
    for t in range(0, 200):
        burst = 6 if (t // 10) % 2 else 1  # alpha and beta share a rhythm; gamma is flat
        rows += [(t, "alpha", 0)] * burst + [(t, "beta", 0)] * burst + [(t, "gamma", 2)] * 3
        if t % 20 == 0:
            rows += [(t, "alpha", 1)] * MIN_MENTIONS  # alpha names beta often enough to be an edge
        if t == 40:
            rows += [(t, "gamma", 1)]  # a single stray mention is not an edge
    frame = pd.DataFrame(rows, columns=["timestamp", "source", "template_id"])
    frame["severity"] = "info"
    frame["template_id"] = frame["template_id"].astype("int32")
    return TemplatedCase(parse_case_id("re2ob_alpha_cpu_1"), 100, frame, TEMPLATES)


def test_mention_edge_is_directed_and_needs_enough_mentions():
    graph = learn_graph(_case())
    assert {(e["from"], e["to"]) for e in graph["mentions"]} == {("alpha", "beta")}
    assert graph["mentions"][0]["count"] >= MIN_MENTIONS


def test_correlated_services_are_linked_and_the_flat_one_is_not():
    pairs = {(e["a"], e["b"]) for e in learn_graph(_case())["correlations"]}
    assert ("alpha", "beta") in pairs
    assert not any("gamma" in p for p in pairs)


def test_score_edges_counts_hits_against_the_known_graph():
    present = {"frontend", "adservice", "cartservice"}
    good = {frozenset(("frontend", "adservice")), frozenset(("frontend", "cartservice"))}
    wrong = {frozenset(("adservice", "cartservice"))}
    assert score_edges(good, "ob", present)["precision"] == 1.0
    assert score_edges(good, "ob", present)["recall"] == 1.0
    assert score_edges(wrong, "ob", present)["precision"] == 0.0


def test_known_graphs_have_no_self_loops_and_pooling_runs():
    for edges in TRUE_EDGES.values():
        assert all(a != b for a, b in edges)
    graph = learn_graph(_case())
    scores = pooled_scores([("ob", graph)])
    assert set(scores["ob"]) == {"mention", "correlation", "union"}
