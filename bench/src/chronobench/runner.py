"""Run ChronoLog-H on a case by streaming its logs through the Node replay runner."""

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .adapt import CaseLogs

REPO_ROOT = Path(__file__).resolve().parents[3]
RUNNER_DIR = REPO_ROOT / "bench" / "runner"
RUNNER_ENTRY = RUNNER_DIR / "dist" / "replay.js"
TIMEOUT_S = 1800


@dataclass
class ReplayResult:
    ranking: list[str]  # services the engine scored, best first
    scores: dict[str, float]
    stats: dict[str, float]


def ensure_runner_built() -> None:
    """Build the TypeScript runner and the engine it uses, if their compiled files are missing."""
    if RUNNER_ENTRY.exists() and (REPO_ROOT / "packages" / "engine" / "dist").exists():
        return
    subprocess.run(["npm", "run", "build"], cwd=REPO_ROOT, check=True, capture_output=True)


def encode_case(case: CaseLogs) -> bytes:
    """The runner's input: a header line, then one JSON line per log in time order."""
    lines = [json.dumps({"inject_time": case.inject_time})]
    frame = case.logs
    for t, source, message, severity in zip(
        frame["timestamp"], frame["source"], frame["message"], frame["severity"], strict=True
    ):
        lines.append(
            json.dumps(
                {"t": int(t), "source": source, "message": message, "severity": severity},
                separators=(",", ":"),
            )
        )
    return ("\n".join(lines) + "\n").encode()


def run_chronolog_h(case: CaseLogs) -> ReplayResult:
    ensure_runner_built()
    done = subprocess.run(
        ["node", str(RUNNER_ENTRY)],
        input=encode_case(case),
        capture_output=True,
        timeout=TIMEOUT_S,
        check=False,
    )
    if done.returncode != 0:
        raise RuntimeError(f"Replay runner failed for {case.case.case_id}: {done.stderr.decode()}")
    output = json.loads(done.stdout)
    ranking = [row["service"] for row in output["ranking"]]
    scores = {row["service"]: row["score"] for row in output["ranking"]}
    return ReplayResult(ranking=ranking, scores=scores, stats=output["stats"])
