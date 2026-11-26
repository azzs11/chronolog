"""Command line entry point: ``uv run bench <command>``."""

import argparse
import json
import time
from pathlib import Path

from .ablation import add_hscore_features, run_ablation
from .ablation_report import render_ablation_report
from .adapt import load_case_logs
from .anomaly_eval import build_anomaly_results
from .anomaly_report import render_anomaly_report
from .anomaly_v2_eval import build_anomaly_v2_results
from .anomaly_v2_report import render_anomaly_v2_report
from .autostart import run_autostart
from .autostart_report import render_autostart_report
from .baselines import complete_ranking
from .cases import load_subset, parse_case_id, split_of
from .codefault_check import code_fault_check
from .download import download_cases
from .evaluate import DEFAULT_WORKERS, build_results, evaluate_cases
from .facts import write_facts
from .hscores import compute_hscores, load_hscores
from .moodeval import compute_moods, evaluate_moods
from .moods_report import render_moods_report
from .playground import render_playground_report, run_playground
from .puzzles import export_puzzles
from .report import render_report
from .reportcard import write_report_card
from .robustness import run_robustness
from .robustness_report import render_robustness_report
from .rootrank import feature_table, run_rootrank
from .rootrank_export import export_all
from .rootrank_report import render_rootrank_report
from .runner import run_chronolog_h
from .select import write_subset
from .servicegraph import (
    CORR_BUCKET_S,
    MIN_CORRELATION,
    MIN_MENTIONS,
    TRUE_EDGES,
    learn_graph,
    pooled_scores,
)
from .servicegraph_report import render_servicegraph_report
from .templates import template_cases


def _cmd_select(args: argparse.Namespace) -> None:
    cases = write_subset(args.subset)
    tests = sum(split_of(c) == "test" for c in cases)
    print(
        f"Wrote subsets/{args.subset}.json: {len(cases)} cases "
        f"({tests} test, {len(cases) - tests} train)"
    )


def _cmd_download(args: argparse.Namespace) -> None:
    cases = load_subset(args.subset)
    new = download_cases(cases)
    print(f"{len(cases)} cases ready ({new} newly downloaded)")


RESULTS_DIR = Path(__file__).resolve().parents[2] / "results"
ROOT_RESULTS_MD = Path(__file__).resolve().parents[3] / "RESULTS.md"


def _results_json(subset: str) -> Path:
    return RESULTS_DIR / f"rcaeval-{subset}.json"


def _report_path(subset: str) -> Path:
    return ROOT_RESULTS_MD if subset == "small" else RESULTS_DIR / f"RESULTS-{subset}.md"


def _cmd_run(args: argparse.Namespace) -> None:
    cases = load_subset(args.subset)
    download_cases(cases)
    started = time.perf_counter()
    results = build_results(args.subset, evaluate_cases(cases, workers=args.workers))
    RESULTS_DIR.mkdir(exist_ok=True)
    _results_json(args.subset).write_text(json.dumps(results, indent=1, sort_keys=True) + "\n")
    print(f"Evaluated {len(cases)} cases in {time.perf_counter() - started:.0f}s")


def _cmd_report(args: argparse.Namespace) -> None:
    results = json.loads(_results_json(args.subset).read_text())
    _report_path(args.subset).write_text(render_report(results))
    print(f"Wrote {_report_path(args.subset)}")


def _cmd_all(args: argparse.Namespace) -> None:
    _cmd_run(args)
    _cmd_report(args)


def _cmd_anomaly(args: argparse.Namespace) -> None:
    started = time.perf_counter()
    results = build_anomaly_results()
    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / "loghub-anomaly.json").write_text(
        json.dumps(results, indent=1, sort_keys=True) + "\n"
    )
    (RESULTS_DIR / "RESULTS-anomaly.md").write_text(render_anomaly_report(results))
    print(f"Anomaly benchmark done in {time.perf_counter() - started:.0f}s")


def _cmd_anomaly_v2(args: argparse.Namespace) -> None:
    started = time.perf_counter()
    results = build_anomaly_v2_results()
    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / "anomaly-v2.json").write_text(
        json.dumps(results, indent=1, sort_keys=True) + "\n"
    )
    (RESULTS_DIR / "RESULTS-anomaly-v2.md").write_text(render_anomaly_v2_report(results))
    print(f"Anomaly v2 benchmark done in {time.perf_counter() - started:.0f}s")


