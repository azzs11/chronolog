import pandas as pd

from chronobench.ablation import GROUPS, add_hscore_features
from chronobench.ablation_report import fault_kind
from chronobench.features import FEATURES


def test_hscore_features_are_log_scaled_and_ranked_within_case():
    table = pd.DataFrame({"case_id": ["c1", "c1", "c1"], "service": ["a", "b", "c"]})
    out = add_hscore_features(table, {"c1": {"a": 100.0, "b": 10.0}})  # c has no score
    assert out["h_score"].tolist() == sorted(out["h_score"].tolist(), reverse=True)
    assert out.loc[out["service"] == "c", "h_score"].iloc[0] == 0.0
    assert out.loc[out["service"] == "a", "rank_h_score"].iloc[0] < 0.5  # highest score ranks first


def test_every_group_feature_exists_and_groups_do_not_overlap():
    seen: set[str] = set()
    for cols in GROUPS.values():
        assert set(cols) <= set(FEATURES)
        assert not seen & set(cols)
        seen |= set(cols)


def test_fault_kind_splits_code_faults_from_resource_faults():
    assert fault_kind({"fault": "f3"}) == "code fault (f1-f5)"
    assert fault_kind({"fault": "cpu"}) == "resource fault"
    assert fault_kind({"fault": "delay"}) == "resource fault"
