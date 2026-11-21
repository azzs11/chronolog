#!/usr/bin/env bash
# Prepare one user-test task: a fresh stack with one simulated incident whose cause is known.
#   scripts/user-test-task.sh A1      (tasks A1-A3 and B1-B3; see docs/user-test/README.md)
# It prints nothing about the answer, so it is safe to run with the participant watching.
# The facilitator's answer key is in docs/user-test/README.md.
set -euo pipefail

API="${API:-http://localhost:${BACKEND_PORT:-5050}}"
ADMIN_KEY="${ADMIN_API_KEY:-dev_key_change_in_prod}"

# Task -> "service fault seed". Seeds differ from the Arcade's, so nobody has seen these incidents.
case "${1:-}" in
  A1) task="orders disk 41" ;;
  A2) task="catalog cpu 42" ;;
  A3) task="cart loss 43" ;;
  B1) task="cart disk 51" ;;
  B2) task="db cpu 52" ;;
  B3) task="orders loss 53" ;;
  *) echo "usage: $0 A1|A2|A3|B1|B2|B3" >&2; exit 2 ;;
esac
read -r service fault seed <<<"$task"

docker compose down -v >/dev/null 2>&1
docker compose up -d >/dev/null 2>&1
if [ "${KEEP_FRONTEND:-1}" = "0" ]; then docker compose stop frontend >/dev/null 2>&1; fi
for _ in $(seq 1 60); do curl -fsS "$API/health" >/dev/null 2>&1 && break; sleep 2; done

curl -fsS -X POST "$API/api/rca/incident" -H 'Content-Type: application/json' -H "X-API-Key: $ADMIN_KEY" \
  -d "{\"service\":\"$service\",\"fault\":\"$fault\",\"seed\":$seed}" >/dev/null
echo "Task $1 is ready. Start the timer when the participant starts."