def _cmd_templates(args: argparse.Namespace) -> None:
    cases = load_subset(args.subset)
    download_cases(cases)
    started = time.perf_counter()
    done = template_cases([c.case_id for c in cases], args.workers)
    lines = sum(n for _, n, _ in done)
    mean_templates = sum(t for _, _, t in done) / len(done)
    print(
        f"Templated {len(done)} cases ({lines:,} lines, {mean_templates:.0f} templates per case) "
        f"in {time.perf_counter() - started:.0f}s"
    )


def _cmd_rootrank(args: argparse.Namespace) -> None:
    started = time.perf_counter()
    cases = load_subset("full")
    download_cases(cases)
    result = run_rootrank(feature_table(cases, args.workers))
    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / "rootrank.json").write_text(json.dumps(result, indent=1, sort_keys=True) + "\n")
    rcaeval = json.loads(_results_json("full").read_text())
    (RESULTS_DIR / "RESULTS-rootrank.md").write_text(render_rootrank_report(result, rcaeval))
    print(f"RootRank done in {time.perf_counter() - started:.0f}s")


def _cmd_hscores(args: argparse.Namespace) -> None:
    cases = load_subset("full")
    download_cases(cases)
    started = time.perf_counter()
    done = compute_hscores(cases, args.workers)
    print(f"ChronoLog-H scores for {len(done)} cases in {time.perf_counter() - started:.0f}s")


def _cmd_ablate(args: argparse.Namespace) -> None:
    started = time.perf_counter()
    cases = load_subset("full")
    table = feature_table(cases, args.workers)
    scores = load_hscores()
    complete = scores is not None and all(c.case_id in scores for c in cases)
    if complete:
        table = add_hscore_features(table, scores)
    rounds = json.loads((RESULTS_DIR / "rootrank.json").read_text())["rounds"]
    result = run_ablation(table, rounds, complete)
    result["code_fault_check"] = code_fault_check(cases)
    (RESULTS_DIR / "ablation.json").write_text(json.dumps(result, indent=1, sort_keys=True) + "\n")
    rcaeval = json.loads(_results_json("full").read_text())
    (RESULTS_DIR / "RESULTS-ablation.md").write_text(render_ablation_report(result, rcaeval))
    print(f"Ablation done in {time.perf_counter() - started:.0f}s (ChronoLog-H score: {complete})")


def _cmd_robustness(args: argparse.Namespace) -> None:
    started = time.perf_counter()
    cases = load_subset("full")
    clean = feature_table(cases, args.workers)
    rounds = json.loads((RESULTS_DIR / "rootrank.json").read_text())["rounds"]
    result = run_robustness(clean, rounds, args.workers)
    text = json.dumps(result, indent=1, sort_keys=True) + "\n"
    (RESULTS_DIR / "robustness.json").write_text(text)
    (RESULTS_DIR / "RESULTS-robustness.md").write_text(render_robustness_report(result))
    print(f"Robustness done in {time.perf_counter() - started:.0f}s")


def _cmd_export(args: argparse.Namespace) -> None:
    cases = load_subset("full")
    table = feature_table(cases, args.workers)
    rootrank = json.loads((RESULTS_DIR / "rootrank.json").read_text())
    revision = json.loads(_results_json("full").read_text())["meta"]["dataset_revision"]
    export_all(table, rootrank["rounds"], revision)
    print("Wrote the RootRank model and the parity fixture into packages/engine")


def _cmd_autostart(args: argparse.Namespace) -> None:
    started = time.perf_counter()
    cases = load_subset("full")
    clean = feature_table(cases, args.workers)
    rounds = json.loads((RESULTS_DIR / "rootrank.json").read_text())["rounds"]
    result = run_autostart(clean, rounds, args.workers)
    text = json.dumps(result, indent=1, sort_keys=True) + "\n"
    (RESULTS_DIR / "autostart.json").write_text(text)
    (RESULTS_DIR / "RESULTS-autostart.md").write_text(render_autostart_report(result))
    print(f"Autostart done in {time.perf_counter() - started:.0f}s")


def _cmd_facts(_args: argparse.Namespace) -> None:
    facts = write_facts()
    print("Wrote the web app's benchmark facts:", ", ".join(f"{k}={v}" for k, v in facts.items()))
    card = write_report_card()
    print(f"Wrote the Report card: {len(card['headline'])} methods, {len(card['byFault'])} faults")


