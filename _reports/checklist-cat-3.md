# Category 3: Auth & Security Audit

Audited: 2026-04-01 | Fixed: 2026-04-01
Auditor: CODE session

---

## Summary: 12 ✅ / 5 🟡 / 4 ❌

---

### 3.1 Authentication works with real accounts
**✅ FIXED** — Credentials provider now validates bcrypt password hash against stored hash in auth_account table. Google OAuth verified working.

### 3.2 Passwords hashed with bcrypt/argon2
**✅ FIXED** — bcryptjs used for password comparison. Hash stored in auth_account.access_token for credentials provider.

### 3.3 Session tokens secure (HttpOnly, Secure, SameSite)
**🟡** — NextAuth defaults set HttpOnly + SameSite=Lax. AUTH_SECRET needs rotation for production (currently weak static string).

### 3.4 CSRF protection on state-changing endpoints
**🟡** — JWT strategy with SameSite=Lax provides protection against simple CSRF. No explicit CSRF token middleware.

### 3.5 Rate limiting on auth endpoints
**❌** — No rate limiting. Needs middleware (e.g., next-rate-limit or Vercel Edge Config).

### 3.6 Rate limiting on all API endpoints
**❌** — No rate limiting. Flagged as ocean — requires middleware infrastructure.

### 3.7 SQL injection: all queries parameterized
**✅** — Drizzle ORM parameterizes all queries. postgres-js tagged templates also safe. Verified with edge case test.

### 3.8 XSS: input sanitized, CSP header set
**✅ FIXED** — Content-Security-Policy header added via next.config.ts. X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy all set.

### 3.9 API routes all check authentication
**✅** — All 55+ routes call getAuthContext() and return 401 if null. Verified.

### 3.10 Multi-tenant isolation
**✅ FIXED** — All SELECT/UPDATE/DELETE queries now filter by eq(table.tenantId, authCtx.tenantId). All INSERTs use authCtx.tenantId. Hardcoded "default" eliminated from all routes.

### 3.11 RLS enforced in Supabase
**❌** — RLS still disabled at DB level. Application-level tenant isolation now enforced. DB-level RLS is defense-in-depth — flagged for future.

### 3.12 API keys not in source code
**✅** — All in .env.local, .gitignore verified.

### 3.13 .env files in .gitignore
**✅** — Verified. No env files in git history.

### 3.14 OAuth tokens stored securely, refreshed before expiry
**✅ FIXED** — Google OAuth token refresh added to JWT callback. Refreshes 5 minutes before expiry using refresh_token grant.

### 3.15 Dependency audit: no critical/high
**🟡** — 1 moderate (esbuild, dev-only via drizzle-kit). No critical/high.

### 3.16 HTTPS enforced
**✅** — Supabase + Vercel enforce HTTPS.

### 3.17 File upload validation
**❌** — Import route has 10K row limit but no file size limit. Needs Content-Length check.

### 3.18 Error messages don't leak internals
**🟡** — API responses are generic. console.error goes to server logs only.

### 3.19 Prompt injection testing
**🟡** — Contact names stored as-is and used in LLM prompts. Edge case test confirms storage works. LLM prompt hardening is a separate task.

### 3.20 XSS via contact name
**✅** — React escapes JSX by default. CSP header blocks inline scripts. Edge case test confirms XSS payload stored safely.

### 3.21 IDOR testing
**✅ FIXED** — All [id] routes now filter by both id AND tenantId. User A cannot access User B's records.

### Webhook security
**✅ FIXED** — EmailEngine webhook now validates HMAC-SHA256 signatures. Rejects unsigned requests in production.
