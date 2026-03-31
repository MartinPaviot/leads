#!/bin/bash
# LeadSens — Regression test suite
# Run after every feature pass to catch regressions

set -e

echo "=== LeadSens Regression Suite ==="
echo "Date: $(date)"
echo ""

PASS=0
FAIL=0

run_test() {
  local name="$1"
  local cmd="$2"
  echo -n "  $name... "
  if eval "$cmd" > /dev/null 2>&1; then
    echo "PASS"
    PASS=$((PASS + 1))
  else
    echo "FAIL"
    FAIL=$((FAIL + 1))
  fi
}

# --- Build checks ---
echo "[Build]"
run_test "TypeScript compiles" "pnpm tsc --noEmit"
run_test "ESLint passes" "pnpm lint"
run_test "Build succeeds" "pnpm build"

# --- Unit tests ---
echo ""
echo "[Unit Tests]"
run_test "All unit tests pass" "pnpm test"

# --- Feature regression tests (added per feature) ---
echo ""
echo "[Feature Regressions]"
# Tests will be added here as features pass evaluation
# Format: run_test "F1.1: Auth login flow" "pnpm test:e2e -- --grep 'auth'"

# --- Summary ---
echo ""
echo "=== Results ==="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
TOTAL=$((PASS + FAIL))
echo "TOTAL: $TOTAL"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "❌ REGRESSION DETECTED — $FAIL test(s) failed"
  exit 1
else
  echo ""
  echo "✅ All $TOTAL tests passed — no regressions"
  exit 0
fi