def _context_rows(per_case: dict[str, dict]) -> tuple[dict[str, dict], dict[str, dict]]:
    """AC@1/AC@3 of RootRank and the simple rules on the same cases, with the same intervals, and
    the PAIRED difference RootRank minus faces (same incidents: shared difficulty cancels)."""
    import numpy as np

    from .metrics import cluster_bootstrap, group_of, paired_difference_ci

    rank = json.loads((RESULTS_DIR / "rootrank.json").read_text())["service"]
    runs = json.loads((RESULTS_DIR / "rcaeval-full.json").read_text())["cases"]
    full = {c["case_id"]: c for c in runs}
    ids = rank["case_ids"]
    groups = [group_of(i) for i in ids]

    def hit(r, k):
        return r is not None and r <= k

    seeds = list(rank["ranks_by_seed"].values())
    vectors = {
        "RootRank (unseen services, 5 seeds)": lambda k: np.array(
            [[hit(r, k) for r in s] for s in seeds], dtype=float
        ).mean(axis=0),
        "First error": lambda k: np.array(
            [hit(full[i]["methods"]["first_error"]["rank"], k) for i in ids], dtype=float
        ),
        "ChronoLog-H (old rules)": lambda k: np.array(
            [hit(full[i]["methods"]["chronolog_h"]["rank"], k) for i in ids], dtype=float
        ),
    }
    faces = {k: np.array([per_case[i][k] for i in ids]) for k in (1, 3)}
    rows, paired = {}, {}
    for name, vector in vectors.items():
        rows[name] = {}
        for k in (1, 3):
            h = vector(k)
            low, high = cluster_bootstrap(h, groups)
            rows[name][f"ac{k}"] = {"value": float(h.mean()), "low": low, "high": high}
    rootrank = vectors["RootRank (unseen services, 5 seeds)"]
    for k in (1, 3):
        low, high = paired_difference_ci(rootrank(k), faces[k], groups)
        gap = float(rootrank(k).mean() - faces[k].mean())
        paired[f"ac{k}"] = {"value": gap, "low": low, "high": high}
    return rows, paired


def _cmd_moods(args: argparse.Namespace) -> None:
    started = time.perf_counter()
    cases = load_subset("full")
    moods = compute_moods(cases, args.workers)
    result = evaluate_moods(moods, cases)
    context, paired = _context_rows(result["per_case"])
    result["rootrank_minus_faces"] = paired
    (RESULTS_DIR / "moods.json").write_text(json.dumps(result, indent=1, sort_keys=True) + "\n")
    (RESULTS_DIR / "RESULTS-moods.md").write_text(render_moods_report(result, context))
    print(
        f"Moods done in {time.perf_counter() - started:.0f}s:"
        f" AC@3 {100 * result['ac3']['value']:.1f}%"
    )


def _cmd_graph(_args: argparse.Namespace) -> None:
    from .templates import template_case

    cases = [c for c in load_subset("full") if c.system in TRUE_EDGES]
    per_case = [(c.system, learn_graph(template_case(c))) for c in cases]
    result = {
        "scores": pooled_scores(per_case),
        "min_mentions": MIN_MENTIONS,
        "min_correlation": MIN_CORRELATION,
        "bucket_s": CORR_BUCKET_S,
    }
    text = json.dumps(result, indent=1, sort_keys=True) + "\n"
    (RESULTS_DIR / "servicegraph.json").write_text(text)
    (RESULTS_DIR / "RESULTS-graph.md").write_text(render_servicegraph_report(result))
    print(f"Scored the learned graph on {len(per_case)} cases")


def _cmd_playground(_args: argparse.Namespace) -> None:
    result = run_playground()
    text = json.dumps(result, indent=1, sort_keys=True) + "\n"
    (RESULTS_DIR / "playground.json").write_text(text)
    (RESULTS_DIR / "RESULTS-playground.md").write_text(render_playground_report(result))
    print(f"Playground benchmark done: {result['overall']['runs']} simulated incidents")


