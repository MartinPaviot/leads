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
check "TypeScript compiles" "(cd app/apps/web && npx tsc --noEmit 2>&1)"

# --- API checks (requires running server) ---
# These are run during evaluation with Playwright, not here
# Placeholder for future curl-based smoke tests

# --- Unit tests ---
echo ""
echo "[Unit Tests]"
check "Vitest suite" "(cd app/apps/web && npx vitest run --config vitest.config.ts 2>&1)"

# --- CLE-16 guards: frozen cores unmodified + loop wiring present ---
echo ""
echo "[CLE-16 guards]"
# decideAction body + CLE-11 audit/undo + capture + getTrustScore are FROZEN.
# CLE-16 leaves its changes unstaged for review, so `git diff HEAD` captures them.
check "decide-action.ts unmodified" "test -z \"\$(git diff HEAD -- app/apps/web/src/lib/guardrails/decide-action.ts)\""
check "tool-call-log.ts unmodified" "test -z \"\$(git diff HEAD -- app/apps/web/src/lib/chat/tool-call-log.ts)\""
check "chat undo.ts unmodified" "test -z \"\$(git diff HEAD -- app/apps/web/src/lib/chat/tools/undo.ts)\""
check "capture/approval.ts unmodified" "test -z \"\$(git diff HEAD -- app/apps/web/src/lib/capture/approval.ts)\""
check "campaign trust-score.ts unmodified" "test -z \"\$(git diff HEAD -- app/apps/web/src/lib/campaign-engine/trust-score.ts)\""
# The background loops must build the injected map via buildEffectiveThresholdMap
# (so excluded classes are ceiling-forced even in background).
check "agent-reactor uses buildEffectiveThresholdMap" "grep -q buildEffectiveThresholdMap app/apps/web/src/inngest/agent-reactor.ts"
check "autonomous-pipeline uses buildEffectiveThresholdMap" "grep -q buildEffectiveThresholdMap app/apps/web/src/inngest/autonomous-pipeline.ts"
# learned-trust never WRITES the CLE-11 tables (read-only consumption, AC-24).
check "learned-trust does not write tool_call_events/outbound_emails" "! grep -E 'db\\.(insert|update)\\((toolCallEvents|outboundEmails)' app/apps/web/src/lib/guardrails/learned-trust.ts"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ $FAIL -gt 0 ]; then
  echo -e "\nFailures:$ERRORS"
  exit 1
fi
exit 0
