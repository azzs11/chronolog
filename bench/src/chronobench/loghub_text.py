"""Message text and templates for the Loghub prefixes used by the anomaly benchmark.

``loghub.py`` keeps only times, sources and levels (it defines the published ChronoLog-H results and
is part of their code fingerprint, so it is left unchanged). This module reads the SAME prefix
files with the SAME row filters and returns each kept line's message, so row ``i`` here is row
``i`` of ``loghub.load(name).lines``. A test checks the alignment.
"""

import json
from pathlib import Path

import pandas as pd

from .loghub import prepare_prefix
from .templates import assign_templates

TEXT_VERSION = "lt1"  # bump when parsing or template settings change; it names the cache files


def _bgl_messages(path: Path) -> list[str]:
    """Same filter as ``parse_bgl``: skip lines with < 9 fields or a non-numeric epoch."""
    out = []
    with open(path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            parts = line.split(None, 9)
            if len(parts) < 9 or not parts[1].isdigit():
                continue
            out.append(parts[9].rstrip("\n") if len(parts) == 10 else "")
    return out


def _hdfs_messages(path: Path) -> list[str]:
    """Same filter as ``parse_hdfs``: skip lines with < 6 fields."""
    out = []
    with open(path, encoding="utf-8", errors="replace") as handle:
        for line in handle:
            parts = line.split(None, 5)
            if len(parts) < 6:
                continue
            out.append(parts[5].rstrip("\n"))
    return out


def load_messages(name: str) -> pd.Series:
    path = prepare_prefix(name)
    reader = _bgl_messages if name == "BGL" else _hdfs_messages
    return pd.Series(reader(path), dtype="object")


def load_templates(name: str) -> tuple[pd.Series, dict[int, str]]:
    """Drain template id per kept line, plus template texts. Cached next to the prefix file.

    Templates are mined without labels over the whole prefix in order of first appearance, the way
    an online miner would see them; mining is unsupervised, so it does not leak test labels.
    """
    path = prepare_prefix(name)
    ids_path = path.with_suffix(f".{TEXT_VERSION}.parquet")
    texts_path = path.with_suffix(f".{TEXT_VERSION}.json")
    if ids_path.exists() and texts_path.exists():
        ids = pd.read_parquet(ids_path)["template_id"]
        texts = {int(k): v for k, v in json.loads(texts_path.read_text()).items()}
        return ids, texts
    ids, texts = assign_templates(load_messages(name))
    pd.DataFrame({"template_id": ids}).to_parquet(ids_path)
    texts_path.write_text(json.dumps(texts, sort_keys=True))
    return ids, texts
