"""Score anomaly v2 against the old detectors on the TEST half of HDFS and BGL.

Every method is scored on the same test units (units that start after the time cutoff). The old
methods (ChronoLog-H, severity rule, always anomalous, random) need no fitting; v2 is fitted on the
first half without labels. The Isolation Forest is random, so v2 is reported as the mean and the
range over the 5 seeds; the surprise rule is deterministic.
"""

import numpy as np
import pandas as pd

from . import anomaly_v2 as v2
from .adapt import infer_severity
from .anomaly_eval import ERROR_LEVELS, random_flags, run_detector
from .evaluate import SEEDS, code_fingerprint
from .loghub import PREFIX_LINES, WINDOW_S, Dataset, load
from .loghub_text import load_messages, load_templates

SENSITIVITY_SHARES = (1e-3, 1e-4, 1e-5, 1e-6)  # reported after the fact; the headline stays 1e-4
TOP_TEMPLATES = 8  # rare templates listed per dataset in the results, by test-period line count


def _old_methods(data: Dataset, test: pd.Index, windowed: bool) -> dict[str, dict]:
    def by_lines(flags: np.ndarray) -> dict:
        predicted, first = v2.line_flags_to_units(data, flags)
        return v2.score_units(data, test, predicted, first, windowed)

    chronolog = run_detector(data.lines)
    rate = float(chronolog.mean())
    seeds = [by_lines(random_flags(len(chronolog), rate, s)) for s in SEEDS]
    return {
        "always_anomalous": by_lines(np.ones(len(data.lines), dtype=bool)),
        "random_same_budget": _mean_runs(seeds),
        "severity_rule": by_lines(data.lines["severity"].isin(ERROR_LEVELS).to_numpy()),
        "chronolog_h": by_lines(chronolog),
    }


def _forest_units(data: Dataset, ids: np.ndarray, split: v2.Split, seed: int) -> pd.Series:
    """Boolean per test unit: the Isolation Forest score is above IF_THRESHOLD."""
    t = data.lines["t"].to_numpy()
    vocab = np.sort(pd.unique(ids[t < split.cutoff_t]))
    trees, sample = v2.fit_forest(v2.count_matrix(data, ids, split.fit_units, vocab), seed)
    scores = v2.forest_scores(trees, sample, v2.count_matrix(data, ids, split.test_units, vocab))
    return pd.Series(scores > v2.IF_THRESHOLD, index=split.test_units)


def forest_flag_rates(data: Dataset, ids: np.ndarray, split: v2.Split) -> dict[str, float]:
    """Share of FIT and of TEST units the seed-0 forest flags. Label-free: a large gap means the
    test period looks unlike the fit period (a shift), not that it is more anomalous."""
    t = data.lines["t"].to_numpy()
    vocab = np.sort(pd.unique(ids[t < split.cutoff_t]))
    trees, sample = v2.fit_forest(v2.count_matrix(data, ids, split.fit_units, vocab), SEEDS[0])
    rate = {}
    for name, units in (("fit", split.fit_units), ("test", split.test_units)):
        scores = v2.forest_scores(trees, sample, v2.count_matrix(data, ids, units, vocab))
        rate[name] = float((scores > v2.IF_THRESHOLD).mean())
    return rate


def _v2_methods(data: Dataset, ids: np.ndarray, split: v2.Split, windowed: bool) -> dict:
    t = data.lines["t"].to_numpy()
    test = split.test_units
    rare, rare_first = v2.line_flags_to_units(
        data, v2.rare_lines(ids, t, split.cutoff_t, v2.RARE_SHARE)
    )
    last = v2.unit_last_time(data).reindex(test)
    forest_runs, combined_runs = [], []
    for seed in SEEDS:
        forest = _forest_units(data, ids, split, seed)
        forest_first = last.where(forest)
        forest_runs.append(v2.score_units(data, test, forest, forest_first, windowed))
        both = forest | rare.reindex(test)
        first = pd.concat([forest_first, rare_first.reindex(test).where(rare)], axis=1).min(axis=1)
        combined_runs.append(v2.score_units(data, test, both, first, windowed))
    return {
        "v2_surprise": v2.score_units(data, test, rare, rare_first, windowed),
        "v2_forest": _mean_runs(forest_runs),
        "v2_combined": _mean_runs(combined_runs),
    }


