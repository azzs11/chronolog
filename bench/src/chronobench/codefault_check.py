"""Why are the Train Ticket code faults (f1-f5) solved so easily? A measured check, not a guess.

For each code-fault case: which messages does the faulty service log during the incident that it
never logged before, and do they look like a restart (shutdown or startup lines)?
"""

import numpy as np

from .cases import Case
from .templates import template_case

RESTART_WORDS = ("shutting down", "shut down", "started", "starting", "initializ", "banner")
MIN_BASELINE_SERVICES = 2


def _novel(case: Case) -> tuple[list[str], float]:
    """Novel template texts of the root service, and novel templates per other service."""
    tc = template_case(case)
    frame, inject = tc.frame, tc.inject_time
    before = frame[frame["timestamp"] < inject]
    seen = set(zip(before["source"], before["template_id"], strict=True))
    first = frame[frame["timestamp"] >= inject].drop_duplicates(["source", "template_id"])
    pairs = zip(first["source"], first["template_id"], strict=True)
    keep = [pair not in seen for pair in pairs]
    novel = first[keep].sort_values("timestamp")
    root = novel[novel["source"] == case.root_service]
    others = novel[novel["source"] != case.root_service]
    per_other = len(others) / max(frame["source"].nunique() - 1, 1)
    return [tc.templates[t] for t in root["template_id"]], per_other


def code_fault_check(cases: list[Case]) -> dict:
    code = [c for c in cases if c.fault.startswith("f")]
    roots, others, restart = [], [], 0
    for case in code:
        texts, per_other = _novel(case)
        roots.append(len(texts))
        others.append(per_other)
        restart += any(word in " ".join(texts).lower() for word in RESTART_WORDS)
    return {
        "cases": len(code),
        "restart_like": restart,
        "median_novel_root": float(np.median(roots)),
        "median_novel_other": float(np.median(others)),
    }
