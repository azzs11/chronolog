"""RootRank features: one row per (case, candidate service), computed from logs only.

Time is measured from the injection time. Logs before it are the baseline ("what normal looked
like"); logs at or after it are the incident window, the same rule every method follows. Times
that never happen are set to ``MISSING_TIME_FACTOR`` x the window length, so "never" sorts last.
Rank features compare services within one case, which transfers across systems better than raw
values do.
"""

import re
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .templates import TemplatedCase

BUCKET_S = 10  # width of a rate bucket
SPIKE_SIGMAS = 3  # a bucket spikes above baseline mean + 3 standard deviations
MIN_SPIKE_COUNT = 5  # ...and has at least this many lines, so quiet services do not spike on 1 line
MISSING_TIME_FACTOR = 2
RATE_EPS = 0.01  # lines per second, keeps the rate ratio finite for silent services
PAGERANK_DAMPING = 0.85  # the standard PageRank value
PAGERANK_ITERATIONS = 50
ERROR_LEVELS = ("error", "critical")
WARN_LEVELS = ("warning", *ERROR_LEVELS)

RAW_TIME = ["t_first_error", "t_first_novel", "t_first_spike", "t_first_mention"]
RAW_COUNT = ["error_ratio", "rate_ratio", "novel_templates", "mentions", "mentions_warn"]
RAW_OTHER = ["novel_fraction", "in_degree", "out_degree", "pagerank"]
BASE_FEATURES = [
    *RAW_TIME, *RAW_COUNT, *RAW_OTHER,
    *(f"rank_{name}" for name in [*RAW_TIME, *RAW_COUNT, "pagerank"]),
]  # fmt: skip

# Features added in feature version f2, aimed at resource faults (cpu, memory, disk, delay, loss,
# socket), which change how a service logs without always producing new templates.
SHIFT_TIME = ["t_first_deviation"]
SHIFT_COUNT = ["template_shift", "vanished_mass", "silence_increase"]
SHIFT_FEATURES = [*SHIFT_TIME, *SHIFT_COUNT, *(f"rank_{n}" for n in [*SHIFT_TIME, *SHIFT_COUNT])]
ALL_FEATURES = [*BASE_FEATURES, *SHIFT_FEATURES]
# RootRank uses the base set. The shift features were tried on the train split only and did not
# improve resource-fault AC@3 (38.6% -> 38.0%, within seed noise), so they stay optional.
FEATURES = BASE_FEATURES
MIN_DEVIATION = 5  # a bucket deviates only if it differs from the baseline mean by this many lines


def _mention_table(tc: TemplatedCase, services: list[str]) -> dict[int, list[str]]:
    """Which services each template names. Whole-name match: 'carts' does not match 'carts-db'."""
    patterns = {s: re.compile(rf"(?<![\w-]){re.escape(s.lower())}(?![\w-])") for s in services}
    table = {}
    for template_id, text in tc.templates.items():
        found = [s for s, p in patterns.items() if p.search(text.lower())]
        if found:
            table[template_id] = found
    return table


def _mention_edges(frame: pd.DataFrame, table: dict[int, list[str]]) -> pd.DataFrame:
    """One row per (line, service it names), excluding a service naming itself."""
    named = frame[frame["template_id"].isin(table)]
    edges = named.assign(target=named["template_id"].map(table)).explode("target")
    return edges[edges["source"] != edges["target"]]


def _pagerank(services: list[str], edges: pd.DataFrame) -> pd.Series:
    """PageRank over 'A names B' edges: services many others depend on score high."""
    index = {s: i for i, s in enumerate(services)}
    n = len(services)
    link = np.zeros((n, n))
    for a, b in edges[["source", "target"]].drop_duplicates().itertuples(index=False):
        link[index[a], index[b]] = 1.0
    out = link.sum(axis=1, keepdims=True)
    transition = np.divide(link, out, out=np.full((n, n), 1.0 / n), where=out > 0)
    rank = np.full(n, 1.0 / n)
    for _ in range(PAGERANK_ITERATIONS):
        rank = (1 - PAGERANK_DAMPING) / n + PAGERANK_DAMPING * rank @ transition
    return pd.Series(rank, index=services)


def _bucket_counts(rows: pd.DataFrame, inject: int) -> pd.Series:
    bucket = (rows["timestamp"] - inject) // BUCKET_S
    return rows.assign(bucket=bucket).groupby(["source", "bucket"]).size()


