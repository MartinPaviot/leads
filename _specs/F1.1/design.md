# F1.1: Authentication — Design

## System Fit
Auth is the entry point. Everything depends on it. Uses Clerk for managed auth — handles Google/Microsoft OAuth, magic links, session management, user management out of the box.

## Technology
- **Clerk** (@clerk/nextjs) — managed auth provider
- **Middleware**: Clerk middleware protects all routes except /sign-in, /sign-up, /api/webhooks
- **Webhook**: Clerk → our API for user creation sync to database

## Data Model
```sql
-- Users table synced from Clerk via webhook
CREATE TABLE users (
  id TEXT PRIMARY KEY, -- Clerk user ID
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Contracts
- `GET /api/auth/user` — returns current user from Clerk session
- `POST /api/webhooks/clerk` — Clerk webhook for user.created, user.updated events

## Data Flow
1. User visits app → Clerk middleware checks session
2. No session → redirect to /sign-in (Clerk hosted or embedded)
3. User authenticates via Google/Microsoft/magic link
4. Clerk creates user, fires webhook
5. Webhook creates user record in our database
6. User redirected to /onboarding or /dashboard

## Security
- All auth handled by Clerk (SOC 2 compliant)
- Session tokens are httpOnly, secure, sameSite=strict
- Webhook verified with Clerk signing secret
- No passwords stored — OAuth and magic links only
