"""Golden file for the engine parity test `packages/engine/tests/unusual.parity.test.ts`.

Every STEP-th BGL line of the benchmark prefix (no label is read), templates mined on those lines
alone (as the engine would), then the benchmark's ``rare_lines`` at a share large enough that
seen-but-rare templates occur in so small a sample.
"""

import json

import numpy as np

from .anomaly_v2 import rare_lines
from .evaluate import REPO_ROOT
from .loghub import load
from .loghub_text import load_messages
from .templates import assign_templates

GOLDEN = REPO_ROOT / "packages" / "engine" / "tests" / "fixtures" / "unusual-golden.json"
STEP = 1000
SHARE = 0.01


def export_golden() -> int:
    lines = load("BGL").lines.iloc[::STEP]
    messages = load_messages("BGL").iloc[::STEP].reset_index(drop=True)
    ids, texts = assign_templates(messages)
    t = lines["t"].to_numpy()
    cutoff = int(t[len(t) // 2])
    flags = rare_lines(ids.to_numpy(), t, cutoff, SHARE)
    golden = {
        "share": SHARE, "cutoff": cutoff, "t": t.tolist(), "messages": messages.tolist(),
        "templateIds": ids.tolist(), "rare": [bool(f) for f in np.asarray(flags)],
    }  # fmt: skip
    GOLDEN.write_text(json.dumps(golden, separators=(",", ":")) + "\n")
    return len(t)
