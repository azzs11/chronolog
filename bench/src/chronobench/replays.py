"""Helpers shared by the real-incident exports (puzzles.py writes the Arcade's Real Systems).

Real logs are tens of megabytes per incident, so each replay ships a precomputed result: the engine
(the same TypeScript code the app runs) ranked the full real logs offline, and the page shows that
ranking, the evidence and a small log-volume timeline. Two things keep it honest:
  * The 5 cases are picked blind by a fixed rule from the held-out test split: for each stratum
    (system, fault) below, the reachable test case with the smallest sha256 of its case id.
  * The model is trained WITHOUT any case from those cases' (system, root service) groups, so it
    has never seen the service it is asked about. Misses are shown like hits.
"""

import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd

from .adapt import load_case_logs
from .cases import Case, parse_case_id
from .evaluate import REPO_ROOT
from .features import BASE_FEATURES
from .metrics import group_of
from .rootrank import fit
from .templates import template_case

ENTRY = REPO_ROOT / "bench" / "runner" / "dist" / "rankcase.js"
# One incident per stratum, fixed before looking at any result.
STRATA = (("ob", "cpu"), ("ob", "delay"), ("ss", "mem"), ("ss", "loss"), ("tt", "f3"))
TIMELINE_BUCKET_S = 30
SPLIT_KEYS = ("split_feature", "threshold", "decision_type", "default_left", "missing_type")


def _digest(case_id: str) -> str:
    return hashlib.sha256(case_id.encode()).hexdigest()


def select_replay_cases(cases: list[Case]) -> list[Case]:
    """For each stratum, the reachable held-out test case with the smallest hash of its id."""
    chosen = []
    for system, fault in STRATA:
        pool = [c for c in cases if c.system == system and c.fault == fault and c.split == "test"]
        reachable = [c for c in pool if c.root_service in template_case(c).services()]
        chosen.append(min(reachable, key=lambda c: _digest(c.case_id)))
    return chosen


def _trim(node: dict) -> dict:
    if "leaf_value" in node:
        return {"leaf_value": node["leaf_value"]}
    out = {key: node[key] for key in SPLIT_KEYS}
    out["left_child"] = _trim(node["left_child"])
    out["right_child"] = _trim(node["right_child"])
    return out


def heldout_model(table: pd.DataFrame, chosen: list[Case], rounds: int) -> dict:
    """A model that has never seen the services of the chosen cases (whole groups held out)."""
    held = {group_of(c.case_id) for c in chosen}
    train = table[~table["case_id"].map(group_of).isin(held)]
    dump = fit(train, BASE_FEATURES, rounds, seed=0).dump_model()
    trees = [{"tree_structure": _trim(t["tree_structure"])} for t in dump["tree_info"]]
    return {"id": "rootrank-v1-heldout", "feature_names": dump["feature_names"], "tree_info": trees}


def _timeline(case: Case, with_warnings: bool = False) -> dict:
    tc = template_case(case)
    frame = tc.frame
    t0 = int(frame["timestamp"].min())
    buckets = int((int(frame["timestamp"].max()) - t0) // TIMELINE_BUCKET_S) + 1
    services = tc.services()
    index = {s: i for i, s in enumerate(services)}
    lines = np.zeros((len(services), buckets), dtype=int)
    errors = np.zeros_like(lines)
    bucket = ((frame["timestamp"] - t0) // TIMELINE_BUCKET_S).to_numpy()
    rows = frame["source"].map(index).to_numpy()
    np.add.at(lines, (rows, bucket), 1)
    levels = ["error", "critical", "warning"] if with_warnings else ["error", "critical"]
    is_error = frame["severity"].isin(levels).to_numpy()
    np.add.at(errors, (rows[is_error], bucket[is_error]), 1)
    return {
        "bucketSeconds": TIMELINE_BUCKET_S,
        "startOffset": t0 - tc.inject_time,
        "services": [
            {"name": s, "lines": lines[i].tolist(), "errors": errors[i].tolist()}
            for i, s in enumerate(services)
        ],
    }


def _rank(case: Case, model_path: Path) -> dict:
    logs = load_case_logs(case)
    frame = logs.logs
    header = json.dumps({"incident_start": logs.inject_time})
    body = "\n".join(
        json.dumps({"t": int(t), "source": s, "message": m, "severity": v}, separators=(",", ":"))
        for t, s, m, v in zip(
            frame["timestamp"], frame["source"], frame["message"], frame["severity"], strict=True
        )
    )
    done = subprocess.run(
        ["node", str(ENTRY), str(model_path)],
        input=f"{header}\n{body}\n".encode(),
        capture_output=True,
        timeout=1800,
        check=False,
    )
    if done.returncode != 0:
        raise RuntimeError(f"rankcase failed for {case.case_id}: {done.stderr.decode()}")
    return json.loads(done.stdout)


def parse_all(case_ids: list[str]) -> list[Case]:
    return [parse_case_id(c) for c in case_ids]
