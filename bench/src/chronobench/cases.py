"""RCAEval case ids, ground truth, and the frozen train/test split.

A case id looks like ``re2ss_carts_cpu_1``: dataset (re2/re3), system (ob/ss/tt), the service the
fault was injected into (the ground-truth root cause), the fault type and an instance number.
Only ids and logs are used. RCAEval's ``root_cause.txt`` files contain the answer and are
never read.
"""

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

BENCH_DIR = Path(__file__).resolve().parents[2]
INDEX_PATH = BENCH_DIR / "index" / "rcaeval_cases.json"
SUBSETS_DIR = BENCH_DIR / "subsets"
DATA_DIR = BENCH_DIR / "data" / "rcaeval"

SYSTEMS = {"ob": "Online Boutique", "ss": "Sock Shop", "tt": "Train Ticket"}

# Share of cases held out for testing. The split is a hash of the case id, so it never changes
# and a bigger subset can never move a case from test to train. Do not tune on test cases.
TEST_PERCENT = 30

_CASE_RE = re.compile(r"^(re[23])(ob|ss|tt)_(.+)_([a-z0-9]+)_(\d+)$")


@dataclass(frozen=True)
class Case:
    case_id: str
    dataset: str  # re2 or re3
    system: str  # ob, ss or tt
    root_service: str
    fault: str
    instance: int

    @property
    def stratum(self) -> str:
        return f"{self.dataset}{self.system}"

    @property
    def split(self) -> str:
        return split_of(self.case_id)

    @property
    def directory(self) -> Path:
        return DATA_DIR / self.case_id


def parse_case_id(case_id: str) -> Case:
    match = _CASE_RE.match(case_id)
    if not match:
        raise ValueError(f"Not an RCAEval case id: {case_id!r}")
    dataset, system, service, fault, instance = match.groups()
    return Case(case_id, dataset, system, service, fault, int(instance))


def split_of(case_id: str) -> str:
    """'test' for TEST_PERCENT% of cases, 'train' for the rest, decided by hashing the id."""
    bucket = int.from_bytes(hashlib.sha256(case_id.encode()).digest()[:4], "big") % 100
    return "test" if bucket < TEST_PERCENT else "train"


def load_index() -> dict:
    """The committed list of all RCAEval cases that have logs, with file sizes."""
    return json.loads(INDEX_PATH.read_text())


def load_subset(name: str) -> list[Case]:
    path = SUBSETS_DIR / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(f"No subset {name!r}; run `bench select --subset {name}` first")
    return [parse_case_id(c) for c in json.loads(path.read_text())["cases"]]
