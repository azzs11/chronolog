"""RootRank: rank candidate services with a LightGBM lambdarank model over log features.

RCAEval has several instances of the same fault on the same service. A split by case id puts those
siblings on both sides, and a model can then recognise the service instead of the fault (measured
on train: AC@3 0.70 with case-id folds, 0.48 with whole root services held out). So there are
three evaluations, all reported:
  service  headline. 5-fold cross-validation over all cases where every fold holds out whole
           (system, root service) groups, so no sibling or same-service case is ever in training.
  system   leave one system out (train on two of Online Boutique / Sock Shop / Train Ticket).
  frozen   fit on the frozen train split, score the frozen test split (siblings can be in train,
           so this one is optimistic; it is the plan's original protocol).
Boosting rounds are chosen on the train split only, by grouped cross-validation on AC@3. Each
evaluation is repeated for 5 seeds (the seed changes the fold partition and the model's sampling).
Cases whose root service writes no logs have no positive candidate. They are excluded from
training but stay in every evaluation as misses, like for every other method.
"""

import hashlib
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor

import lightgbm as lgb
import numpy as np
import pandas as pd

from .cases import DATA_DIR, Case, parse_case_id
from .features import FEATURES, case_features
from .metrics import ac_at_k, hit_ranks
from .templates import TEMPLATE_VERSION, template_case

FEATURE_VERSION = f"{TEMPLATE_VERSION}f1"
CACHE_FILE = DATA_DIR.parent / "cache" / f"features.{FEATURE_VERSION}.parquet"
SEEDS = (0, 1, 2, 3, 4)
CV_FOLDS = 5
ROUND_CHOICES = (25, 50, 100, 200, 400)
SELECT_K = 3  # rounds are chosen on AC@3, the headline metric

# Small trees and strong regularisation, because there are only a few hundred training cases.
# Values are LightGBM-guide starting points for small ranking sets; they were not tuned on test.
PARAMS = {
    "objective": "lambdarank", "metric": "ndcg", "eval_at": [3], "learning_rate": 0.05,
    "num_leaves": 7, "min_data_in_leaf": 10, "feature_fraction": 0.8, "bagging_fraction": 0.8,
    "bagging_freq": 1, "lambda_l2": 1.0, "num_threads": 1, "deterministic": True,
    "force_row_wise": True, "verbose": -1,
}  # fmt: skip


def _case_rows(case_id: str) -> pd.DataFrame:
    case = parse_case_id(case_id)
    table = case_features(template_case(case))
    table.insert(0, "label", (table.index == case.root_service).astype(int))
    table.insert(0, "service", table.index)
    table.insert(0, "case_id", case_id)
    return table.reset_index(drop=True)


def feature_table(cases: Sequence[Case], workers: int = 4) -> pd.DataFrame:
    """Features and labels for every candidate of every case (cached on disk)."""
    ids = sorted(c.case_id for c in cases)
    if CACHE_FILE.exists():
        cached = pd.read_parquet(CACHE_FILE)
        if set(ids) <= set(cached["case_id"]):
            return cached[cached["case_id"].isin(ids)].reset_index(drop=True)
    with ProcessPoolExecutor(max_workers=workers) as pool:
        table = pd.concat(pool.map(_case_rows, ids), ignore_index=True)
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    table.to_parquet(CACHE_FILE)
    return table


def _groups(table: pd.DataFrame) -> list[int]:
    return table.groupby("case_id", sort=False).size().tolist()


def fit(train: pd.DataFrame, features: list[str], rounds: int, seed: int) -> lgb.Booster:
    """Train on cases that have a positive candidate; rows must be grouped by case."""
    has_root = train.groupby("case_id")["label"].transform("max") > 0
    rows = train[has_root]
    data = lgb.Dataset(rows[features], rows["label"], group=_groups(rows))
    return lgb.train({**PARAMS, "seed": seed}, data, num_boost_round=rounds)


