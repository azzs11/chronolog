"""Turn a results JSON into RESULTS.md. Every number in the report comes from the JSON."""

import statistics
from collections import defaultdict

from .cases import SYSTEMS
from .metrics import AVG_K, KS, bootstrap_ci, group_of, summarise

LABELS = {
    "random": "Random (5 seeds)",
    "first_error": "First error",
    "most_frequent_error": "Most frequent error",
    "most_logs": "Most logs (diagnostic)",
    "chronolog_h": "**ChronoLog-H** (current rules)",
}
METRIC_COLUMNS = [f"ac@{k}" for k in KS] + [f"avg@{AVG_K}", "mrr"]
HEADERS = [f"AC@{k}" for k in KS] + [f"Avg@{AVG_K}", "MRR"]


def pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def _method_ranks(cases: list[dict], method: str) -> list[int | None]:
    return [c["methods"][method]["rank"] for c in cases]


def _random_ranks(cases: list[dict], seed: int) -> list[int | None]:
    return [c["random_ranks"][str(seed)] for c in cases]


def _row(cases: list[dict], method: str, seeds: list[int]) -> list[str]:
    """One table row: deterministic methods show a 95% bootstrap interval, random shows the seed spread."""
    if method == "random":
        per_seed = [summarise(_random_ranks(cases, s)) for s in seeds]
        cells = []
        for key in METRIC_COLUMNS:
            values = [r[key] for r in per_seed]
            spread = statistics.pstdev(values)
            cells.append(f"{values and statistics.fmean(values) * 100:.1f}% ± {spread * 100:.1f}")
        return cells
    ranks = _method_ranks(cases, method)
    summary = summarise(ranks)
    cells = []
    for key in METRIC_COLUMNS:
        text = pct(summary[key])
        if key.startswith("ac@"):
            groups = [group_of(c["case_id"]) for c in cases]
            low, high = bootstrap_ci(ranks, int(key[3:]), groups=groups)
            text += f" ({low * 100:.0f}–{high * 100:.0f})"
        cells.append(text)
    return cells


def _table(header: list[str], rows: list[list[str]]) -> str:
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join(["---"] * len(header)) + "|"]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join(lines)


def _main_table(cases: list[dict], methods: list[str], seeds: list[int]) -> str:
    rows = [[LABELS[m], *_row(cases, m, seeds)] for m in methods]
    return _table(["Method", *HEADERS], rows)


def _breakdown_table(
    cases: list[dict], methods: list[str], seeds: list[int], key: str, names
) -> str:
    groups: dict[str, list[dict]] = defaultdict(list)
    for case in cases:
        groups[case[key]].append(case)
    order = [g for g in names if g in groups] + sorted(g for g in groups if g not in names)
    header = ["Method", *[f"{g} (n={len(groups[g])})" for g in order]]
    rows = []
    for method in methods:
        cells = []
        for group in order:
            members = groups[group]
            if method == "random":
                value = statistics.fmean(
                    summarise(_random_ranks(members, s))["ac@3"] for s in seeds
                )
            else:
                value = summarise(_method_ranks(members, method))["ac@3"]
            cells.append(pct(value))
        rows.append([LABELS[method], *cells])
    return _table(header, rows)


def _link_rows(cases: list[dict]) -> str:
    rows = []
    for system in SYSTEMS:
        members = [c for c in cases if c["system"] == system]
        if not members:
            continue
        lines = sum(c["log_lines"] for c in members)
        linked = sum(c["linked_lines"] for c in members)
        rows.append(
            [SYSTEMS[system], str(len(members)), f"{lines:,}", f"{linked / lines * 100:.2f}%"]
        )
    lines = sum(c["log_lines"] for c in cases)
    linked = sum(c["linked_lines"] for c in cases)
    rows.append(["All", str(len(cases)), f"{lines:,}", f"{linked / lines * 100:.2f}%"])
    return _table(["System", "Cases", "Log lines", "Lines linked to a causal parent"], rows)


def _case_rows(cases: list[dict], methods: list[str]) -> str:
    def cell(rank: int | None) -> str:
        return "–" if rank is None else str(rank)

    rows = []
    for c in sorted(cases, key=lambda c: c["case_id"]):
        reach = "" if c["reachable"] else " ⚠"
        ranks = [
            cell(c["random_ranks"]["0"]) if m == "random" else cell(c["methods"][m]["rank"])
            for m in methods
        ]
        rows.append(
            [
                f"`{c['case_id']}`",
                c["split"],
                f"{c['root_service']}{reach}",
                str(c["candidates"]),
                *ranks,
            ]
        )
    header = [
        "Case",
        "Split",
        "True service",
        "Candidates",
        *[m.replace("_", " ") + (" (seed 0)" if m == "random" else "") for m in methods],
    ]
    return _table(header, rows)


def render_report(results: dict) -> str:
    meta, cases = results["meta"], results["cases"]
    methods = [m for m in meta["methods"] if m in LABELS]
    seeds = meta["seeds"]
    test_cases = [c for c in cases if c["split"] == "test"]
    reachable = sum(c["reachable"] for c in cases)
    faults = sorted({c["fault"] for c in cases})

    out = [
        "# ChronoBench results",
        "",
        "How often does each method name the true root-cause service in its top 1, 3 and 5? "
        "Generated by `uv run bench all`; do not edit by hand. Rules and definitions: [bench/README.md](bench/README.md).",
        "",
        "## Setup",
        "",
        f"- **Data:** [{meta['dataset']}](https://huggingface.co/datasets/{meta['dataset']}) (MIT), "
        f"revision `{meta['dataset_revision'][:12]}`, subset `{meta['subset']}`: {len(cases)} cases "
        f"({len(test_cases)} test, {len(cases) - len(test_cases)} train), logs only.",
        f"- **Reachable cases:** {reachable} of {len(cases)}. In the others the faulty service writes no logs, so "
        "no log-based method can name it. They stay in the tables as misses (⚠ below).",
        f"- **Code:** log adapter v{meta['adapter_version']}, code fingerprint `{meta['code_fingerprint']}`. "
        "A different fingerprint means the rules changed and these numbers are not comparable.",
        "- **Random:** mean ± standard deviation over "
        f"{len(seeds)} seeds. Other methods are deterministic; the bracket is a 95% bootstrap interval that resamples whole (system, root service) groups, because instances of one fault on one service are near-copies.",
        "",
        f"## All {len(cases)} cases",
        "",
        _main_table(cases, methods, seeds),
        "",
        f"## Held-out test cases only (n={len(test_cases)})",
        "",
        "The frozen split (`sha256(case_id) % 100 < 30`). No method here was tuned on any case. "
        "This is the table a learned method has to be compared on.",
        "",
        _main_table(test_cases, methods, seeds),
        "",
        "## AC@3 by system",
        "",
        _breakdown_table(cases, methods, seeds, "system", list(SYSTEMS)),
        "",
        "## AC@3 by fault type",
        "",
        "Groups are small, so treat differences here as hints, not findings.",
        "",
        _breakdown_table(cases, methods, seeds, "fault", faults),
        "",
        "## What ChronoLog-H does with these logs",
        "",
        _link_rows(cases),
        "",
        "## Every case",
        "",
        "Rank of the true service (1 is best, – means not ranked). ⚠ marks a case where the true service never logs.",
        "",
        _case_rows(cases, methods),
        "",
    ]
    return "\n".join(out)