def _first_spike(b: pd.DataFrame, w: pd.DataFrame, inject: int, dur_b: int) -> pd.Series:
    """Seconds after injection of the first bucket whose line count spikes above baseline."""
    n_buckets = max(int(np.ceil(dur_b / BUCKET_S)), 1)
    base = _bucket_counts(b, inject)
    total = base.groupby("source").sum()
    sumsq = (base**2).groupby("source").sum()
    mean = total / n_buckets
    std = np.sqrt(np.maximum(sumsq / n_buckets - mean**2, 0))
    limit = np.maximum(mean + SPIKE_SIGMAS * std, MIN_SPIKE_COUNT - 1)
    now = _bucket_counts(w, inject).reset_index(name="n")
    now["limit"] = now["source"].map(limit).fillna(MIN_SPIKE_COUNT - 1)
    hits = now[now["n"] > now["limit"]]
    return hits.groupby("source")["bucket"].min() * BUCKET_S


def _time_since(rows: pd.DataFrame, inject: int, services: list[str], missing: float) -> pd.Series:
    first = rows.groupby("source")["timestamp"].min() - inject
    return first.reindex(services).fillna(missing)


def _count(rows: pd.DataFrame, services: list[str]) -> pd.Series:
    return rows.groupby("source").size().reindex(services, fill_value=0)


@dataclass
class _Split:
    """A case cut at the injection time."""

    frame: pd.DataFrame
    baseline: pd.DataFrame
    window: pd.DataFrame
    inject: int
    services: list[str]
    baseline_s: int
    window_s: int

    @property
    def missing(self) -> float:
        return float(MISSING_TIME_FACTOR * self.window_s)


def _split(tc: TemplatedCase) -> _Split:
    frame, inject = tc.frame, tc.inject_time
    return _Split(
        frame=frame,
        baseline=frame[frame["timestamp"] < inject],
        window=frame[frame["timestamp"] >= inject],
        inject=inject,
        services=tc.services(),
        baseline_s=max(inject - int(frame["timestamp"].min()), 1),
        window_s=max(int(frame["timestamp"].max()) - inject + 1, 1),
    )


def _rate_features(sp: _Split, out: pd.DataFrame) -> None:
    is_err_w = sp.window["severity"].isin(ERROR_LEVELS)
    is_err_b = sp.baseline["severity"].isin(ERROR_LEVELS)
    err_w = _count(sp.window[is_err_w], sp.services)
    err_b = _count(sp.baseline[is_err_b], sp.services)
    out["error_ratio"] = np.log1p(err_w) - np.log1p(err_b * sp.window_s / sp.baseline_s)
    rate_w = _count(sp.window, sp.services) / sp.window_s
    rate_b = _count(sp.baseline, sp.services) / sp.baseline_s
    out["rate_ratio"] = np.log((rate_w + RATE_EPS) / (rate_b + RATE_EPS))
    out["t_first_error"] = _time_since(sp.window[is_err_w], sp.inject, sp.services, sp.missing)
    spike = _first_spike(sp.baseline, sp.window, sp.inject, sp.baseline_s)
    out["t_first_spike"] = spike.reindex(sp.services).fillna(sp.missing)


def _novelty_features(sp: _Split, out: pd.DataFrame) -> None:
    """Templates a service logs in the window that it never logged in the baseline."""
    seen = sp.baseline[["source", "template_id"]].drop_duplicates()
    first = sp.window.groupby(["source", "template_id"])["timestamp"].min().reset_index()
    merged = first.merge(seen, how="left", indicator=True)
    novel = merged[merged["_merge"] == "left_only"]
    distinct = first.groupby("source").size().reindex(sp.services, fill_value=0)
    out["novel_templates"] = novel.groupby("source").size().reindex(sp.services, fill_value=0)
    out["novel_fraction"] = out["novel_templates"] / distinct.clip(lower=1)
    out["t_first_novel"] = _time_since(novel, sp.inject, sp.services, sp.missing)


def _mention_features(tc: TemplatedCase, sp: _Split, out: pd.DataFrame) -> None:
    """How much other services talk about this one, and its place in the 'who names whom' graph."""
    edges = _mention_edges(sp.frame, _mention_table(tc, sp.services))
    named = edges[edges["timestamp"] >= sp.inject].rename(columns={"target": "named"})
    named = named.drop(columns="source").rename(columns={"named": "source"})
    out["mentions"] = _count(named, sp.services)
    out["mentions_warn"] = _count(named[named["severity"].isin(WARN_LEVELS)], sp.services)
    out["t_first_mention"] = _time_since(named, sp.inject, sp.services, sp.missing)
    pairs = edges[["source", "target"]].drop_duplicates()
    out["out_degree"] = pairs.groupby("source").size().reindex(sp.services, fill_value=0)
    out["in_degree"] = pairs.groupby("target").size().reindex(sp.services, fill_value=0)
    out["pagerank"] = _pagerank(sp.services, edges)


