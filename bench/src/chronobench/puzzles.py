"""Real incidents as Arcade puzzles ("Real cases"): one per (system, fault) in RCAEval.

Each puzzle ships what the game's clues need, precomputed by the app's own engine on the full logs:
a log-volume timeline (warnings count as trouble, as in the Daily Case), the learned service graph,
and per-service evidence (new messages, error lines, mentions) from RootRank with the true fault
time. Tock's guess is RootRank with an ESTIMATED start, as the app would run it.

Honesty rules, as for the replays:
  * Cases are picked blind: for every (system, fault) with a reachable held-out test case, the one
    with the smallest sha256 of its id. Fixed before looking at any result.
  * Every case is ranked by its own model, trained WITHOUT that case's (system, root service) group,
    so Tock has never seen the service it is asked about. Its misses stay in.
"""

import json
import tempfile
from pathlib import Path

import pandas as pd

from .cases import Case
from .evaluate import REPO_ROOT
from .replays import _digest, _rank, _timeline, heldout_model
from .runner import ensure_runner_built
from .servicegraph import learn_graph
from .templates import template_case

PUZZLES_PATH = REPO_ROOT / "apps" / "web" / "public" / "puzzles" / "real-cases.json"
MAX_TEMPLATES_SHOWN = 2


def select_puzzle_cases(cases: list[Case]) -> list[Case]:
    """For each (system, fault): the reachable held-out test case with the smallest id hash."""
    strata = sorted({(c.system, c.fault) for c in cases})
    chosen = []
    for system, fault in strata:
        pool = [c for c in cases if c.system == system and c.fault == fault and c.split == "test"]
        reachable = [c for c in pool if c.root_service in template_case(c).services()]
        if reachable:
            chosen.append(min(reachable, key=lambda c: _digest(c.case_id)))
    return chosen


def _clues(ranking: dict) -> list[dict]:
    """Per service, only what the clues show: new messages (a few), error lines, mentions."""
    rows = []
    for c in ranking["candidates"]:
        ev = c["evidence"]
        rows.append(
            {
                "service": c["service"],
                "errorLines": ev["errorLines"],
                "mentions": ev["mentions"],
                "newMessages": len(ev["novelTemplates"]),
                "examples": [t["template"] for t in ev["novelTemplates"][:MAX_TEMPLATES_SHOWN]],
            }
        )
    return sorted(rows, key=lambda r: r["service"])


def export_puzzles(
    table: pd.DataFrame, cases: list[Case], rounds: int, revision: str
) -> list[dict]:
    ensure_runner_built()
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, case in enumerate(select_puzzle_cases(cases)):
            path = Path(tmp) / f"model-{i}.json"
            path.write_text(json.dumps(heldout_model(table, [case], rounds)))
            ranked = _rank(case, path)
            order = [c["service"] for c in ranked["estimated"]["candidates"]]
            graph = learn_graph(template_case(case))
            out.append(
                {
                    "caseId": case.case_id,
                    "system": case.system,
                    "fault": case.fault,
                    "truth": case.root_service,
                    "services": sorted(c["service"] for c in ranked["given"]["candidates"]),
                    "tockGuess": order[0] if order else None,
                    "tockRankOfTruth": order.index(case.root_service) + 1
                    if case.root_service in order
                    else None,
                    "clues": _clues(ranked["given"]),
                    "timeline": _timeline(case, with_warnings=True),
                    "graph": {
                        "services": graph["services"],
                        "mentions": graph["mentions"],
                        "correlations": graph["correlations"],
                    },
                }
            )
    PUZZLES_PATH.parent.mkdir(parents=True, exist_ok=True)
    PUZZLES_PATH.write_text(
        json.dumps(
            {
                "source": f"RCAEval (MIT), revision {revision[:12]}, logs only",
                "modelNote": "Tock: RootRank trained without each case's service; start estimated",
                "cases": out,
            },
            separators=(",", ":"),
        )
        + "\n"
    )
    return out
