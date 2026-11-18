"""Download RCAEval logs from Hugging Face, pinned to one dataset revision.

Only ``logs.parquet`` and ``inject_time.txt`` are fetched. Metrics and traces are large and unused,
and ``root_cause.txt`` holds the answer, so it is never downloaded.
"""

import time
import urllib.error
import urllib.request
from pathlib import Path

from .cases import Case, load_index

BASE_URL = "https://huggingface.co/datasets/phamquiluan/RCAEval/resolve"
FILES = ("logs.parquet", "inject_time.txt")
RETRIES = 3
TIMEOUT_S = 120


def _fetch(url: str, dest: Path) -> None:
    last_error: Exception | None = None
    for attempt in range(RETRIES):
        try:
            tmp = dest.with_suffix(dest.suffix + ".part")
            with urllib.request.urlopen(url, timeout=TIMEOUT_S) as response, open(tmp, "wb") as out:
                while chunk := response.read(1 << 20):
                    out.write(chunk)
            tmp.replace(dest)
            return
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            time.sleep(2**attempt)
    raise RuntimeError(f"Failed to download {url}: {last_error}")


def download_cases(cases: list[Case]) -> int:
    """Fetch missing files, check log sizes against the index, return how many cases were new."""
    index = load_index()
    sizes = {e["case_id"]: e["log_bytes"] for e in index["cases"]}
    revision = index["revision"]
    fetched = 0
    for case in cases:
        case.directory.mkdir(parents=True, exist_ok=True)
        missing = [f for f in FILES if not (case.directory / f).exists()]
        for name in missing:
            _fetch(f"{BASE_URL}/{revision}/{case.case_id}/{name}", case.directory / name)
        logs = case.directory / "logs.parquet"
        if logs.stat().st_size != sizes[case.case_id]:
            logs.unlink()
            raise RuntimeError(f"{case.case_id}: logs.parquet size differs from the index; re-run")
        fetched += bool(missing)
    return fetched
