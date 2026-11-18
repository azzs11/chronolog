"""Pick the benchmark subsets. Selection is seeded and stratified, and never looks at results."""

import json
import random
from collections import defaultdict

from .cases import SUBSETS_DIR, load_index, parse_case_id, split_of

SEED = 2026

# Cases per stratum (dataset + system). 'small' is the default 40-case subset.
SMALL_QUOTA = {"re2ob": 8, "re2ss": 8, "re2tt": 8, "re3ob": 5, "re3ss": 5, "re3tt": 6}


def select_small() -> list[str]:
    """Stratified random sample: a fixed number of cases per dataset and system.

    Within a stratum, cases are drawn round-robin over (service, fault) groups so one
    service or one fault type cannot dominate.
    """
    rng = random.Random(SEED)
    by_stratum: dict[str, dict[tuple[str, str], list[str]]] = defaultdict(lambda: defaultdict(list))
    for entry in load_index()["cases"]:
        case = parse_case_id(entry["case_id"])
        by_stratum[case.stratum][(case.root_service, case.fault)].append(case.case_id)

    chosen: list[str] = []
    for stratum, quota in SMALL_QUOTA.items():
        groups = by_stratum[stratum]
        keys = sorted(groups)
        rng.shuffle(keys)
        pools = {k: sorted(groups[k]) for k in keys}
        for pool in pools.values():
            rng.shuffle(pool)
        picked: list[str] = []
        while len(picked) < quota:
            progressed = False
            for key in keys:
                if pools[key] and len(picked) < quota:
                    picked.append(pools[key].pop())
                    progressed = True
            if not progressed:
                raise ValueError(f"Stratum {stratum} has fewer than {quota} cases")
        chosen.extend(picked)
    return sorted(chosen)


def select_full() -> list[str]:
    return sorted(e["case_id"] for e in load_index()["cases"])


def write_subset(name: str) -> list[str]:
    cases = {"small": select_small, "full": select_full}[name]()
    SUBSETS_DIR.mkdir(exist_ok=True)
    payload = {
        "name": name,
        "seed": SEED,
        "revision": load_index()["revision"],
        "count": len(cases),
        "test_count": sum(split_of(c) == "test" for c in cases),
        "cases": cases,
    }
    (SUBSETS_DIR / f"{name}.json").write_text(json.dumps(payload, indent=1) + "\n")
    return cases
