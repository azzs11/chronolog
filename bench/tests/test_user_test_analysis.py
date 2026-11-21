import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "user_test_analysis.py"
spec = importlib.util.spec_from_file_location("user_test_analysis", SCRIPT)
uta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uta)


def test_sus_scoring_matches_brooke():
    assert uta.sus_score([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]) == 100.0
    assert uta.sus_score([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]) == 0.0
    assert uta.sus_score([3] * 10) == 50.0
    with pytest.raises(ValueError):
        uta.sus_score([3] * 9)


def test_sign_test_is_exact_and_drops_ties():
    assert uta.sign_test([5, 5, 5, 5, 5, 5]) == (6, 6, pytest.approx(0.03125))
    wins, n, p = uta.sign_test([5, -5, 0, 5])
    assert (wins, n) == (2, 3) and p == 1.0


def test_summary_reports_both_uis_and_each_participant():
    row = {f"sus{i}": "" for i in range(1, 11)} | {"notes": "", "confidence": "4"}
    rows = [
        row | {"participant": "P1", "ui": "old", "task": "A1", "seconds": "200", "solved": "yes"},
        row | {"participant": "P1", "ui": "new", "task": "B1", "seconds": "80", "solved": "yes"},
        row | {"participant": "P1", "ui": "new", "task": "B2", "seconds": "400", "solved": "no"},
    ]
    text = uta.summarise(rows)
    assert "OLD UI: 1/1 tasks solved, median 200 s" in text
    assert "NEW UI: 1/2 tasks solved, median 190 s" in text  # 400 is capped at the 300 s limit
    assert "P1: old 200 s, new 190 s" in text
