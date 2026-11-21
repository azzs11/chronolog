"""Summarise the old-vs-new UI user test (docs/user-test/README.md). Standard library only.

    python3 scripts/user_test_analysis.py docs/user-test/results.csv

Per UI: tasks solved within the limit, median seconds per task, mean SUS. Per participant: the
difference of their median task times (old minus new). Then an exact two-sided sign test on those
differences, the honest test for 6-8 paired people. It reports; it does not decide.
"""

import csv
import sys
from math import comb
from statistics import mean, median

TIME_LIMIT_S = 300


def sus_score(answers: list[int]) -> float:
    """Brooke's SUS: odd items score a-1, even items 5-a, sum x 2.5 (0-100)."""
    if len(answers) != 10 or not all(1 <= a <= 5 for a in answers):
        raise ValueError(f"SUS needs ten answers from 1 to 5, got {answers}")
    return 2.5 * sum((a - 1) if i % 2 == 0 else (5 - a) for i, a in enumerate(answers))


def sign_test(differences: list[float]) -> tuple[int, int, float]:
    """Exact two-sided sign test. Ties (zero differences) are dropped, as is standard."""
    nonzero = [d for d in differences if d != 0]
    n, wins = len(nonzero), sum(1 for d in nonzero if d > 0)
    if n == 0:
        return 0, 0, 1.0
    tail = sum(comb(n, k) for k in range(0, min(wins, n - wins) + 1)) / 2**n
    return wins, n, min(1.0, 2 * tail)


def summarise(rows: list[dict]) -> str:
    tasks = [r for r in rows if r["task"] != "SUS" and not r["notes"].startswith("example")]
    sus_rows = [r for r in rows if r["task"] == "SUS" and not r["notes"].startswith("example")]
    lines = []
    for ui in ("old", "new"):
        mine = [r for r in tasks if r["ui"] == ui]
        times = [min(float(r["seconds"]), TIME_LIMIT_S) for r in mine]
        solved = sum(1 for r in mine if r["solved"].strip().lower() == "yes")
        sus = [
            sus_score([int(r[f"sus{i}"]) for i in range(1, 11)]) for r in sus_rows if r["ui"] == ui
        ]
        lines.append(
            f"{ui.upper()} UI: {solved}/{len(mine)} tasks solved,"
            f" median {median(times):.0f} s per task"
            if times
            else f"{ui.upper()} UI: no tasks recorded"
        )
        if sus:
            lines.append(
                f"  SUS: mean {mean(sus):.1f} (n={len(sus)},"
                f" each: {', '.join(f'{s:.1f}' for s in sus)})"
            )
    people = sorted({r["participant"] for r in tasks})
    diffs = []
    for p in people:
        per = {
            ui: [
                min(float(r["seconds"]), TIME_LIMIT_S)
                for r in tasks
                if r["participant"] == p and r["ui"] == ui
            ]
            for ui in ("old", "new")
        }
        if per["old"] and per["new"]:
            d = median(per["old"]) - median(per["new"])
            diffs.append(d)
            lines.append(
                f"  {p}: old {median(per['old']):.0f} s, new {median(per['new']):.0f} s,"
                f" new faster by {d:+.0f} s"
            )
    wins, n, p_value = sign_test(diffs)
    lines.append(
        f"New UI faster for {wins} of {n} participants (ties dropped);"
        f" exact two-sided sign test p = {p_value:.3f}."
    )
    lines.append(
        "With 6-8 people this is a small study: report every number above, and the open"
        " answers too."
    )
    return "\n".join(lines)


if __name__ == "__main__":
    with open(sys.argv[1], newline="") as f:
        print(summarise(list(csv.DictReader(f))))
