# Escalations

## 1. Email Sync (F2.1) — BLOCKED
**Date**: 2026-03-31
**Blocker**: Google/Microsoft OAuth credentials require manual browser interaction with a real email account
**Impact**: F2.1 Email sync, F2.2 Calendar sync, F2.3 Meeting recorder
**Workaround**: Skip to F2.8 (CSV import) and F2.7 (NL queries) — these provide data without email integration
**Resolution needed**: Martin creates Google Cloud project + OAuth credentials, or provides a Google account for automated setup

## 3. LLM API Key (F2.7, F1.4) — BLOCKED
**Date**: 2026-03-31
**Blocker**: No ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.local
**Impact**: Chat returns mock responses only, NL queries with citations cannot work, email drafting is dummy
**Workaround**: Mock responses demonstrate the UI flow. Real AI requires a key.
**Resolution needed**: Martin adds ANTHROPIC_API_KEY to app/apps/web/.env.local

## 2. Clerk Signup (F1.1) — RESOLVED
**Date**: 2026-03-31
**Blocker**: Cloudflare Turnstile blocked automated Clerk signup
**Resolution**: Switched to Auth.js v5 with credentials provider