def _cmd_export_puzzles(args: argparse.Namespace) -> None:
    cases = load_subset("full")
    table = feature_table(cases, args.workers)
    rounds = json.loads((RESULTS_DIR / "rootrank.json").read_text())["rounds"]
    revision = json.loads(_results_json("full").read_text())["meta"]["dataset_revision"]
    done = export_puzzles(table, cases, rounds, revision)
    hits = sum(1 for p in done if p["tockGuess"] == p["truth"])
    print(f"Wrote {len(done)} real-case puzzles; Tock's first guess is right in {hits}.")


def _cmd_replay(args: argparse.Namespace) -> None:
    parsed = parse_case_id(args.case)
    download_cases([parsed])
    case = load_case_logs(parsed)
    result = run_chronolog_h(case)
    ranking = complete_ranking(result.ranking, case.services())
    truth = case.case.root_service
    rank = ranking.index(truth) + 1 if truth in ranking else None
    print(f"{args.case}: truth={truth} rank={rank} of {len(ranking)}  stats={result.stats}")
    for service in ranking[:5]:
        print(f"  {result.scores.get(service, 0):>12.1f}  {service}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="bench", description="ChronoBench")
    sub = parser.add_subparsers(dest="command", required=True)

    select = sub.add_parser("select", help="write a subset file")
    select.add_argument("--subset", choices=["small", "full"], default="small")
    select.set_defaults(func=_cmd_select)

    download = sub.add_parser("download", help="download logs for a subset")
    download.add_argument("--subset", choices=["small", "full"], default="small")
    download.set_defaults(func=_cmd_download)

    for name, func, helptext in [
        ("run", _cmd_run, "evaluate every method on a subset and write the results JSON"),
        ("report", _cmd_report, "render RESULTS.md from the results JSON"),
        ("all", _cmd_all, "run, then report"),
    ]:
        command = sub.add_parser(name, help=helptext)
        command.add_argument("--subset", choices=["small", "full"], default="small")
        command.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
        command.set_defaults(func=func)

    anomaly = sub.add_parser("anomaly", help="score the anomaly detector on Loghub HDFS and BGL")
    anomaly.set_defaults(func=_cmd_anomaly)
    anomaly_v2 = sub.add_parser("anomaly-v2", help="score the template-based detector (v2)")
    anomaly_v2.set_defaults(func=_cmd_anomaly_v2)

    templates = sub.add_parser("templates", help="mine and cache Drain3 templates for a subset")
    templates.add_argument("--subset", choices=["small", "full"], default="small")
    templates.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    templates.set_defaults(func=_cmd_templates)

    rootrank = sub.add_parser("rootrank", help="train and evaluate RootRank on the full subset")
    rootrank.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    rootrank.set_defaults(func=_cmd_rootrank)

    hscores = sub.add_parser("hscores", help="cache ChronoLog-H per-service scores for all cases")
    hscores.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    hscores.set_defaults(func=_cmd_hscores)

    ablate = sub.add_parser("ablate", help="ablation and breakdowns for RootRank")
    ablate.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    ablate.set_defaults(func=_cmd_ablate)

    robustness = sub.add_parser("robustness", help="RootRank under dropped logs and clock skew")
    robustness.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    robustness.set_defaults(func=_cmd_robustness)

    export = sub.add_parser("export-rootrank", help="write the RootRank model and parity fixture")
    export.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    export.set_defaults(func=_cmd_export)

    autostart = sub.add_parser("autostart", help="RootRank with an estimated incident start")
    autostart.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    autostart.set_defaults(func=_cmd_autostart)

    facts = sub.add_parser("export-facts", help="write the benchmark numbers the web app shows")
    facts.set_defaults(func=_cmd_facts)

    moods = sub.add_parser("moods", help="score the creatures' moods on every RCAEval incident")
    moods.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    moods.set_defaults(func=_cmd_moods)

    graph = sub.add_parser("graph", help="score the learned service graph vs the real one")
    graph.set_defaults(func=_cmd_graph)

    playground = sub.add_parser("playground", help="RootRank on the playground's simulated faults")
    playground.set_defaults(func=_cmd_playground)

    puzzles = sub.add_parser("export-puzzles", help="real incidents as Arcade puzzles")
    puzzles.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    puzzles.set_defaults(func=_cmd_export_puzzles)

    replay = sub.add_parser("replay", help="run ChronoLog-H on one case and show its ranking")
    replay.add_argument("case")
    replay.set_defaults(func=_cmd_replay)

    args = parser.parse_args()
    args.func(args)
