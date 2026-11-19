"""Score anomaly detectors on Loghub HDFS and BGL: precision, recall, F1 and detection delay.

Every method is a set of flagged log lines. A unit (an HDFS block, or a 60 s BGL window) is
predicted anomalous if any of its lines is flagged. Delay is measured per episode: a run of
consecutive anomalous BGL windows, or one HDFS block. It is the time from the episode's first
reference line to the first flagged line in it (BGL: the first alarm line; HDFS: the block's first
log line, because the label has no time). Negative means flagged before the first alarm line.
"""

import json
import subprocess

import numpy as np
import pandas as pd

from .evaluate import REPO_ROOT, SEEDS, code_fingerprint
from .loghub import PREFIX_LINES, WINDOW_S, Dataset, load
from .runner import ensure_runner_built

ANOMALY_ENTRY = REPO_ROOT / "bench" / "runner" / "dist" / "anomaly-replay.js"
ERROR_LEVELS = ("error", "critical")
METHODS = ("always_anomalous", "random_same_budget", "severity_rule", "chronolog_h")
TIMEOUT_S = 3600


def run_detector(lines: pd.DataFrame) -> np.ndarray:
    """ChronoLog-H anomaly rules, replayed in Node. Returns a boolean flag per line."""
    ensure_runner_built()
    payload = "\n".join(
        json.dumps({"t": int(t), "source": s, "severity": v}, separators=(",", ":"))
        for t, s, v in zip(lines["t"], lines["source"], lines["severity"], strict=True)
    )
    done = subprocess.run(
        ["node", str(ANOMALY_ENTRY)], input=(payload + "\n").encode(),
        capture_output=True, timeout=TIMEOUT_S, check=False,
    )  # fmt: skip
    if done.returncode != 0:
        raise RuntimeError(f"Anomaly runner failed: {done.stderr.decode()}")
    flags = np.zeros(len(lines), dtype=bool)
    flags[json.loads(done.stdout)["flagged"]] = True
    return flags


def baseline_flags(lines: pd.DataFrame, chronolog: np.ndarray) -> dict[str, np.ndarray]:
    """always_anomalous flags every line; severity_rule flags error/critical lines;
    random_same_budget (returned per seed) flags lines at ChronoLog-H's overall flag rate."""
    return {
        "always_anomalous": np.ones(len(lines), dtype=bool),
        "severity_rule": lines["severity"].isin(ERROR_LEVELS).to_numpy(),
    }


def random_flags(n: int, rate: float, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).random(n) < rate


def _episodes(units: pd.Index, positives: pd.Series, windowed: bool) -> pd.Series:
    """Episode id per anomalous unit: consecutive BGL windows share one; HDFS blocks are alone."""
    anomalous = pd.Series(units[positives.reindex(units).to_numpy()])
    if not windowed:
        return pd.Series(range(len(anomalous)), index=anomalous.to_numpy())
    steps = (anomalous.diff() != 1).cumsum()
    return pd.Series(steps.to_numpy(), index=anomalous.to_numpy())


def score(data: Dataset, flags: np.ndarray, windowed: bool) -> dict[str, float | int | None]:
    t = data.lines["t"].to_numpy()
    paired = data.pairs.assign(t=t[data.pairs["line"]], flag=flags[data.pairs["line"]])
    by_unit = paired.groupby("unit")
    predicted = by_unit["flag"].any().reindex(data.unit_is_anomalous.index).fillna(False)
    truth = data.unit_is_anomalous
    tp = int((predicted & truth).sum())
    fp = int((predicted & ~truth).sum())
    fn = int((~predicted & truth).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    reference = by_unit["t"].min()
    if windowed:
        alarms = paired[data.lines["is_alarm"].to_numpy()[paired["line"]]]
        reference = alarms.groupby("unit")["t"].min()
    first_flag = paired[paired["flag"]].groupby("unit")["t"].min()
    episode = _episodes(truth.index, truth, windowed)
    frame = pd.DataFrame(
        {"episode": episode, "ref": reference.reindex(episode.index),
         "flag": first_flag.reindex(episode.index)}
    )  # fmt: skip
    grouped = frame.groupby("episode").agg(ref=("ref", "min"), flag=("flag", "min"))
    detected = grouped.dropna()
    delay = (detected["flag"] - detected["ref"]) if len(detected) else pd.Series(dtype=float)
    return {
        "precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "fn": fn,
        "episodes": len(grouped), "episodes_detected": len(detected),
        "median_delay_s": float(delay.median()) if len(delay) else None,
    }  # fmt: skip


def evaluate_dataset(data: Dataset) -> dict:
    windowed = data.name == "BGL"
    chronolog = run_detector(data.lines)
    rate = float(chronolog.mean())
    methods: dict[str, dict] = {
        name: score(data, f, windowed) for name, f in baseline_flags(data.lines, chronolog).items()
    }
    methods["chronolog_h"] = score(data, chronolog, windowed)
    seeds = [score(data, random_flags(len(chronolog), rate, s), windowed) for s in SEEDS]
    methods["random_same_budget"] = {
        k: float(np.mean([r[k] for r in seeds if r[k] is not None])) if k != "median_delay_s"
        else _mean_or_none([r[k] for r in seeds]) for k in seeds[0]
    }  # fmt: skip
    truth = data.unit_is_anomalous
    return {
        "lines": len(data.lines), "units": len(truth), "anomalous_units": int(truth.sum()),
        "base_rate": float(truth.mean()), "chronolog_h_flagged_line_rate": rate,
        "methods": methods,
    }  # fmt: skip


def _mean_or_none(values: list) -> float | None:
    present = [v for v in values if v is not None]
    return float(np.mean(present)) if present else None


def build_anomaly_results() -> dict:
    return {
        "setup": {
            "dataset": "Loghub HDFS_v1 and BGL (Zenodo record 8196385)",
            "prefix_lines": PREFIX_LINES, "bgl_window_s": WINDOW_S, "seeds": list(SEEDS),
            "code_fingerprint": code_fingerprint(runner_files=None), "methods": list(METHODS),
        },  # fmt: skip
        "datasets": {name: evaluate_dataset(load(name)) for name in ("HDFS", "BGL")},
    }