def rankings(
    model: lgb.Booster, table: pd.DataFrame, features: list[str], rounds: int | None = None
) -> dict[str, list[str]]:
    """Per case, services from most to least likely; score ties break alphabetically."""
    scored = table.assign(score=model.predict(table[features], num_iteration=rounds))
    out: dict[str, list[str]] = {}
    for case_id, group in scored.groupby("case_id", sort=False):
        ordered = group.sort_values(["score", "service"], ascending=[False, True])
        out[str(case_id)] = ordered["service"].tolist()
    return out


def ranks_for(ranked: dict[str, list[str]]) -> list[int | None]:
    ids = sorted(ranked)
    return hit_ranks([ranked[c] for c in ids], [parse_case_id(c).root_service for c in ids])


SYSTEMS = ("ob", "ss", "tt")


def fold_of(case_id: str, kind: str, salt: int) -> int:
    """Fold index for a case. 'service' keeps every (system, root service) group in one fold."""
    case = parse_case_id(case_id)
    if kind == "system":
        return SYSTEMS.index(case.system)
    group = f"{case.system}/{case.root_service}"
    return int(hashlib.sha256(f"{salt}:{group}".encode()).hexdigest()[:8], 16) % CV_FOLDS


def n_folds(kind: str) -> int:
    return len(SYSTEMS) if kind == "system" else CV_FOLDS


def cross_validate(
    table: pd.DataFrame, features: list[str], kind: str, rounds: int, seed: int
) -> dict[str, list[str]]:
    """Out-of-fold rankings for every case in the table."""
    folds = table["case_id"].map(lambda c: fold_of(c, kind, seed))
    out: dict[str, list[str]] = {}
    for k in range(n_folds(kind)):
        held = table[folds == k]
        if not held.empty:
            model = fit(table[folds != k], features, rounds, seed)
            out.update(rankings(model, held, features))
    return out


def choose_rounds(train: pd.DataFrame, features: list[str]) -> tuple[int, dict[int, float]]:
    """Grouped CV on train cases only; the smallest round count with the best mean AC@3 wins."""
    folds = train["case_id"].map(lambda c: fold_of(c, "service", 0))
    hits: dict[int, list[int | None]] = {r: [] for r in ROUND_CHOICES}
    for k in range(CV_FOLDS):
        held = train[folds == k]
        if held.empty:
            continue
        model = fit(train[folds != k], features, max(ROUND_CHOICES), seed=0)
        for rounds in ROUND_CHOICES:
            hits[rounds] += ranks_for(rankings(model, held, features, rounds))
    mean = {r: ac_at_k(v, SELECT_K) for r, v in hits.items()}
    best = max(mean.values())
    return min(r for r, v in mean.items() if v == best), mean


def importance(models: list[lgb.Booster], features: list[str]) -> dict[str, float]:
    """Mean share of total split gain per feature over the seed models."""
    shares = [m.feature_importance("gain") / max(m.feature_importance("gain").sum(), 1e-9)
              for m in models]  # fmt: skip
    return dict(zip(features, map(float, np.mean(shares, axis=0)), strict=True))


def run_rootrank(table: pd.DataFrame, features: list[str] | None = None) -> dict:
    """Run the three evaluations. Ranks are per case, sorted by case id, one list per seed."""
    features = features or FEATURES
    split = table["case_id"].map(lambda c: parse_case_id(c).split)
    train, test = table[split == "train"], table[split == "test"]
    rounds, cv = choose_rounds(train, features)
    result: dict = {"features": features, "rounds": rounds,
                    "cv_ac3_by_rounds": {str(r): v for r, v in cv.items()}}  # fmt: skip
    for kind in ("service", "system"):
        result[kind] = {
            "case_ids": sorted(table["case_id"].unique()),
            "ranks_by_seed": {
                str(s): ranks_for(cross_validate(table, features, kind, rounds, s)) for s in SEEDS
            },
        }
    models = [fit(train, features, rounds, seed) for seed in SEEDS]
    by_seed = zip(SEEDS, models, strict=True)
    frozen = {str(s): ranks_for(rankings(m, test, features)) for s, m in by_seed}
    result["frozen"] = {"case_ids": sorted(test["case_id"].unique()), "ranks_by_seed": frozen}
    result["importance"] = importance(models, features)
    return result
