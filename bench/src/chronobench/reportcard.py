"""The numbers behind the app's Report card, generated from bench results; never edited by hand.

``uv run bench export-facts`` writes ``apps/web/src/features/report/reportCard.ts``.
``tests/test_facts.py`` fails if the committed file drifts from the results, so the Report card
cannot show a stale or invented number. Values are fractions (0-1); the UI formats them.
"""

import json
from pathlib import Path

import numpy as np

from .ablation_report import fault_kind
from .evaluate import REPO_ROOT
from .metrics import cluster_bootstrap, group_of
from .robustness import summarise

RESULTS_DIR = REPO_ROOT / "bench" / "results"
REPORT_PATH = REPO_ROOT / "apps" / "web" / "src" / "features" / "report" / "reportCard.ts"
BASELINES = {
    "first_error": "First error",
    "most_frequent_error": "Most frequent error",
    "chronolog_h": "ChronoLog-H (old hand rules)",
}
FAULT_LABELS = {
    "code": "Code change (f1-f5)", "loss": "Packet loss", "delay": "Network delay",
    "mem": "Memory", "cpu": "CPU", "socket": "Socket", "disk": "Disk",
}  # fmt: skip
KIND_LABELS = {
    "code fault (f1-f5)": "Code changes",
    "resource fault": "Resource faults (CPU, memory, disk, network)",
}
SYSTEM_LABELS = {"ob": "Online Boutique", "ss": "Sock Shop", "tt": "Train Ticket"}
ANOMALY_LABELS = {
    "chronolog_h": "ChronoLog-H (old rules)", "severity_rule": "Severity rule",
    "always_anomalous": "Flag everything", "random_same_budget": "Random",
    "v2_surprise": "Unusual messages (new)", "v2_forest": "Isolation Forest (new)",
    "v2_combined": "Both new signals",
}  # fmt: skip


def _hits(ranks: list, k: int = 3) -> np.ndarray:
    return np.array([r is not None and r <= k for r in ranks], dtype=float)


def _r(x: float) -> float:
    # Six decimals so the UI's single rounding to 0.1 pt matches the markdown reports exactly.
    return round(float(x), 6)


def _headline(rank: dict, cases: dict) -> list[dict]:
    ids = rank["service"]["case_ids"]
    groups = [group_of(i) for i in ids]
    rootrank = np.array([_hits(r) for r in rank["service"]["ranks_by_seed"].values()]).mean(axis=0)
    low, high = cluster_bootstrap(rootrank, groups)
    rows = [
        {
            "name": "RootRank",
            "value": _r(rootrank.mean()),
            "low": _r(low),
            "high": _r(high),
            "isOurs": True,
        }
    ]
    for method, label in BASELINES.items():
        hits = _hits([cases[i]["methods"][method]["rank"] for i in ids])
        lo, hi = cluster_bootstrap(hits, groups)
        rows.append(
            {
                "name": label,
                "value": _r(hits.mean()),
                "low": _r(lo),
                "high": _r(hi),
                "isOurs": False,
            }
        )
    random = np.mean([_hits([cases[i]["random_ranks"][s] for i in ids]).mean() for s in "01234"])
    rows.append(
        {"name": "Random guess", "value": _r(random), "low": None, "high": None, "isOurs": False}
    )
    return rows


def _breakdown(rank: dict, cases: dict, key, labels: dict[str, str]) -> list[dict]:
    ids = rank["service"]["case_ids"]
    rootrank = np.array([_hits(r) for r in rank["service"]["ranks_by_seed"].values()]).mean(axis=0)
    first = _hits([cases[i]["methods"]["first_error"]["rank"] for i in ids])
    keys = np.array([key(cases[i]) for i in ids])
    rows = []
    for k, label in labels.items():
        m = keys == k
        if m.any():
            rows.append(
                {
                    "name": label,
                    "cases": int(m.sum()),
                    "rootrank": _r(rootrank[m].mean()),
                    "firstError": _r(first[m].mean()),
                }
            )
    return sorted(rows, key=lambda r: -r["rootrank"])


