#!/usr/bin/env bash
# Smoke test for a running ChronoLog stack (docker compose up -d).
# Checks that every service is up, the API talks to Postgres and the ML service,
# and that related logs form a causal chain. Exits non-zero on the first failure.
set -euo pipefail

API="${API:-http://localhost:${BACKEND_PORT:-5050}}"
WEB="${WEB:-http://localhost:3000}"
ML="${ML:-http://localhost:5001}"

wait_for() {
  for _ in $(seq 1 60); do
    if curl -fsS "$1" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  echo "FAIL: timed out waiting for $1" >&2
  return 1
}

check() {
  echo "-> $1"
}

check "services respond"
wait_for "$ML/health"
wait_for "$API/health"
wait_for "$WEB/"

check "API uses PostgreSQL and sees the ML service"
health="$(curl -fsS "$API/health")"
echo "$health" | grep -q '"persistence":"postgresql"'
echo "$health" | grep -q '"ml_classification":true'

check "related logs form a causal chain"
for i in 1 2 3; do
  curl -fsS -X POST "$API/api/logs" -H 'Content-Type: application/json' \
    -d "{\"message\":\"database connection pool exhausted port 5432 attempt $i\",\"severity\":\"error\",\"source\":\"database\"}" >/dev/null
done
curl -fsS "$API/api/causal/chains" | grep -q '"root_log_id"'
curl -fsS "$API/api/logs/stats" | grep -q '"total":'

check "web proxies /api to the backend"
curl -fsS "$WEB/api/logs/stats" >/dev/null

check "invalid input is rejected"
code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/logs" \
  -H 'Content-Type: application/json' -d '{"message":"x","severity":"nope"}')"
[ "$code" = "400" ] || { echo "FAIL: expected 400, got $code" >&2; exit 1; }

echo "smoke test passed"
