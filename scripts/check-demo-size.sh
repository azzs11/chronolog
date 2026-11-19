#!/usr/bin/env bash
# Fail if the static demo's JavaScript grows past its budget (gzipped bytes).
# The demo has to load fast on a phone, so the budget is a CI check, not a hope.
set -euo pipefail

DIR="${1:-apps/web/dist-demo}"
BUDGET="${BUDGET:-150000}"

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
