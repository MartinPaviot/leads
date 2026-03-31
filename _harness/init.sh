#!/bin/bash
# LeadSens — Project initialization script
# Run from project root after cloning

set -e

echo "=== LeadSens Init ==="

# 1. Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "ERROR: Node.js 20+ required. Current: $(node -v)"
  exit 1
fi
echo "✓ Node.js $(node -v)"

# 2. Install dependencies
echo "Installing dependencies..."
pnpm install
echo "✓ Dependencies installed"

# 3. Check required env vars
if [ ! -f ".env.local" ]; then
  echo "Creating .env.local template..."
  cat > .env.local << 'ENVEOF'
# Database
DATABASE_URL=

# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# LLM
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Email
RESEND_API_KEY=

# Queue (Redis)
REDIS_URL=

# Embedding
OPENAI_API_KEY=
ENVEOF
  echo "⚠ Fill in .env.local before running the app"
else
  echo "✓ .env.local exists"
fi

# 4. Run database migrations
echo "Running migrations..."
pnpm db:migrate
echo "✓ Database migrated"

# 5. Verify
echo ""
echo "=== Init Complete ==="
echo "Run: pnpm dev"
