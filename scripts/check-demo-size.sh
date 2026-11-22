#!/usr/bin/env bash
# Fail if the static demo's JavaScript grows past its budget (gzipped bytes).
# The demo has to load fast on a phone, so the budget is a CI check, not a hope.
# 150 KB while the demo was the Arcade only; 200 KB since 2026-11-22, when it became the whole app
# answered by an in-browser backend (~180 KB). Lighthouse (lighthouserc.json) still gates LCP < 3 s.
set -euo pipefail

DIR="${1:-apps/web/dist-demo}"
BUDGET="${BUDGET:-200000}"

total=0
for file in "$DIR"/assets/*.js; do
  size="$(gzip -c "$file" | wc -c | tr -d ' ')"
  echo "$(basename "$file"): ${size} bytes gzipped"
  total=$((total + size))
done
echo "total JavaScript: ${total} bytes gzipped (budget ${BUDGET})"
if [ "$total" -gt "$BUDGET" ]; then
  echo "FAIL: the demo's JavaScript is over budget" >&2
  exit 1
fi
