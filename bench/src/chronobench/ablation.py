"""Ablation and breakdowns for RootRank, under the headline protocol (unseen root service).

Each variant removes (or keeps only) one group of features and is scored the same way as the full
model: 5-fold cross-validation over all cases with whole (system, root service) groups held out,
5 seeds, and the boosting rounds fixed to the value already chosen on the train split. Nothing is
tuned here; the table only says how much each signal contributes.
"""

import numpy as np
import pandas as pd

from .features import ALL_FEATURES, FEATURES, SHIFT_FEATURES
from .metrics import ac_at_k
from .rootrank import SEEDS, cross_validate, ranks_for

GROUPS = {
    "graph (who names whom)": ["in_degree", "out_degree", "pagerank", "rank_pagerank"],
    "mentions": [
        "mentions", "mentions_warn", "t_first_mention",
        "rank_mentions", "rank_mentions_warn", "rank_t_first_mention",
    ],
    "novel templates": [
        "novel_templates", "novel_fraction", "t_first_novel",
        "rank_novel_templates", "rank_t_first_novel",
    ],
    "rate and spikes": ["rate_ratio", "t_first_spike", "rank_rate_ratio", "rank_t_first_spike"],
    "error counts and timing": [
        "error_ratio", "t_first_error", "rank_error_ratio", "rank_t_first_error",
    ],
}  # fmt: skip
H_FEATURES = ["h_score", "rank_h_score"]


def add_hscore_features(table: pd.DataFrame, scores: dict[str, dict[str, float]]) -> pd.DataFrame:
    """Add ChronoLog-H's per-service score (log scale) and its within-case rank."""
    value = [scores[c].get(s, 0.0) for c, s in zip(table["case_id"], table["service"], strict=True)]
    out = table.assign(h_score=np.log1p(value))
    out["rank_h_score"] = out.groupby("case_id")["h_score"].rank(pct=True, ascending=False)
    return out


def evaluate_variant(table: pd.DataFrame, features: list[str], rounds: int) -> dict:
    ranks = {
        str(s): ranks_for(cross_validate(table, features, "service", rounds, s)) for s in SEEDS
    }
    summary = {}
    for k in (1, 3, 5):
        per_seed = [ac_at_k(r, k) for r in ranks.values()]
        summary[f"ac{k}"] = float(np.mean(per_seed))
        summary[f"ac{k}_std"] = float(np.std(per_seed))
    return {"features": len(features), **summary, "ranks_by_seed": ranks}


def run_ablation(table: pd.DataFrame, rounds: int, has_hscore: bool) -> dict:
    variants: dict[str, list[str]] = {"all features": FEATURES}
    for name, cols in GROUPS.items():
        variants[f"without {name}"] = [f for f in FEATURES if f not in cols]
    for name, cols in GROUPS.items():
        variants[f"only {name}"] = cols
    variants["only first-error rank"] = ["rank_t_first_error"]
    variants["all features + distribution-shift features"] = ALL_FEATURES
    variants["only distribution-shift features"] = SHIFT_FEATURES
    if has_hscore:
        variants["all features + ChronoLog-H score"] = [*FEATURES, *H_FEATURES]
        variants["without novel templates, + ChronoLog-H score"] = [
            f for f in FEATURES if f not in GROUPS["novel templates"]
        ] + H_FEATURES
    return {
        "rounds": rounds,
        "case_ids": sorted(table["case_id"].unique()),
        "variants": {n: evaluate_variant(table, cols, rounds) for n, cols in variants.items()},
    }
