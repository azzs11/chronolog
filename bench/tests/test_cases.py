import pytest

from chronobench.cases import TEST_PERCENT, load_index, parse_case_id, split_of
from chronobench.select import select_small


def test_parse_case_id_reads_ground_truth():
    case = parse_case_id("re2tt_ts-auth-service_cpu_2")
    assert (case.dataset, case.system, case.root_service, case.fault, case.instance) == (
        "re2",
        "tt",
        "ts-auth-service",
        "cpu",
        2,
    )
    assert case.stratum == "re2tt"


def test_parse_case_id_handles_code_faults_and_hyphenated_services():
    case = parse_case_id("re3ss_front-end_f2_1")
    assert (case.root_service, case.fault) == ("front-end", "f2")


@pytest.mark.parametrize(
    "bad", ["re1ob_adservice_cpu_1", "nonsense", "re2xx_a_cpu_1", "re2ob_cpu_1"]
)
def test_parse_case_id_rejects_other_ids(bad):
    with pytest.raises(ValueError):
        parse_case_id(bad)


def test_every_indexed_case_parses():
    for entry in load_index()["cases"]:
        parse_case_id(entry["case_id"])


def test_split_is_stable_and_roughly_the_configured_share():
    ids = [e["case_id"] for e in load_index()["cases"]]
    assert [split_of(i) for i in ids] == [split_of(i) for i in ids]
    share = sum(split_of(i) == "test" for i in ids) / len(ids) * 100
    # A hash gives roughly, not exactly, the target share. This only catches a degenerate split.
    assert abs(share - TEST_PERCENT) < 10


PINNED_SPLITS = {
    "re2ss_carts_cpu_1": "train",
    "re3tt_ts-auth-service_f1_1": "test",
}


def test_split_is_frozen():
    # If these change, the train/test split moved and every earlier result is invalid.
    pinned = {
        "re2ss_carts_cpu_1": split_of("re2ss_carts_cpu_1"),
        "re3tt_ts-auth-service_f1_1": split_of("re3tt_ts-auth-service_f1_1"),
    }
    assert pinned == PINNED_SPLITS


def test_small_selection_is_deterministic_and_stratified():
    first = select_small()
    assert first == select_small()
    assert len(first) == len(set(first)) == 40
    strata = {parse_case_id(c).stratum for c in first}
    assert strata == {"re2ob", "re2ss", "re2tt", "re3ob", "re3ss", "re3tt"}
