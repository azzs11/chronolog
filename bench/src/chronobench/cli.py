"""Command line entry point: ``uv run bench <command>``."""

import argparse

from .cases import load_subset, split_of
from .download import download_cases
from .select import write_subset


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


def main() -> None:
    parser = argparse.ArgumentParser(prog="bench", description="ChronoBench")
    sub = parser.add_subparsers(dest="command", required=True)

    select = sub.add_parser("select", help="write a subset file")
    select.add_argument("--subset", choices=["small", "full"], default="small")
    select.set_defaults(func=_cmd_select)

    download = sub.add_parser("download", help="download logs for a subset")
    download.add_argument("--subset", choices=["small", "full"], default="small")
    download.set_defaults(func=_cmd_download)

    args = parser.parse_args()
    args.func(args)
