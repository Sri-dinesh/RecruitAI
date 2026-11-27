#!/usr/bin/env bash
# Phase 24 chaos drill: keep traffic flowing, remove one dependency, observe
# the degradation contract, then restore the dependency.
#
# Fault injection is deliberately operator-supplied. The script never stops a
# service by itself; set CHAOS_START and CHAOS_STOP to safe commands for your
# environment (for example a `docker compose stop redis` wrapper) and opt in
# with CONFIRM_CHAOS=yes.
#
# Usage:
#   CONFIRM_CHAOS=yes \
#   CHAOS_START='ssh db-1 "systemctl stop postgresql"' \
#   CHAOS_STOP='ssh db-1 "systemctl start postgresql"' \
#   ./scripts/load/chaos-drill.sh
set -euo pipefail

if [[ "${CONFIRM_CHAOS:-}" != "yes" ]]; then
  echo "Refusing to run: set CONFIRM_CHAOS=yes after reviewing CHAOS_START/CHAOS_STOP." >&2
  exit 1
fi
if [[ -z "${CHAOS_START:-}" || -z "${CHAOS_STOP:-}" ]]; then
  echo "Both CHAOS_START and CHAOS_STOP must be set." >&2
  exit 1
fi

SCENARIO="${SCENARIO:-chaos.js}"
FAULT_SECONDS="${FAULT_SECONDS:-120}"
SETTLE_SECONDS="${SETTLE_SECONDS:-60}"
BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
READY_URL="${BASE_URL%/}/health/ready"
LIVE_URL="${BASE_URL%/}/health"

if [[ -z "${AUTH_TOKEN:-}" ]]; then
  echo "AUTH_TOKEN is required (sent as a Bearer token to readiness)." >&2
  exit 1
fi

restore() {
  if [[ -n "${chaos_started:-}" && -n "${chaos_stopped:-}" ]]; then
    return
  fi
  if [[ -n "${chaos_started:-}" ]]; then
    echo "[chaos] restoring dependency..."
    timeout 120 bash -c "$CHAOS_STOP" || true
    chaos_stopped=1
  fi
}
trap restore EXIT

k6 run --env BASE_URL="$BASE_URL" "scripts/load/$SCENARIO" &
K6_PID=$!

echo "[chaos] settling for ${SETTLE_SECONDS}s before injecting the fault."
sleep "$SETTLE_SECONDS"

echo "[chaos] injecting fault."
chaos_started=1
bash -c "$CHAOS_START"

for _ in $(seq 1 "$FAULT_SECONDS"); do
  live_status=$(curl -s -o /dev/null -w '%{http_code}' "$LIVE_URL" || true)
  ready_status=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AUTH_TOKEN" "$READY_URL" || true)
  if [[ "$live_status" != "200" ]]; then
    echo "[chaos] FAIL: liveness returned ${live_status} during the fault window" >&2
    exit 1
  fi
  if [[ "$ready_status" != "200" && "$ready_status" != "503" ]]; then
    echo "[chaos] FAIL: readiness returned ${ready_status} (expected 200 or 503)" >&2
    exit 1
  fi
  sleep 1
done

echo "[chaos] restoring dependency."
bash -c "$CHAOS_STOP"
chaos_stopped=1

echo "[chaos] waiting for k6 traffic to finish."
wait "$K6_PID"
