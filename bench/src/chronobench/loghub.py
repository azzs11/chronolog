"""Load Loghub HDFS_v1 and BGL for the anomaly benchmark.

Both datasets come from the Loghub Zenodo record. Only a fixed, time-ordered prefix of each log is
used (``PREFIX_LINES`` lines), because the Node detector replays about 10k lines per second and the
prefix keeps ``bench all`` in minutes. The prefix is a plain ``head``: no line is chosen by label.
"""

import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .download import _fetch

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "loghub"
ZENODO = "https://zenodo.org/records/8196385/files"  # Loghub (Zhu et al.), CC-BY-4.0
ARCHIVES = {"BGL": ("BGL.zip", 57_489_019), "HDFS": ("HDFS_v1.zip", 186_645_559)}
PREFIX_LINES = 2_000_000
WINDOW_S = 60  # BGL units are fixed 60 s windows; a window is anomalous if it has an alarm line.

# Loghub levels mapped onto the engine's five severities. Anything unknown counts as info.
SEVERITY_MAP = {
    "FATAL": "critical", "FAILURE": "critical", "SEVERE": "critical",
    "ERROR": "error", "WARN": "warning", "WARNING": "warning",
    "INFO": "info", "DEBUG": "debug",
}  # fmt: skip
BLOCK_ID = re.compile(r"blk_-?\d+")


@dataclass
class Dataset:
    """Lines in time order, and the (line, unit) pairs that say which unit each line belongs to."""

    name: str
    lines: pd.DataFrame  # columns: t (unix s), source, severity, is_alarm
    pairs: pd.DataFrame  # columns: line (row index in lines), unit
    unit_is_anomalous: pd.Series  # index: unit id, value: bool truth label


def _archive_path(name: str) -> Path:
    return DATA_DIR / ARCHIVES[name][0]


def download_archives() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for name, (filename, size) in ARCHIVES.items():
        path = _archive_path(name)
        if path.exists() and path.stat().st_size == size:
            continue
        _fetch(f"{ZENODO}/{filename}?download=1", path)
        if path.stat().st_size != size:
            path.unlink()
            raise RuntimeError(f"{filename}: size differs from the pinned size; re-run")


def _member(name: str) -> str:
    return {"BGL": "BGL.log", "HDFS": "HDFS.log"}[name]


def _prefix_path(name: str) -> Path:
    return DATA_DIR / name.lower() / f"{name}_head{PREFIX_LINES // 1_000_000}m.log"


def prepare_prefix(name: str) -> Path:
    """Write the first PREFIX_LINES lines of the dataset's log to disk (once)."""
    target = _prefix_path(name)
    if target.exists():
        return target
    download_archives()
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(_archive_path(name)) as archive, archive.open(_member(name)) as src:
        with open(target, "wb") as out:
            for i, line in enumerate(src):
                if i >= PREFIX_LINES:
                    break
                out.write(line)
        if name == "HDFS":
            labels = target.parent / "anomaly_label.csv"
            labels.write_bytes(archive.read("preprocessed/anomaly_label.csv"))
    return target


def _severity(level: pd.Series) -> pd.Series:
    return level.map(SEVERITY_MAP).fillna("info")


def parse_bgl(path: Path) -> Dataset:
    """BGL line: label epoch date node time node type component level message..."""
    rows = []
    with open(path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            parts = line.split(None, 9)
            if len(parts) < 9 or not parts[1].isdigit():
                continue
            rows.append((parts[0], int(parts[1]), parts[7], parts[8]))
    raw = pd.DataFrame(rows, columns=["label", "t", "source", "level"])
    lines = pd.DataFrame(
        {
            "t": raw["t"].astype("int64"),
            "source": raw["source"].fillna("unknown"),
            "severity": _severity(raw["level"]),
            "is_alarm": raw["label"] != "-",
        }
    )
    unit = lines["t"] // WINDOW_S
    pairs = pd.DataFrame({"line": range(len(lines)), "unit": unit})
    truth = lines["is_alarm"].groupby(unit).any()
    return Dataset("BGL", lines, pairs, truth)


def parse_hdfs(path: Path, labels_path: Path) -> Dataset:
    """HDFS line: date time pid level component: message (block ids inside the message)."""
    rows = []
    with open(path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            parts = line.split(None, 5)
            if len(parts) < 6:
                continue
            rows.append((parts[0] + parts[1], parts[3], parts[4].rstrip(":"), parts[5]))
    frame = pd.DataFrame(rows, columns=["stamp", "level", "source", "message"])
    stamps = pd.to_datetime(frame["stamp"], format="%y%m%d%H%M%S", utc=True)
    lines = pd.DataFrame(
        {
            "t": (stamps.astype("int64") // 1_000_000_000).astype("int64"),
            "source": frame["source"],
            "severity": _severity(frame["level"]),
            "is_alarm": False,
        }
    )
    blocks = frame["message"].str.findall(BLOCK_ID)
    pairs = blocks.explode().dropna().rename("block").rename_axis("line").reset_index()
    labels = pd.read_csv(labels_path).set_index("BlockId")["Label"] == "Anomaly"
    seen = labels.reindex(pairs["block"].unique())
    seen = seen.dropna().astype(bool)
    pairs = pairs[pairs["block"].isin(seen.index)].rename(columns={"block": "unit"})
    return Dataset("HDFS", lines, pairs.reset_index(drop=True), seen)


def load(name: str) -> Dataset:
    path = prepare_prefix(name)
    if name == "BGL":
        return parse_bgl(path)
    return parse_hdfs(path, path.parent / "anomaly_label.csv")
