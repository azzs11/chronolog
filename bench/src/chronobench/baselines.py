"""Simple baselines every learned method has to beat.

All baselines see the same input as ChronoLog-H: the case's logs, with the injection time used
only to mark the start of the incident window. Services a method does not score are appended in
alphabetical order, so every ranking covers every candidate service.
"""

import random
from collections import Counter

from .adapt import CaseLogs

ERROR_LEVELS = ("error", "critical")


def complete_ranking(scored: list[str], candidates: list[str]) -> list[str]:
    """Scored services first, then the rest alphabetically."""
    seen = set(scored)
    return scored + [s for s in candidates if s not in seen]


def random_ranking(case: CaseLogs, seed: int) -> list[str]:
    services = case.services()
    random.Random(seed).shuffle(services)
    return services


def first_error_ranking(case: CaseLogs) -> list[str]:
    """Services in the order they first log an error-level line inside the incident window."""
    window = case.incident_window()
    errors = window[window["severity"].isin(ERROR_LEVELS)]
    first_seen = errors.drop_duplicates("source", keep="first")  # file order = time order
    return complete_ranking(list(first_seen["source"]), case.services())


def most_frequent_error_ranking(case: CaseLogs) -> list[str]:
    """Services by number of error-level lines in the window, most first (ties: alphabetical)."""
    window = case.incident_window()
    counts = Counter(window.loc[window["severity"].isin(ERROR_LEVELS), "source"])
    ordered = sorted(counts, key=lambda s: (-counts[s], s))
    return complete_ranking(ordered, case.services())
