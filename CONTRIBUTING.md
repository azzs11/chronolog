# Contributing to ChronoLog

Thanks for your interest. ChronoLog is being upgraded in phases (see [docs/ROADMAP.md](docs/ROADMAP.md)),
so please open an issue before starting a large change. That way we can check it fits the current phase.

## Getting started

```bash
git clone https://github.com/azzs11/chronolog.git
cd chronolog
cp .env.example .env   # set your own passwords
docker compose up -d
```

To run each service without Docker, see the "Development" section of the [README](README.md).

## Running tests

```bash
npm ci && npm test        # at the repo root: engine, API and web
npm run lint && npm run typecheck
cd apps/ml && uv run pytest && uv run ruff check .
```

## Ground rules

- **Honest numbers only.** Do not add an accuracy or performance number to the README or UI unless
  a script in the repo produces it, and name the dataset it was measured on.
- **Keep tests green** and add tests for new code.
- **No magic numbers.** Put weights, thresholds and windows in named constants, with a comment
  saying where the value came from.
- **Validate at the boundary.** Check API input and WebSocket messages before they reach the engine.
- **Small units.** Aim for functions under about 40 lines and files under about 300.
- **Comments explain why, not what.**

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`,
  `chore:`, `test:` and `refactor:`. Make one logical change per commit.
- Keep pull requests focused, and describe what changed and how you tested it.
- If a change moves a benchmark number, say so in the PR description.

## Reporting bugs

Open an issue with:
- the steps to reproduce
- what you expected and what happened
- relevant log output

Never paste secrets or private logs into an issue.
