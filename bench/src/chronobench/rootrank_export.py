"""Export RootRank for the TypeScript engine, plus a golden fixture that proves the port matches.

``packages/engine/src/rootrank/modelV1.ts`` holds the LightGBM trees (``Booster.dump_model()``,
trimmed to what scoring needs) as a TypeScript module, so the API and the browser load it with no
file access. It is trained on every reachable case with the rounds chosen on the train split and
seed 0. The reported accuracy comes from cross-validation (``bench rootrank``),
not from this model, which has seen every case.

``packages/engine/tests/fixtures/rootrank-golden.json`` holds slices of real incidents with what
Python computes for them: severities, template ids, final templates, features and model scores.
The engine's parity test must reproduce every value.
"""

import json

import numpy as np
import pandas as pd

from .adapt import infer_severity, load_case_logs
from .cases import parse_case_id
from .evaluate import REPO_ROOT, code_fingerprint
from .features import BASE_FEATURES, case_features
from .rootrank import fit
from .servicegraph import learn_graph
from .startdetect import detect_start
from .templates import TemplatedCase, assign_templates

MODEL_PATH = REPO_ROOT / "packages" / "engine" / "src" / "rootrank" / "modelV1.ts"
GOLDEN_PATH = REPO_ROOT / "packages" / "engine" / "tests" / "fixtures" / "rootrank-golden.json"
GOLDEN_CASES = (
    "re2ob_checkoutservice_cpu_1",
    "re2ss_carts_delay_1",
    "re2tt_ts-order-service_delay_2",
)
SAMPLE_LINES = 800
SAMPLE_ERRORS = 250  # lines kept from the error-level lines, so the sample has the signals
SAMPLE_MENTIONS = 250  # ...and from lines that name another service
MESSAGE_CHARS = 120  # messages are cut to keep the fixture small
SAMPLE_SEED = 2026
SPLIT_KEYS = ("split_feature", "threshold", "decision_type", "default_left", "missing_type")


def _trim(node: dict) -> dict:
    if "leaf_value" in node:
        return {"leaf_value": node["leaf_value"]}
    out = {key: node[key] for key in SPLIT_KEYS}
    out["left_child"] = _trim(node["left_child"])
    out["right_child"] = _trim(node["right_child"])
    return out


def export_model(table: pd.DataFrame, rounds: int, revision: str) -> dict:
    model = fit(table, BASE_FEATURES, rounds, seed=0)
    dump = model.dump_model()
    return {
        "id": "rootrank-v1",
        "feature_names": dump["feature_names"],
        "tree_info": [{"tree_structure": _trim(t["tree_structure"])} for t in dump["tree_info"]],
        "trained_on": f"RCAEval RE2+RE3 revision {revision[:12]}, all reachable cases",
        "rounds": rounds,
        "code_fingerprint": code_fingerprint(),
    }


def _sample(case_id: str) -> tuple[pd.DataFrame, int]:
    logs = load_case_logs(parse_case_id(case_id))
    frame = logs.logs
    rng = np.random.default_rng(SAMPLE_SEED)
    names = [s.lower() for s in sorted(frame["source"].unique())]
    lower = frame["message"].str.lower()
    mentions = lower.apply(lambda m: any(n in m for n in names))
    keep: set[int] = set()
    errors = frame["severity"].isin(["error", "critical"])
    for mask, limit in ((errors, SAMPLE_ERRORS), (mentions, SAMPLE_MENTIONS)):
        pool = np.flatnonzero(mask.to_numpy())
        keep |= set(rng.choice(pool, size=min(limit, len(pool)), replace=False).tolist())
    rest = np.setdiff1d(np.arange(len(frame)), list(keep))
    keep |= set(rng.choice(rest, size=max(SAMPLE_LINES - len(keep), 0), replace=False).tolist())
    chosen = frame.iloc[sorted(keep)].reset_index(drop=True)
    return chosen.assign(message=chosen["message"].str.slice(0, MESSAGE_CHARS)), logs.inject_time


def _golden_case(case_id: str, model) -> dict:
    sample, inject = _sample(case_id)
    severity = infer_severity(sample["message"])
    ids, templates = assign_templates(sample["message"])
    frame = pd.DataFrame(
        {
            "timestamp": sample["timestamp"],
            "source": sample["source"],
            "severity": severity,
            "template_id": ids,
        }
    )
    case = TemplatedCase(parse_case_id(case_id), inject, frame, templates)
    features = case_features(case)[BASE_FEATURES]
    return {
        "case_id": case_id,
        "incident_start": inject,
        "lines": [
            [int(t), s, m]
            for t, s, m in zip(
                sample["timestamp"], sample["source"], sample["message"], strict=True
            )
        ],
        "expected": {
            "severity": severity.tolist(),
            "template_ids": [int(i) for i in ids],
            "templates": {str(k): v for k, v in templates.items()},
            "services": features.index.tolist(),
            "features": features.to_numpy().tolist(),
            "scores": model.predict(features).tolist(),
            "estimated_start": detect_start(frame),
            "graph": learn_graph(case),
        },
    }


def export_all(table: pd.DataFrame, rounds: int, revision: str) -> None:
    model_json = export_model(table, rounds, revision)
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    header = (
        "// GENERATED by `uv run bench export-rootrank`. Do not edit by hand.\n"
        "import type { TreeModel } from './model';\n\n"
    )
    body = json.dumps(model_json, separators=(",", ":"))
    MODEL_PATH.write_text(f"{header}export const ROOTRANK_V1: TreeModel = {body};\n")
    booster = fit(table, BASE_FEATURES, rounds, seed=0)
    cases = [_golden_case(c, booster) for c in GOLDEN_CASES]
    golden = {"cases": cases, "feature_names": BASE_FEATURES}
    GOLDEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    GOLDEN_PATH.write_text(json.dumps(golden, separators=(",", ":")) + "\n")
