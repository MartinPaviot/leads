#!/bin/bash
# Elevay — Full dev environment startup
# Launches: Next.js (port 3002) + Inngest Dev Server (port 8288)
#
# Usage: bash start-dev.sh
# Stop:  Ctrl+C (kills all child processes)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$SCRIPT_DIR/app/apps/web"

trap 'echo "Shutting down..."; kill 0; exit 0' INT TERM

echo "=== Elevay Dev Environment ==="
echo ""

# 1. Check prerequisites
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found"
  exit 1
fi
echo "[ok] Node.js $(node -v)"

if ! [ -f "$WEB_DIR/.env.local" ]; then
  echo "ERROR: $WEB_DIR/.env.local not found"
  exit 1
fi
echo "[ok] .env.local exists"

# 2. Start Next.js dev server
echo ""
echo "Starting Next.js on http://localhost:3000 ..."
cd "$WEB_DIR"
NODE_TLS_REJECT_UNAUTHORIZED=0 npx next dev --port 3000 &
NEXT_PID=$!

# 3. Wait for Next.js to be ready, then start Inngest
sleep 5
echo ""
echo "Starting Inngest Dev Server on http://localhost:8288 ..."
echo "  -> Watching http://localhost:3000/api/inngest for functions"
npx inngest-cli@latest dev --no-discovery -u http://localhost:3000/api/inngest &
INNGEST_PID=$!

echo ""
echo "=== All services running ==="
echo "  App:     http://localhost:3000"
echo "  Inngest: http://localhost:8288  (dashboard to see cron jobs + events)"
echo ""
echo "NEXT STEP: Open http://localhost:3000/sign-in"
echo "  -> Sign in with Google or Microsoft OAuth"
echo "  -> This triggers email + calendar sync automatically"
echo "  -> Check Inngest dashboard to see jobs executing"
echo ""
echo "Press Ctrl+C to stop all services."

wait
