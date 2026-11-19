"""Learn which services talk to each other from their logs, and score it against the call graph.

Two kinds of evidence, both from logs only:
  mention      service A's log lines name service B (a template contains B's name). Directed A -> B:
               A calls or depends on B.
  correlation  A and B's log volume rises and falls together (Pearson correlation of line counts
               per 2 s bucket). Undirected: services that handle the same requests move together.
The same rule is in packages/engine/src/rootrank/serviceGraph.ts (parity-tested).
"""

import warnings
from collections import Counter
from itertools import combinations

import numpy as np

from .features import _mention_edges, _mention_table
from .templates import TemplatedCase

CORR_BUCKET_S = 2  # width of the volume buckets
MIN_MENTIONS = 3  # an edge needs this many naming lines, so one stray mention is not an edge
MIN_CORRELATION = 0.5  # the usual 'strong correlation' cut-off


def learn_graph(tc: TemplatedCase) -> dict:
    """Edges learned from one window of logs (mention edges and correlation edges)."""
    services = tc.services()
    edges = _mention_edges(tc.frame, _mention_table(tc, services))
    counts = Counter(zip(edges["source"], edges["target"], strict=True))
    mentions = [
        {"from": a, "to": b, "count": n}
        for (a, b), n in sorted(counts.items())
        if n >= MIN_MENTIONS
    ]
    correlations = _correlations(tc, services)
    return {"services": services, "mentions": mentions, "correlations": correlations}


def _correlations(tc: TemplatedCase, services: list[str]) -> list[dict]:
    if len(services) < 2:
        return []
    frame = tc.frame
    t0 = int(frame["timestamp"].min())
    buckets = int((int(frame["timestamp"].max()) - t0) // CORR_BUCKET_S) + 1
    index = {s: i for i, s in enumerate(services)}
    volume = np.zeros((len(services), buckets))
    bucket = ((frame["timestamp"] - t0) // CORR_BUCKET_S).to_numpy()
    rows = frame["source"].map(index).to_numpy()
    np.add.at(volume, (rows, bucket), 1)
    with np.errstate(all="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # silent services have no variance
        corr = np.nan_to_num(np.corrcoef(volume))
    return [
        {"a": services[i], "b": services[j], "corr": float(corr[i, j])}
        for i, j in combinations(range(len(services)), 2)
        if corr[i, j] >= MIN_CORRELATION
    ]


# The real call graphs, written from the public architecture docs of the two systems (Google's
# microservices-demo and Weaveworks' Sock Shop), as undirected pairs of the containers that write
# logs in RCAEval. They may omit edges, which would count correct finds as false positives.
# Train Ticket (47 services) is not scored: its call graph is not documented well enough to trust.
TRUE_EDGES = {
    "ob": {
        ("frontend", s)
        for s in ("adservice", "cartservice", "checkoutservice", "currencyservice",
                  "productcatalogservice", "recommendationservice", "shippingservice")
    }
    | {
        ("checkoutservice", s)
        for s in ("cartservice", "currencyservice", "emailservice", "paymentservice",
                  "productcatalogservice", "shippingservice")
    }
    | {("recommendationservice", "productcatalogservice"), ("cartservice", "redis")},
    "ss": {("front-end", s) for s in ("catalogue", "carts", "orders", "user", "session-db")}
    | {("orders", s) for s in ("carts", "payment", "shipping", "user", "orders-db")}
    | {("carts", "carts-db")},
}  # fmt: skip


def _pair(a: str, b: str) -> frozenset[str]:
    return frozenset((a, b))


def score_edges(predicted: set[frozenset[str]], system: str, present: set[str]) -> dict:
    """Precision and recall of undirected predicted pairs, over services that logged anything."""
    truth = {_pair(a, b) for a, b in TRUE_EDGES[system] if a in present and b in present}
    hit = len(predicted & truth)
    precision = hit / len(predicted) if predicted else 0.0
    recall = hit / len(truth) if truth else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"predicted": len(predicted), "true": len(truth), "hit": hit,
            "precision": precision, "recall": recall, "f1": f1}  # fmt: skip


def edge_sets(graph: dict) -> dict[str, set[frozenset[str]]]:
    mention = {_pair(e["from"], e["to"]) for e in graph["mentions"]}
    corr = {_pair(e["a"], e["b"]) for e in graph["correlations"]}
    return {"mention": mention, "correlation": corr, "union": mention | corr}


def pooled_scores(per_case: list[tuple[str, dict]]) -> dict:
    """Mean precision/recall/F1 over cases of each system, for each kind of edge."""
    out: dict = {}
    for system in TRUE_EDGES:
        rows: dict[str, list[dict]] = {"mention": [], "correlation": [], "union": []}
        for sys_name, g in per_case:
            if sys_name != system:
                continue
            sets = edge_sets(g)
            for kind, pairs in sets.items():
                rows[kind].append(score_edges(pairs, system, set(g["services"])))
        if not rows["union"]:
            continue
        out[system] = {
            kind: {k: float(np.mean([r[k] for r in rs])) for k in ("precision", "recall", "f1")}
            | {"cases": len(rs)}
            for kind, rs in rows.items()
        }
    return out