def _bucket_matrix(
    rows: pd.DataFrame, services: list[str], inject: int, lo: int, hi: int
) -> np.ndarray:
    """Line counts per (service, bucket) for bucket indices lo..hi-1, zeros included."""
    counts = np.zeros((len(services), max(hi - lo, 1)))
    index = {s: i for i, s in enumerate(services)}
    bucket = (rows["timestamp"] - inject) // BUCKET_S
    keep = (bucket >= lo) & (bucket < hi)
    grouped = rows[keep].assign(bucket=bucket[keep]).groupby(["source", "bucket"]).size()
    for (service, b), n in grouped.items():
        counts[index[service], int(b) - lo] = n
    return counts


def _first_deviation(base: np.ndarray, now: np.ndarray, missing: float) -> np.ndarray:
    """Seconds to the first window bucket that differs from baseline in either direction."""
    mean, std = base.mean(axis=1, keepdims=True), base.std(axis=1, keepdims=True)
    limit = np.maximum(SPIKE_SIGMAS * std, MIN_DEVIATION)
    hit = np.abs(now - mean) > limit
    first = np.where(hit.any(axis=1), hit.argmax(axis=1) * BUCKET_S, missing)
    return first.astype(float)


def _kl(a: np.ndarray, m: np.ndarray) -> np.ndarray:
    """Per-term KL(a || m) in bits; m > 0 wherever a > 0 because m is the mean of a and another."""
    out = np.zeros(len(a))
    nonzero = a > 0
    out[nonzero] = a[nonzero] * np.log2(a[nonzero] / m[nonzero])
    return out


def _js_and_vanished(sp: _Split) -> tuple[pd.Series, pd.Series]:
    """Jensen-Shannon divergence between a service's baseline and window template mix (0-1, base 2),
    and the share of its baseline lines whose template never appears in the window."""
    key = ["source", "template_id"]
    both = pd.concat(
        [sp.baseline.groupby(key).size().rename("b"), sp.window.groupby(key).size().rename("w")],
        axis=1,
    ).fillna(0.0)
    totals = both.groupby("source").transform("sum").replace(0.0, 1.0)
    p, q = both["b"] / totals["b"], both["w"] / totals["w"]
    m = (p + q) / 2
    divergence = 0.5 * (_kl(p.to_numpy(), m.to_numpy()) + _kl(q.to_numpy(), m.to_numpy()))
    gone = p.where(both["w"] == 0, 0.0)
    frame = pd.DataFrame({"js": divergence, "gone": gone}, index=both.index)
    per_service = frame.groupby("source").sum()
    return per_service["js"].reindex(sp.services, fill_value=0.0), per_service["gone"].reindex(
        sp.services, fill_value=0.0
    )


def _shift_features(sp: _Split, out: pd.DataFrame) -> None:
    lo, hi = -int(np.ceil(sp.baseline_s / BUCKET_S)), int(np.ceil(sp.window_s / BUCKET_S))
    base = _bucket_matrix(sp.baseline, sp.services, sp.inject, lo, 0)
    now = _bucket_matrix(sp.window, sp.services, sp.inject, 0, hi)
    out["t_first_deviation"] = _first_deviation(base, now, sp.missing)
    out["silence_increase"] = (now == 0).mean(axis=1) - (base == 0).mean(axis=1)
    js, gone = _js_and_vanished(sp)
    out["template_shift"] = js
    out["vanished_mass"] = gone


def case_features(tc: TemplatedCase) -> pd.DataFrame:
    """Feature matrix for one case, indexed by service."""
    sp = _split(tc)
    out = pd.DataFrame(index=sp.services)
    _rate_features(sp, out)
    _novelty_features(sp, out)
    _mention_features(tc, sp, out)
    _shift_features(sp, out)
    return _add_ranks(out)


def _add_ranks(out: pd.DataFrame) -> pd.DataFrame:
    """Within-case percentile ranks: 0 = first/most, 1 = last/least (ties share their average)."""
    for name in [*RAW_TIME, *SHIFT_TIME]:
        out[f"rank_{name}"] = out[name].rank(pct=True, method="average")
    for name in [*RAW_COUNT, "pagerank", *SHIFT_COUNT]:
        out[f"rank_{name}"] = out[name].rank(pct=True, ascending=False, method="average")
    return out[ALL_FEATURES]