def _sensitivity(data: Dataset, ids: np.ndarray, split: v2.Split, windowed: bool) -> dict:
    t = data.lines["t"].to_numpy()
    out = {}
    for share in SENSITIVITY_SHARES:
        rare, first = v2.line_flags_to_units(data, v2.rare_lines(ids, t, split.cutoff_t, share))
        out[f"{share:g}"] = v2.score_units(data, split.test_units, rare, first, windowed)
    return out


def _top_rare_templates(ids: np.ndarray, texts: dict[int, str], t: np.ndarray, cutoff: int):
    rare = v2.rare_lines(ids, t, cutoff, v2.RARE_SHARE) & (t >= cutoff)
    counts = pd.Series(ids[rare]).value_counts().head(TOP_TEMPLATES)
    return [{"template": texts[int(k)], "test_lines": int(v)} for k, v in counts.items()]


def severity_check(data: Dataset, messages: pd.Series) -> dict:
    """How well the text-only severity guess (adapter v1, the one the app uses for logs with no
    level) recovers Loghub's real level once the level is hidden. Error = error or critical."""
    truth = data.lines["severity"].isin(ERROR_LEVELS).to_numpy()
    guess = infer_severity(messages).isin(ERROR_LEVELS).to_numpy()
    tp = int((truth & guess).sum())
    precision = tp / guess.sum() if guess.sum() else 0.0
    recall = tp / truth.sum() if truth.sum() else 0.0
    return {
        "exact_level_accuracy": float((infer_severity(messages).to_numpy()
                                       == data.lines["severity"].to_numpy()).mean()),
        "error_precision": float(precision), "error_recall": float(recall),
        "true_error_share": float(truth.mean()), "guessed_error_share": float(guess.mean()),
    }  # fmt: skip


def _mean_runs(runs: list[dict]) -> dict:
    out: dict = {}
    for key in runs[0]:
        values = [r[key] for r in runs if r[key] is not None]
        out[key] = float(np.mean(values)) if values else None
        if key == "f1":
            out["f1_min"], out["f1_max"] = float(min(values)), float(max(values))
    return out


def evaluate_dataset(name: str) -> dict:
    data = load(name)
    template_ids, texts = load_templates(name)
    ids = template_ids.to_numpy()
    windowed = name == "BGL"
    split = v2.time_split(data)
    truth = data.unit_is_anomalous.reindex(split.test_units).astype(bool)
    t = data.lines["t"].to_numpy()
    return {
        "lines": len(data.lines), "templates": len(texts),
        "fit_units": len(split.fit_units), "test_units": len(split.test_units),
        "test_anomalous_units": int(truth.sum()), "test_base_rate": float(truth.mean()),
        "methods": {**_old_methods(data, split.test_units, windowed),
                    **_v2_methods(data, ids, split, windowed)},
        "rare_share_sensitivity": _sensitivity(data, ids, split, windowed),
        "top_rare_templates": _top_rare_templates(ids, texts, t, split.cutoff_t),
        "forest_flag_rate": forest_flag_rates(data, ids, split),
        "severity_from_text": severity_check(data, load_messages(name)),
    }  # fmt: skip


def build_anomaly_v2_results() -> dict:
    return {
        "setup": {
            "dataset": "Loghub HDFS_v1 and BGL (Zenodo record 8196385)",
            "prefix_lines": PREFIX_LINES,
            "bgl_window_s": WINDOW_S,
            "seeds": list(SEEDS),
            "fit_share": v2.FIT_SHARE,
            "rare_share": v2.RARE_SHARE,
            "if_trees": v2.IF_TREES,
            "if_sample": v2.IF_SAMPLE,
            "if_threshold": v2.IF_THRESHOLD,
            "code_fingerprint": code_fingerprint("anomaly-v2"),
            "chronolog_h_fingerprint": code_fingerprint("anomaly"),
        },  # fmt: skip
        "datasets": {name: evaluate_dataset(name) for name in ("HDFS", "BGL")},
    }
