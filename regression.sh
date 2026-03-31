#!/bin/bash
# LeadSens Regression Test Suite
# Run: bash regression.sh
# Exit code: 0 = all pass, 1 = failures

set -e
cd "$(dirname "$0")"

PASS=0
FAIL=0
ERRORS=""

check() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    PASS=$((PASS + 1))
    echo "  PASS: $name"
  else
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n  FAIL: $name"
    echo "  FAIL: $name"
  fi
}

echo "=== LeadSens Regression Tests ==="
echo ""

# --- Build check ---
echo "[Build]"
check "TypeScript compiles" "cd app/apps/web && npx tsc --noEmit 2>&1"

# --- API checks (requires running server) ---
# These are run during evaluation with Playwright, not here
# Placeholder for future curl-based smoke tests

# --- Unit tests ---
echo ""
echo "[Unit Tests]"
check "Vitest suite" "cd app/apps/web && npx vitest run 2>&1"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ $FAIL -gt 0 ]; then
  echo -e "\nFailures:$ERRORS"
  exit 1
fi
exit 0
