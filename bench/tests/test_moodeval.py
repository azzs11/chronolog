from chronobench.moodeval import expected_hits, first_unwell


def _steps(rows: list[tuple[int, dict[str, str]]]) -> list[dict]:
    return [{"offset": o, "moods": m} for o, m in rows]


def test_first_unwell_ignores_steps_before_the_fault():
    steps = _steps(
        [
            (-30, {"a": "sick", "b": "fine"}),
            (0, {"a": "fine", "b": "fine"}),
            (30, {"a": "stressed", "b": "sick"}),
        ]
    )
    assert first_unwell(steps) == {"a": (30, 2), "b": (30, 1)}


def test_expected_hits_orders_by_time_then_seriousness():
    steps = _steps(
        [(0, {"a": "stressed", "b": "fine", "c": "fine"}), (30, {"b": "sick", "c": "fine"})]
    )
    steps[1]["moods"]["a"] = "stressed"
    assert expected_hits(steps, "a") == {1: 1.0, 3: 1.0}
    assert expected_hits(steps, "b") == {1: 0.0, 3: 1.0}


def test_ties_are_shared_never_broken_by_name():
    steps = _steps([(0, {"a": "sick", "b": "sick", "c": "sick", "d": "fine"})])
    assert expected_hits(steps, "a")[1] == 1 / 3
    assert expected_hits(steps, "c")[1] == 1 / 3
    assert expected_hits(steps, "a")[3] == 1.0
    # Services that never look unwell share the last places.
    assert expected_hits(steps, "d") == {1: 0.0, 3: 0.0}


def test_a_root_that_never_logs_is_a_miss():
    steps = _steps([(0, {"a": "sick"})])
    assert expected_hits(steps, "missing") == {1: 0.0, 3: 0.0}