def _robustness(robust: dict) -> list[dict]:
    rows = []
    for name, s in robust["scenarios"].items():
        rootrank, _ = summarise(s["rootrank"], 3)
        first, _ = summarise(s["first_error"], 3)
        rows.append({"name": name, "rootrank": _r(rootrank), "firstError": _r(first)})
    return sorted(rows, key=lambda r: (r["name"] != "clean", -r["rootrank"]))


def _anomaly(anomaly: dict) -> list[dict]:
    return [
        {
            "dataset": name,
            "methods": [
                {"name": ANOMALY_LABELS[m], "f1": _r(v["f1"])} for m, v in d["methods"].items()
            ],
        }
        for name, d in anomaly["datasets"].items()
    ]


def _faces(moods: dict) -> dict:
    """The creatures' moods as a ranking (bench moods): measured like every other method."""
    pick = lambda row: {k: _r(row[k]) for k in ("value", "low", "high")}  # noqa: E731
    return {
        "ac1": pick(moods["ac1"]),
        "ac3": pick(moods["ac3"]),
        "rootrankMinusFacesAc1": pick(moods["rootrank_minus_faces"]["ac1"]),
        "rootrankMinusFacesAc3": pick(moods["rootrank_minus_faces"]["ac3"]),
        "rootUnwellWithin5Min": _r(moods["root_unwell_within_5min"]),
        "medianDelaySeconds": moods["median_delay_s"],
        "unwellBeforeFault": _r(moods["unwell_before_fault"]),
    }


def build_report_card(results_dir: Path = RESULTS_DIR) -> dict:
    rank = json.loads((results_dir / "rootrank.json").read_text())
    full = json.loads((results_dir / "rcaeval-full.json").read_text())
    cases = {c["case_id"]: c for c in full["cases"]}
    fault = lambda c: "code" if fault_kind(c).startswith("code") else c["fault"]  # noqa: E731
    return {
        "dataset": f"RCAEval RE2 and RE3, {len(rank['service']['case_ids'])} incidents, logs only",
        "protocol": (
            "Top-3 hit rate on services the model never saw in training (5-fold, whole root"
            " services held out), mean of 5 seeds; ranges are 95% cluster-bootstrap intervals."
        ),
        "headline": _headline(rank, cases),
        "byFault": _breakdown(rank, cases, fault, FAULT_LABELS),
        "byKind": _breakdown(rank, cases, fault_kind, KIND_LABELS),
        "bySystem": _breakdown(rank, cases, lambda c: c["system"], SYSTEM_LABELS),
        "robustness": _robustness(json.loads((results_dir / "robustness.json").read_text())),
        "anomaly": _anomaly(json.loads((results_dir / "anomaly-v2.json").read_text())),
        "anomalyDataset": "Loghub HDFS and BGL (first 2M lines each), later half of each log",
        "faces": _faces(json.loads((results_dir / "moods.json").read_text())),
        "files": {
            "ranking": "bench/results/RESULTS-rootrank.md",
            "breakdown": "bench/results/RESULTS-ablation.md",
            "robustness": "bench/results/RESULTS-robustness.md",
            "anomaly": "bench/results/RESULTS-anomaly-v2.md",
            "faces": "bench/results/RESULTS-moods.md",
        },
    }


def render_report_card_ts(card: dict) -> str:
    return (
        "// GENERATED by `uv run bench export-facts` from bench/results. Do not edit by hand.\n"
        "// Every number on the Report card comes from here; values are fractions (0-1).\n"
        f"export const REPORT_CARD = {json.dumps(card, indent=2)} as const;\n"
    )


def write_report_card() -> dict:
    card = build_report_card()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(render_report_card_ts(card))
    return card
