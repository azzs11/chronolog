"""Are the creatures' faces useful? Service moods (the app's engine) scored on RCAEval incidents.

Moods are computed every 30 s from 60 s before the fault to 5 min after it, by the Node runner
``moodcase.ts`` with the same ``moodsFromTagged`` the app uses (templates mined once per incident,
as for RootRank). Results are cached in ``data/cache/moods.<fingerprint>.json``.

Scoring treats moods as a ranking: services in the order they first look unwell after the
fault (earlier first; at the same step, the more serious mood first). Services that turn unwell
in the same step and mood are TIED; a tie is broken at random in expectation (a root tied with
two others counts 1/3 of a hit for AC@1), never alphabetically. Services that never look unwell
share the last place.
"""

import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

from .ablation_report import fault_kind
from .cases import Case
from .evaluate import REPO_ROOT, code_fingerprint
from .metrics import cluster_bootstrap, group_of
from .templates import template_case

ENTRY = REPO_ROOT / "bench" / "runner" / "dist" / "moodcase.js"
CACHE_DIR = REPO_ROOT / "bench" / "data" / "cache"
STEP_S = 30
FIRST_OFFSET = -60  # one step before the fault shows what "normal" noise looks like
LAST_OFFSET = 300
OFFSETS = list(range(FIRST_OFFSET, LAST_OFFSET + 1, STEP_S))
# Most serious first: the order the app's engine uses (MOODS in mood.ts).
MOOD_ORDER = ["restarted", "sick", "stressed", "quiet", "new-phrase", "fine"]


def cache_path() -> Path:
    return CACHE_DIR / f"moods.{code_fingerprint('moods')}.json"


def _run_case(case: Case) -> tuple[str, list[dict]]:
    tc = template_case(case)
    steps = [tc.inject_time + o for o in OFFSETS]
    header = json.dumps({"steps": steps, "templates": {str(k): v for k, v in tc.templates.items()}})
    body = "\n".join(
        json.dumps({"t": int(t), "s": s, "v": v, "k": int(k)}, separators=(",", ":"))
        for t, s, v, k in zip(
            tc.frame["timestamp"],
            tc.frame["source"],
            tc.frame["severity"],
            tc.frame["template_id"],
            strict=True,
        )
    )
    done = subprocess.run(
        ["node", str(ENTRY)],
        input=f"{header}\n{body}\n".encode(),
        capture_output=True,
        timeout=1800,
        check=False,
    )
    if done.returncode != 0:
        raise RuntimeError(f"moodcase failed for {case.case_id}: {done.stderr.decode()}")
    out = json.loads(done.stdout)["steps"]
    services = tc.services()
    return case.case_id, [
        {"offset": o, "moods": {s: step["moods"].get(s, "fine") for s in services}}
        for o, step in zip(OFFSETS, out, strict=True)
    ]


def compute_moods(cases: list[Case], workers: int) -> dict[str, list[dict]]:
    path = cache_path()
    cached = json.loads(path.read_text()) if path.exists() else {}
    todo = [c for c in cases if c.case_id not in cached]
    with ThreadPoolExecutor(max_workers=workers) as pool:  # each worker waits on a Node process
        for case_id, steps in pool.map(_run_case, todo):
            cached[case_id] = steps
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cached, sort_keys=True))
    return {c.case_id: cached[c.case_id] for c in cases}


def first_unwell(steps: list[dict]) -> dict[str, tuple[int, int] | None]:
    """Per service: (offset, mood rank) of its first not-fine step at or after the fault."""
    out: dict[str, tuple[int, int] | None] = {s: None for s in steps[0]["moods"]}
    for step in steps:
        if step["offset"] < 0:
            continue
        for service, mood in step["moods"].items():
            if out[service] is None and mood != "fine":
                out[service] = (step["offset"], MOOD_ORDER.index(mood))
    return out


def expected_hits(steps: list[dict], root: str, ks: tuple[int, ...] = (1, 3)) -> dict[int, float]:
    """Expected AC@k with ties broken uniformly at random. A root that never logs scores 0."""
    first = first_unwell(steps)
    if root not in first:
        return dict.fromkeys(ks, 0.0)
    never = (10**9, 10**9)
    key = {s: (v if v is not None else never) for s, v in first.items()}
    ahead = sum(1 for s in key if key[s] < key[root])
    tied = sum(1 for s in key if key[s] == key[root])
    return {k: float(min(max((k - ahead) / tied, 0.0), 1.0)) for k in ks}


def evaluate_moods(moods: dict[str, list[dict]], cases: list[Case]) -> dict:
    ids = [c.case_id for c in cases]
    groups = [group_of(i) for i in ids]
    expected = [expected_hits(moods[c.case_id], c.root_service) for c in cases]
    hits = {k: np.array([e[k] for e in expected]) for k in (1, 3)}
    delays, detected = [], []
    for c in cases:
        first = first_unwell(moods[c.case_id]).get(c.root_service)
        detected.append(first is not None)
        if first is not None:
            delays.append(first[0])
    before = [s for c in cases for s in moods[c.case_id] if s["offset"] == FIRST_OFFSET]
    false_rate = float(
        np.mean([np.mean([m != "fine" for m in s["moods"].values()]) for s in before])
    )
    resource = np.array([fault_kind({"fault": c.fault}) == "resource fault" for c in cases])

    def summary(h: np.ndarray, mask: np.ndarray | None = None) -> dict:
        values = h if mask is None else h[mask]
        g = groups if mask is None else [x for x, m in zip(groups, mask, strict=True) if m]
        low, high = cluster_bootstrap(values, g)
        return {"value": float(values.mean()), "low": low, "high": high, "cases": int(len(values))}

    return {
        "cases": len(ids),
        "per_case": {c.case_id: e for c, e in zip(cases, expected, strict=True)},
        "offsets": OFFSETS,
        "ac1": summary(hits[1]),
        "ac3": summary(hits[3]),
        "ac3_resource": summary(hits[3], resource),
        "ac3_code": summary(hits[3], ~resource),
        "root_unwell_within_5min": float(np.mean(detected)),
        "median_delay_s": float(np.median(delays)) if delays else None,
        "unwell_before_fault": false_rate,
        "fingerprint": code_fingerprint("moods"),
    }
