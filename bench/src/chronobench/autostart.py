"""End to end: RootRank when the incident start is estimated from the logs, not given.

Same protocol as the headline (whole root services held out, 5 seeds, model trained on true-start
features), but the held-out cases are cropped at random (see startdetect.crop_window) and RootRank
sees a start estimated from the cropped logs. Rows:
  true start         control: the true start on the same cropped logs.
  estimated start    the change-point estimate (what the app does).
  first-error rule   the old API heuristic; a case where it finds no start counts as a miss.
"""

from concurrent.futures import ProcessPoolExecutor

import numpy as np
import pandas as pd

from .cases import parse_case_id
from .features import FEATURES, case_features
from .rootrank import CV_FOLDS, SEEDS, fit, fold_of, rankings, ranks_for
from .startdetect import crop_window, detect_start, first_error_start
from .templates import TemplatedCase, template_case

STARTS = ("true start", "estimated start", "first-error rule")
WITHIN = (30, 60, 120)  # offset tolerances reported, in seconds


def _features_at(case_id: str, frame: pd.DataFrame, start: int, templates: dict) -> pd.DataFrame:
    case = parse_case_id(case_id)
    table = case_features(TemplatedCase(case, start, frame, templates))[FEATURES]
    table.insert(0, "label", (table.index == case.root_service).astype(int))
    table.insert(0, "service", table.index)
    table.insert(0, "case_id", case_id)
    return table.reset_index(drop=True)


def _case_job(case_id: str) -> tuple[str, dict[str, pd.DataFrame | None], dict[str, int | None]]:
    case = parse_case_id(case_id)
    tc = template_case(case)
    frame = crop_window(tc.frame, tc.inject_time, case_id)
    starts = {
        "true start": tc.inject_time,
        "estimated start": detect_start(frame),
        "first-error rule": first_error_start(frame),
    }
    tables = {
        name: None if s is None else _features_at(case_id, frame, s, tc.templates)
        for name, s in starts.items()
    }
    return case_id, tables, starts


def _offsets(starts: dict[str, dict[str, int | None]], truth: dict[str, int], name: str) -> dict:
    found = [(starts[c][name], truth[c]) for c in starts if starts[c][name] is not None]
    diff = np.array([s - t for s, t in found], dtype=float)
    out: dict = {"found": len(found), "cases": len(starts)}
    if len(diff):
        out["median_offset_s"] = float(np.median(diff))
        for w in WITHIN:
            out[f"within_{w}s"] = float(np.mean(np.abs(diff) <= w))
    return out


def run_autostart(clean: pd.DataFrame, rounds: int, workers: int) -> dict:
    case_ids = sorted(clean["case_id"].unique())
    with ProcessPoolExecutor(max_workers=workers) as pool:
        jobs = list(pool.map(_case_job, case_ids, chunksize=8))
    tables = {c: t for c, t, _ in jobs}
    starts = {c: s for c, _, s in jobs}
    truth = {c: int(starts[c]["true start"]) for c in case_ids}  # type: ignore[arg-type]
    result: dict = {"rounds": rounds, "cases": len(case_ids), "case_ids": case_ids, "variants": {}}
    for name in STARTS:
        by_seed = {}
        for seed in SEEDS:
            folds = clean["case_id"].map(lambda c, s=seed: fold_of(c, "service", s))
            ranked: dict[str, list[str]] = {c: [] for c in case_ids}  # no start found = a miss
            for k in range(CV_FOLDS):
                held = sorted(set(clean[folds == k]["case_id"]))
                parts = [tables[c][name] for c in held if tables[c][name] is not None]
                if parts:
                    model = fit(clean[folds != k], FEATURES, rounds, seed)
                    ranked.update(rankings(model, pd.concat(parts, ignore_index=True), FEATURES))
            by_seed[str(seed)] = ranks_for(ranked)
        result["variants"][name] = {
            "ranks_by_seed": by_seed,
            "offsets": _offsets(starts, truth, name),
        }
    return result
