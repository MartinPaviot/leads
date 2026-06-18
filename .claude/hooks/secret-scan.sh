#!/bin/bash
# PreToolUse hook (matcher: Bash) — secret guard, gstack-style redaction guard.
# Fires before every Bash tool call but does real work ONLY for `git commit` / `git push`.
# Scans the ADDED lines about to enter history for high-confidence credential shapes.
# Exit 0 = allow. Exit 2 = block and tell Claude what matched.
#
# This is a guardrail, not airtight: a guard for the common "oops, committed a key"
# mistake. Narrow, high-confidence patterns only → near-zero false positives.
# Works with or without jq (jq -> python -> node -> sed fallback for JSON parsing).

RAW=$(cat)
[[ -z "${RAW//[[:space:]]/}" ]] && exit 0

# Fast path: skip the vast majority of Bash calls with zero parsing cost.
echo "$RAW" | grep -qiE 'commit|push' || exit 0

# --- extract .tool_input.command, jq-optional ---
get_command() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$RAW" | jq -r '.tool_input.command // empty' 2>/dev/null && return
  fi
  if command -v python >/dev/null 2>&1; then
    printf '%s' "$RAW" | python -c 'import sys,json;print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null && return
  fi
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$RAW" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null && return
  fi
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$RAW" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command||"")}catch(e){}})' 2>/dev/null && return
  fi
  # Last resort: crude extraction of the "command" field value.
  printf '%s' "$RAW" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' | head -1
}

CMD=$(get_command)
# If we could not parse a command, fall back to scanning the raw payload.
[[ -z "$CMD" ]] && CMD="$RAW"

is_commit=0; is_push=0
echo "$CMD" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*commit([[:space:]]|$)' && is_commit=1
echo "$CMD" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+(-[^[:space:]]+[[:space:]]+)*push([[:space:]]|$)'   && is_push=1
[[ $is_commit -eq 0 && $is_push -eq 0 ]] && exit 0

REPO="${CLAUDE_PROJECT_DIR:-$PWD}"

# Content to scan: the command string (catches secrets in a -m message) + only the
# ADDED lines (prefix '+') of what is about to enter history.
collect() {
  echo "$CMD"
  if [[ $is_commit -eq 1 ]]; then
    git -C "$REPO" diff --cached 2>/dev/null | grep '^+' | grep -v '^+++'
  fi
  if [[ $is_push -eq 1 ]] && git -C "$REPO" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    git -C "$REPO" diff '@{u}..HEAD' 2>/dev/null | grep '^+' | grep -v '^+++'
  fi
}

CONTENT=$(collect)
[[ -z "${CONTENT//[[:space:]]/}" ]] && exit 0

# High-confidence credential patterns (label|regex).
PATTERNS=(
  "Private key block|-----BEGIN [A-Z ]*PRIVATE KEY-----"
  "Anthropic API key|sk-ant-[A-Za-z0-9_-]{20,}"
  "OpenAI API key|sk-[A-Za-z0-9]{32,}"
  "AWS access key id|AKIA[0-9A-Z]{16}"
  "GitHub token|gh[pousr]_[A-Za-z0-9]{36,}"
  "GitHub fine-grained PAT|github_pat_[A-Za-z0-9_]{50,}"
  "Slack token|xox[baprs]-[A-Za-z0-9-]{10,}"
  "Google API key|AIza[0-9A-Za-z_-]{35}"
  "Stripe live secret key|sk_live_[A-Za-z0-9]{20,}"
)

HITS=""
for entry in "${PATTERNS[@]}"; do
  label="${entry%%|*}"
  regex="${entry#*|}"
  if echo "$CONTENT" | grep -qE -- "$regex"; then
    HITS="${HITS}  • ${label}\n"
  fi
done

[[ -z "$HITS" ]] && exit 0

{
  echo "[secret-scan] BLOCKED: a high-confidence secret is about to enter git history."
  echo ""
  echo "Matched:"
  printf "%b" "$HITS"
  echo ""
  echo "Do NOT bypass silently. Instead:"
  echo "  1. Investigate: run 'git diff --cached' (or '@{u}..HEAD') and find the secret."
  echo "  2. Remove it — move the value to an env var / .env (gitignored), not the repo."
  echo "  3. If it is a false positive (placeholder/test fixture), tell the user and ask"
  echo "     them to confirm the exception before retrying the commit/push."
} >&2

exit 2
