"""Turn raw RCAEval log rows into the logs ChronoLog-H sees.

RCAEval logs have a timestamp (Unix seconds), a container name and a message, but no
severity. The engine needs one, so it is read from the message text with the fixed rules below
("log adapter v1").
These rules are part of the benchmark definition: they were written before any result was measured
and must not be tuned against results.

1. If the line names a level explicitly (FATAL, ERROR, WARN, INFO, DEBUG, ``level=error``, ...),
   the highest level named wins.
2. Otherwise keywords decide: error-like words give ``error``, warning-like words give ``warning``.
3. Otherwise the line is ``info``.
"""

from dataclasses import dataclass

import pandas as pd

from .cases import Case

ADAPTER_VERSION = 1

# Explicit level tokens, highest priority first.
_EXPLICIT_LEVELS: list[tuple[str, str]] = [
    ("critical", r"\b(?:FATAL|CRITICAL|PANIC|EMERG)\b|level=(?:fatal|critical|panic)"),
    ("error", r'\bERROR\b|level=error|"level":\s*"error"|\[error\]'),
    ("warning", r'\bWARN(?:ING)?\b|level=warn|"level":\s*"warn'),
    ("info", r'\bINFO\b|level=info|"level":\s*"info"'),
    ("debug", r'\bDEBUG\b|level=debug|"level":\s*"debug"'),
]

# Keyword fallback for lines with no explicit level (case-insensitive).
# "exception" has no leading word boundary so Java class names such as NullPointerException match.
_KEYWORD_ERROR = r"exception|\b(?:error|fail(?:ed|ure|ures|s)?|refused|unavailable|unable to)\b"
_KEYWORD_WARNING = r"\b(?:warn(?:ing)?|timeout|timed out|retry(?:ing)?|slow)\b"


def infer_severity(messages: pd.Series) -> pd.Series:
    """Severity for each message, following the adapter rules above."""
    text = messages.fillna("").astype(str)
    result = pd.Series("info", index=text.index, dtype="object")
    decided = pd.Series(False, index=text.index)

    for level, pattern in _EXPLICIT_LEVELS:
        hit = text.str.contains(pattern, regex=True) & ~decided
        result[hit] = level
        decided |= hit

    undecided = ~decided
    error = undecided & text.str.contains(_KEYWORD_ERROR, case=False, regex=True)
    warning = undecided & ~error & text.str.contains(_KEYWORD_WARNING, case=False, regex=True)
    result[error] = "error"
    result[warning] = "warning"
    return result


@dataclass
class CaseLogs:
    case: Case
    inject_time: int  # Unix seconds
    logs: pd.DataFrame  # columns: timestamp (int s), source, message, severity; file order kept

    def incident_window(self) -> pd.DataFrame:
        """Logs at or after the injection time. Earlier logs only warm up streaming state."""
        return self.logs[self.logs["timestamp"] >= self.inject_time]

    def services(self) -> list[str]:
        """Candidate root-cause services: every container that logged anything, sorted."""
        return sorted(self.logs["source"].unique())


def load_case_logs(case: Case) -> CaseLogs:
    raw = pd.read_parquet(case.directory / "logs.parquet")
    inject_time = int((case.directory / "inject_time.txt").read_text().strip())
    logs = pd.DataFrame(
        {
            "timestamp": raw["timestamp"].astype("int64"),
            "source": raw["container_name"].astype(str),
            "message": raw["message"].fillna("").astype(str),
        }
    )
    logs["severity"] = infer_severity(logs["message"])
    return CaseLogs(case=case, inject_time=inject_time, logs=logs.reset_index(drop=True))
