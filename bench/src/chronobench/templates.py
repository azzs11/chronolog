"""Log templates: turn each message into a template id with Drain3.

Messages are masked first (numbers, ids, addresses), then Drain3 groups the distinct masked
messages into templates. Mining the distinct messages, not every line, keeps a case to a few
seconds: a case has 57k-270k lines but only 2k-25k distinct masked messages. The result is
deterministic: distinct messages are fed in order of first appearance, and cluster ids are stable.
"""

import json
import re
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
from drain3 import TemplateMiner
from drain3.template_miner_config import TemplateMinerConfig

from .adapt import load_case_logs
from .cases import DATA_DIR, Case, parse_case_id

TEMPLATE_VERSION = "t2"  # bump when masking or Drain settings change; it names the cache files
CACHE_DIR = DATA_DIR.parent / "cache" / "templates"

# Drain3 settings. These are the Drain3 defaults (the Loghub-2.0 benchmark also uses them);
# they were not tuned on RCAEval.
DRAIN_SIM_THRESHOLD = 0.4
DRAIN_DEPTH = 4
DRAIN_MAX_CHILDREN = 100
WILDCARD = "<*>"

# Spring Boot prefix "<time> LEVEL pid --- [thread]": the time and thread are noise, and the
# severity already has its own column, so only "logger : text" is kept.
_SPRING_HEADER = re.compile(
    r"^\s*\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d[.,]?\d*\s+[A-Z]+\s+\d+\s+---\s+\[[^\]]*\]\s+"
)
# Order matters: specific patterns run before the generic number rule.
_MASKS = [
    re.compile(r"\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:?\d\d)?"),  # ISO time
    re.compile(r"\d\d/[A-Za-z]{3}/\d{4}:\d\d:\d\d:\d\d [+-]\d{4}"),  # access-log time
    re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"),
    re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b"),  # IPv4, optional port
    re.compile(r"\b0x[0-9a-fA-F]+\b"),
    re.compile(r"\b[0-9a-fA-F]{12,}\b"),  # long hex ids and hashes
    re.compile(r"\d+(?:\.\d+)?"),  # integers and decimals
]
# Very long payloads (JSON bodies) only differ after their first tokens, and Drain's cost grows
# with length, so mining looks at the first MAX_TOKENS tokens.
MAX_TOKENS = 40


def mask_message(message: str) -> str:
    message = _SPRING_HEADER.sub("", message)
    for pattern in _MASKS:
        message = pattern.sub(WILDCARD, message)
    return " ".join(message.split()[:MAX_TOKENS])


def _new_miner() -> TemplateMiner:
    config = TemplateMinerConfig()
    config.drain_sim_th = DRAIN_SIM_THRESHOLD
    config.drain_depth = DRAIN_DEPTH
    config.drain_max_children = DRAIN_MAX_CHILDREN
    config.profiling_enabled = False
    config.snapshot_interval_minutes = 10**9
    return TemplateMiner(persistence_handler=None, config=config)


@dataclass
class TemplatedCase:
    case: Case
    inject_time: int
    frame: pd.DataFrame  # columns: timestamp, source, severity, template_id (time order)
    templates: dict[int, str]

    def services(self) -> list[str]:
        return sorted(self.frame["source"].unique())


def assign_templates(messages: pd.Series) -> tuple[pd.Series, dict[int, str]]:
    """Template id for every message, plus the final text of each template."""
    masked = messages.map(mask_message)
    codes, distinct = pd.factorize(masked)  # distinct is in order of first appearance
    miner = _new_miner()
    ids = [miner.add_log_message(text)["cluster_id"] for text in distinct]
    templates = {c.cluster_id: c.get_template() for c in miner.drain.clusters}
    per_line = pd.Series(ids, dtype="int32").to_numpy()[codes]
    return pd.Series(per_line, index=messages.index, dtype="int32"), templates


def _cache_paths(case_id: str) -> tuple[Path, Path]:
    return (
        CACHE_DIR / f"{case_id}.{TEMPLATE_VERSION}.parquet",
        CACHE_DIR / f"{case_id}.{TEMPLATE_VERSION}.json",
    )


def template_case(case: Case) -> TemplatedCase:
    """Load a case's logs and their templates, mining and caching them on first use."""
    frame_path, templates_path = _cache_paths(case.case_id)
    inject_time = int((case.directory / "inject_time.txt").read_text().strip())
    if frame_path.exists() and templates_path.exists():
        frame = pd.read_parquet(frame_path)
        raw = json.loads(templates_path.read_text())
        return TemplatedCase(case, inject_time, frame, {int(k): v for k, v in raw.items()})
    logs = load_case_logs(case)
    ids, templates = assign_templates(logs.logs["message"])
    frame = logs.logs[["timestamp", "source", "severity"]].assign(template_id=ids)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(frame_path)
    templates_path.write_text(json.dumps(templates, sort_keys=True))
    return TemplatedCase(case, inject_time, frame, templates)


def _template_one(case_id: str) -> tuple[str, int, int]:
    done = template_case(parse_case_id(case_id))
    return case_id, len(done.frame), len(done.templates)


def template_cases(case_ids: list[str], workers: int) -> list[tuple[str, int, int]]:
    """Template cases in parallel processes (Drain3 is pure Python, so threads would not help)."""
    with ProcessPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(_template_one, case_ids))
