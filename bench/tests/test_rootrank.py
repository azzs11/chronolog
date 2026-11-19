import numpy as np
import pandas as pd

from chronobench.rootrank import CV_FOLDS, fit, fold_of, rankings, ranks_for

FEATS = ["signal", "noise"]


def _table(n_cases: int = 40, services: int = 5, seed: int = 0) -> pd.DataFrame:
    """Cases where `signal` is high only on the root service (case ids that parse)."""
    rng = np.random.default_rng(seed)
    rows = []
    for c in range(n_cases):
        root = c % services
        case_id = f"re2ob_svc{root}_cpu_{c}"
        for s in range(services):
            signal = float(s == root) + rng.normal(0, 0.1)
            rows.append((case_id, f"svc{s}", int(s == root), signal, rng.random()))
    return pd.DataFrame(rows, columns=["case_id", "service", "label", "signal", "noise"])


def test_siblings_and_same_service_cases_share_a_fold():
    a, b = "re2ob_cartservice_cpu_1", "re2ob_cartservice_delay_3"
    assert fold_of(a, "service", 0) == fold_of(b, "service", 0)
    assert 0 <= fold_of(a, "service", 0) < CV_FOLDS


def test_system_folds_are_one_per_system():
    folds = {s: fold_of(f"re2{s}_x_cpu_1", "system", 0) for s in ("ob", "ss", "tt")}
    assert sorted(folds.values()) == [0, 1, 2]


def test_ranker_learns_a_clear_signal_and_is_deterministic():
    table = _table()
    first = fit(table, FEATS, rounds=30, seed=1)
    second = fit(table, FEATS, rounds=30, seed=1)
    held = _table(n_cases=10, seed=9)
    ranked = rankings(first, held, FEATS)
    assert ranks_for(ranked) == [1] * 10
    assert ranked == rankings(second, held, FEATS)


def test_cases_without_a_root_are_skipped_in_training_but_still_ranked():
    table = _table()
    table.loc[table["case_id"] == table["case_id"].iloc[0], "label"] = 0  # no positive candidate
    model = fit(table, FEATS, rounds=10, seed=0)
    assert set(rankings(model, table, FEATS)) == set(table["case_id"])
