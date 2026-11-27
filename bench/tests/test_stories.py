from chronobench.stories import _spread, _summarise, render_stories_report


def _case(kept, sentences, cites, valid, reasons):
    return {
        "isWellFormed": True,
        "stats": {"sentences": sentences, "kept": kept, "cites": cites, "validCites": valid},
        "dropped": [{"reason": r, "text": "x"} for r in reasons],
        "kept": [{"text": "db logged 3 errors."}] * kept,
        "seconds": 2.0, "promptTokens": 300, "outputTokens": 100,
        "template": {"kept": 4, "sentences": 4}, "id": "disk/db/6",
    }  # fmt: skip


def test_summary_counts_precision_and_reasons():
    s = _summarise([_case(2, 3, 4, 2, ["uncited"]), _case(1, 1, 1, 1, [])])
    assert s["citation_precision"] == 3 / 5
    assert s["kept_rate"] == 3 / 4
    assert s["uncited_rate"] == 1 / 4
    assert s["dropped_by_reason"]["uncited"] == 1
    assert s["template_kept"] == s["template_sentences"] == 8


KEYS = ("citation_precision", "kept_rate", "uncited_rate")


def test_report_shows_mean_and_range():
    runs = [_summarise([_case(2, 3, 4, 2, [])]), _summarise([_case(3, 3, 4, 4, [])])]
    result = {
        "setup": {"model": "m", "model_seeds": [0, 1], "temperature": 0, "ollama_version": "1",
                  "split": "test", "cases": 1, "code_fingerprint": "abc"},
        "runs": runs,
        "spread": {k: _spread(runs, k) for k in KEYS},
        "examples": [],
    }  # fmt: skip
    md = render_stories_report(result)
    assert "**75.0% (50.0%-100.0%)**" in md
    assert "Uncited claims shown in the UI | 0" in md
