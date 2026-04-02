# Category 5: Reliability & Failure Modes Audit

Audited: 2026-04-01
Auditor: CODE session (no Playwright)

---

## Summary: 4 ✅ / 8 🟡 / 11 ❌

---

### 5.1 Every API endpoint has try/catch with proper error responses
**✅** — All API routes have try/catch blocks. Error responses use generic messages (e.g., "Failed to fetch contacts") without leaking stack traces. Status codes are appropriate (400, 401, 404, 500).

---

### 5.2 Every page has error boundary
**🟡 PARTIAL** — Dashboard-level error boundary exists (`(dashboard)/error.tsx`) with error icon, message, and "Try again" button. BUT:
- ❌ No `global-error.tsx` (root-level catch-all)
- ❌ No per-page error boundaries for critical pages

---

### 5.3 Every page has loading state
**✅** — Dashboard loading skeleton exists (`(dashboard)/loading.tsx`) with shimmer animation. Multiple pages implement inline skeleton loading.

---

### 5.4 Every page has empty state with helpful CTA
**🟡 PARTIAL** — Accounts page has empty state ("No accounts" with guidance). Not verified for all pages. Likely some pages show empty tables without guidance.

---

### 5.5 Every form has validation with clear error messages
**🟡 PARTIAL** — Some routes validate input (accounts POST checks name). Many routes accept arbitrary JSON bodies without validation:
- `deals/[id]/route.ts` PUT — no validation on `stage` enum values
- `contacts/route.ts` — no POST handler visible (only GET)
- Most settings routes have basic validation

---

### 5.6 Network errors handled gracefully
**❌** — No retry logic on fetch calls. No offline detection. No optimistic updates with rollback. Failed API calls likely show silent failures or unhandled promise rejections on the client.

---

### 5.7 Inngest jobs have retry logic with exponential backoff
**🟡 PARTIAL**
- `enrichCompany`: `retries: 2` ✅
- `enrichContact`: `retries: 2` ✅
- `sendSequenceStep`: NO retries configured ❌
- `processReply`: NO retries configured ❌

Inngest defaults to 3 retries with backoff, but explicit config is missing on 2 of 4 functions.

---

### 5.8 Inngest jobs have dead letter queue
**❌** — No DLQ configured. Failed jobs after retries are lost. No `onFailure` handler on any Inngest function.

---

### 5.9 Application logging: structured, JSON, log levels
**❌** — Uses `console.error`, `console.warn`, `console.log` throughout. No structured logging library (pino, winston). No log levels. No request IDs for correlation.

---

### 5.10 Error tracking: Sentry or equivalent
**❌** — No Sentry, LogRocket, Datadog, or any error tracking service configured. Errors are only visible in server console output.

---

### 5.11 Uptime monitoring
**❌** — No external monitoring configured (no Pingdom, UptimeRobot, etc.).

---

### 5.12 Database backups
**🟡** — Supabase Pro includes daily backups and point-in-time recovery. Not verified if on Pro plan. Restore procedure not documented/tested.

---

### 5.13 Failure: Apollo API down
**🟡** — Enrich route has try/catch around Apollo call and falls through to LLM fallback. But no explicit error message to user, no retry queue.

**Evidence:** `enrich/route.ts:114-117`:
```typescript
} catch (err) {
  console.warn(`Apollo enrichment failed for ${company.domain}:`, err);
  // Fall through to LLM fallback
}
```

---

### 5.14 Failure: Claude API down
**✅** — Chat route falls back to OpenAI if `ANTHROPIC_API_KEY` is missing. But this is a config check, not a runtime fallback.

**Evidence:** `chat/route.ts:48-53`:
```typescript
const model = process.env.ANTHROPIC_API_KEY
  ? anthropic("claude-sonnet-4-20250514")
  : process.env.OPENAI_API_KEY
    ? openai("gpt-4o-mini")
    : null;
```

❌ If Claude API returns 500/timeout at runtime, there's NO automatic retry or fallback to OpenAI. This is only an env-var-based static fallback.

---

### 5.15 Failure: OpenAI API down — embeddings fail
**❌** — If OpenAI embedding API fails, `embedEntity()` throws and is caught with `.catch(console.warn)`. New contacts/companies are created WITHOUT embeddings. No queue to retry later. RAG search silently returns incomplete results.

---

### 5.16 Failure: Supabase slow/down
**❌** — No timeout configured on postgres-js connection. No retry logic. No circuit breaker. A slow Supabase response will hang the request until Next.js `maxDuration` (30s for chat, default for others).

---

### 5.17 Failure: Inngest webhook fails
**❌** — Inngest SDK handles retries for function execution. But if the `/api/inngest` endpoint itself is down, events are lost. No dead letter queue for undelivered events.

---

### 5.18 Failure: Gmail OAuth token expires
**❌** — Token stored in JWT but no refresh logic. When `googleAccessToken` expires (~1 hour), Gmail sync silently fails. No notification to user.

**Evidence:** `auth.ts:65-67` stores token but no refresh callback:
```typescript
if (account?.provider === "google") {
  token.googleAccessToken = account.access_token;
  token.googleRefreshToken = account.refresh_token;
}
```
No `async jwt()` callback that refreshes the token before expiry.

---

### 5.19 Failure: user has 0 data
**🟡** — Some pages have empty states. Not verified for all pages. Dashboard summary likely returns zeros gracefully.

---

### 5.20 Failure: user has 1 contact
**✅** — CRUD routes work with any number of records. No minimum data requirements.

---

### 5.21 Failure: user has 50,000 contacts
**❌** — Contact list hardcoded to LIMIT 200. No pagination. At 50K contacts, queries without tenant filter would return 200 random contacts from any tenant.

---

### 5.22 Kill server mid-operation — no data corruption
**🟡** — Drizzle ORM operations are atomic at the query level. Multi-step operations (enrich → embed → update) are NOT wrapped in transactions, so interruption can leave partial state. Inngest step functions provide some safety via step checkpointing.

---

### 5.23 Model fallback chain: Claude → OpenAI → graceful error
**❌** — Fallback is ENV-VAR based (static), not runtime-based. If Claude API errors at runtime, it throws — no automatic fallback to OpenAI. The fallback should be: try Claude, catch error → try OpenAI, catch error → return friendly message.
