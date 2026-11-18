import math

from chronobench.metrics import ac_at_k, avg_at_k, bootstrap_ci, hit_ranks, mrr, summarise


def test_hit_ranks_are_one_based_and_none_when_missing():
    ranks = hit_ranks([["a", "b", "c"], ["x", "y"], ["q"]], ["b", "z", "q"])
    assert ranks == [2, None, 1]


def test_ac_at_k():
    ranks = [1, 2, 4, None]
    assert ac_at_k(ranks, 1) == 0.25
    assert ac_at_k(ranks, 3) == 0.5
    assert ac_at_k(ranks, 5) == 0.75


def test_avg_at_k_is_mean_of_ac_1_to_k():
    ranks = [1, 3]
    expected = (0.5 + 0.5 + 1.0 + 1.0 + 1.0) / 5
    assert math.isclose(avg_at_k(ranks, 5), expected)


def test_mrr_counts_missing_as_zero():
    assert math.isclose(mrr([1, 2, None]), (1 + 0.5 + 0) / 3)


def test_empty_input_is_nan_not_a_crash():
    assert math.isnan(ac_at_k([], 3))
    assert math.isnan(mrr([]))


def test_perfect_and_hopeless_methods():
    assert summarise([1, 1, 1])["ac@1"] == 1.0
    assert summarise([None, None])["ac@5"] == 0.0


def test_bootstrap_interval_contains_the_estimate_and_is_reproducible():
    ranks = [1, 1, 2, 3, None, 1, 5, 2, None, 1]
    low, high = bootstrap_ci(ranks, 3)
    assert low <= ac_at_k(ranks, 3) <= high
    assert (low, high) == bootstrap_ci(ranks, 3)
    assert bootstrap_ci([1, 1, 1, 1], 1) == (1.0, 1.0)
