# Elevay Production Runbook

## Deployment

### Standard Deploy (Vercel)
Merging to `main` triggers auto-deploy via Vercel. CI runs tests + type check before deploy.

### Manual Deploy
```bash
cd app/apps/web
pnpm build && pnpm start
```

### Rollback
1. Open Vercel dashboard > Deployments
2. Find the last known-good deployment
3. Click "..." > "Promote to Production"
4. Rollback completes in < 60 seconds

Alternative (git):
```bash
git revert HEAD
git push origin main
# Auto-deploys the revert
```

---

## AI Cost Controls

### Where do the Anthropic credits go? (run this first)

The real per-surface spend lives in **`agent_traces`** (the chat route + most
surfaces write here via `tracedStreamText`/`tracedGenerateObject`). The
`llm_calls` table only covers ~4 surfaces (<5% of call sites) — do NOT use it
for the breakdown.

```sql
SELECT agent_id, model, SUM(estimated_cost) AS cost, COUNT(*) AS calls
FROM agent_traces
WHERE created_at >= date_trunc('month', now())
GROUP BY agent_id, model
ORDER BY cost DESC;
-- per tenant: add  AND tenant_id = '<id>'
```

`estimated_cost` is now priced via `lib/ai/model-pricing.ts` (single source) so
Haiku/Opus are no longer mispriced as Sonnet. The true monthly total is
`SUM(agent_traces.estimated_cost) + SUM(llm_calls.cost_usd)` (disjoint ledgers).

### Emergency: spend is running away right now

1. **Global stop (seconds, no redeploy):** set `AI_DISABLED=1` in Vercel env and
   redeploy env (or set on the running deployment). `getModelForTask` returns
   null and the traced wrappers throw — every surface that handles a null model
   degrades to its heuristic fallback. Unset to resume.
2. **Stop the per-trace LLM-as-judge fan-out:** `EVAL_ONLINE_SAMPLING=0`.
3. **Kill one subsystem at a time** (default ON; set to `0`/`off`/`false`):

   | Env var | Stops |
   |---------|-------|
   | `AGENT_REACTOR_ENABLED` | event reactor (fires per CRM event) + daily sweep |
   | `COACHING_ENABLED` | pre-send + post-interaction + deal-event + weekly coaching |
   | `PLAYBOOK_EXTRACT_ENABLED` | playbook extraction on every logged interaction |
   | `MEMORY_EXTRACT_ENABLED` | chat-thread memory extraction |
   | `WORLD_MODEL_ENABLED` | nightly per-tenant world-model rebuild (cron only) |
   | `STALE_DEALS_ENABLED` | daily stale-deal revival drafts (cron only) |
   | `DEAL_PROPERTY_ENABLED` | why_now/summary synthesis on deal changes |

   The cron routes gate the scheduled GET path only — the authed POST manual
   trigger still works. Helper: `lib/config/feature-gate.ts`.

### Model tiering policy

`lib/ai/ai-provider.ts` maps task → model: **`chat` = claude-sonnet-4-6**
(generation), **`lightweight` = claude-haiku-4-5-20251001** (classification /
extraction / scoring). Rule of thumb when adding an LLM call: if the work is
NL-parse / classification / extraction / scoring, use Haiku (or
`getModelForTask("lightweight")`); reserve Sonnet for prose generation
(emails, proposals, briefings, chat). The cron cadence for the prompt-tuning
flywheel is weekly (`inngest/eval-functions.ts`), not 6-hourly.

---

## Common Issues

### Database Connection Errors

**Symptom**: `ECONNREFUSED` or `connection terminated unexpectedly`

**Diagnosis**:
```bash
# Check Supabase status
curl https://wdgwytpaxuvgigqgzxrw.supabase.co/rest/v1/ -H "apikey: <anon-key>"
```

**Fix**:
1. Check Supabase dashboard for outages
2. Verify DATABASE_URL uses the pooler endpoint (port 6543, not 5432)
3. If connection pool exhausted, restart the Vercel deployment
4. If Supabase is down, wait for recovery (data is preserved)

### Auth Errors (NextAuth)

**Symptom**: Users can't sign in, redirect loops

**Fix**:
1. Verify `AUTH_SECRET` is set in production env
2. Verify `AUTH_URL` matches the production domain (https://app.elevay.dev)
3. Check Google OAuth redirect URIs in Google Cloud Console
4. Clear cookies and retry

### Gmail OAuth Token Expired

**Symptom**: Email sync fails, "invalid_grant" errors

**Fix**:
1. User needs to re-connect Gmail in Settings
2. The refresh token may have been revoked
3. Check if Google OAuth consent screen is in "Testing" mode (limited to test users)

### Inngest Jobs Not Running

**Symptom**: Enrichment/email jobs stuck, no background processing

**Fix**:
1. Check Inngest dashboard for function status
2. Verify INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY are set
3. Check /api/inngest endpoint is accessible
4. Retry failed functions from Inngest dashboard

### EmailEngine Down

**Symptom**: Outbound emails not sending, bounce/reply webhooks not firing

**Fix**:
1. Check Docker: `docker compose ps`
2. Restart: `docker compose restart emailengine`
3. Check Redis: `docker compose exec redis redis-cli ping`
4. Verify EMAILENGINE_SECRET matches

### Stripe Webhooks Failing

**Symptom**: Subscription changes not reflected in app

**Fix**:
1. Check Stripe dashboard > Webhooks > Recent events
2. Verify STRIPE_WEBHOOK_SECRET matches the endpoint secret
3. Ensure /api/webhooks/stripe is accessible from Stripe's IPs
4. Retry failed events from Stripe dashboard

### AI/LLM Errors

**Symptom**: Chat not responding, email generation failing

**Fix**:
1. Check Anthropic status page (status.anthropic.com)
2. Check OpenAI status page (status.openai.com)
3. Verify API keys are valid and have credits
4. Check rate limits (Anthropic: 1000 RPM, OpenAI: varies by tier)

### High API Costs

**Symptom**: Unexpectedly high AI API bills

**Diagnosis**:
1. Check PostHog for AI query volume
2. Check /api/billing/usage for per-tenant usage
3. Look for runaway loops in Inngest function logs

**Fix**:
1. Token budget per request is enforced (max_tokens in AI calls)
2. Identify the tenant with excessive usage
3. Temporarily disable their AI features if needed

---

## Monitoring Checklist

| Check | How | Frequency |
|-------|-----|-----------|
| App uptime | UptimeRobot / Vercel Analytics | Continuous |
| Error rate | Sentry dashboard | Daily |
| API response times | Vercel Analytics | Weekly |
| Database size | Supabase dashboard | Weekly |
| AI API costs | Anthropic/OpenAI dashboards | Weekly |
| Stripe revenue | Stripe dashboard | Weekly |
| Email deliverability | /deliverability page + Google Postmaster | Daily |

---

## Emergency Contacts

- **Infrastructure**: Martin (founder)
- **Supabase**: support@supabase.io
- **Vercel**: support@vercel.com
- **Stripe**: dashboard.stripe.com/support
- **Anthropic**: support@anthropic.com

---

## Secret Rotation

### Rotate AUTH_SECRET
1. Generate new secret: `openssl rand -base64 32`
2. Update in Vercel env vars
3. Redeploy
4. All existing sessions will be invalidated (users must re-login)

### Rotate API Keys
1. Generate new key in provider dashboard
2. Update in Vercel env vars
3. Redeploy
4. Verify functionality

### Rotate STRIPE_WEBHOOK_SECRET
1. Create new webhook endpoint in Stripe (or rotate secret)
2. Update STRIPE_WEBHOOK_SECRET in Vercel
3. Redeploy
4. Verify webhook delivery in Stripe dashboard

---

## Database Operations

### Run Migrations
```bash
cd app/apps/web
DATABASE_URL=<production-url> pnpm drizzle-kit push
```

### Backup
Supabase handles automated daily backups. For manual backup:
```bash
pg_dump <DATABASE_URL> > backup_$(date +%Y%m%d).sql
```

### Restore
```bash
psql <DATABASE_URL> < backup_20260401.sql
```

---

## Common Incidents and Response

### 1. Anthropic API Down

**Detection**: Chat requests fail, Sentry alerts fire, `circuit-breaker.ts` logs provider failures.

**Automatic mitigation**: The circuit breaker (`src/lib/circuit-breaker.ts`) activates after consecutive failures and routes LLM calls through the OpenAI fallback provider (`src/lib/ai-provider.ts`). No manual intervention needed for continued service.

**Manual steps**:
1. Check [status.anthropic.com](https://status.anthropic.com)
2. Verify circuit breaker activated: check Sentry for `[circuit-breaker] provider switched` events
3. Monitor OpenAI costs -- fallback usage can spike the bill
4. When Anthropic recovers, the circuit breaker resets automatically after the cooldown window
5. Verify chat quality did not degrade during the fallback period (spot-check recent conversations)

### 2. Apollo API Down

**Detection**: Enrichment jobs fail, TAM builds time out, Inngest dashboard shows `enrichment-*` function failures.

**Automatic mitigation**: The Apollo client (`src/lib/apollo-client.ts`) uses the circuit breaker. Failed enrichment jobs are automatically retried by Inngest with exponential backoff.

**Manual steps**:
1. Check Apollo status page and API rate limit headers
2. If Apollo is fully down, enrichment requests queue in Inngest -- they will process when the API recovers
3. TAM builds will be incomplete until enrichment catches up -- no user-facing error, just stale data
4. If the outage exceeds 24h, consider pausing automated enrichment triggers to avoid queue buildup:
   - Inngest dashboard > Pause `enrichment-*` functions
5. When Apollo recovers, unpause functions -- the queue drains automatically

### 3. High Bounce Rate

**Detection**: The `/deliverability` page shows a warning banner when bounce rate exceeds thresholds. Resend webhook events report bounces to `/api/webhooks/resend`.

**Response**:
1. Open the deliverability dashboard (`/deliverability`) to see per-domain bounce rates
2. Check Google Postmaster Tools for domain reputation
3. Reduce outbound volume immediately: lower the sending cap in tenant settings (`sendingMailboxMode` / daily cap)
4. Review recent sequences for list quality issues (bad addresses, purchased lists)
5. The sending-identity guardrail (`src/lib/guardrails/sending-identity.ts`) enforces per-day caps -- lower `dailySendCap` in tenant settings if needed
6. If domain reputation is damaged, pause all cold outreach for 48-72h and send only warm follow-ups

### 4. User Reports Data Leak

**Detection**: User reports seeing another tenant's data, or internal audit flags cross-tenant data access.

**Response** (treat as P0):
1. Verify the claim: check the audit log for the affected user
   ```sql
   SELECT * FROM audit_log
   WHERE tenant_id = '<affected-tenant>'
   ORDER BY created_at DESC LIMIT 50;
   ```
2. Verify audit entry integrity using `verifyAuditEntry()` from `src/lib/signed-audit.ts` -- if HMAC verification fails, the row was tampered with
3. Check RLS enforcement: review `src/db/rls.ts` and verify the tenant_id filter was applied to the relevant query
4. Search Sentry for any errors around the reported time that indicate a missing `tenantId` in query context
5. If confirmed: immediately revoke the affected user's session, rotate `AUTH_SECRET`, and notify the affected tenant
6. Document the incident with timeline, root cause, and fix in a postmortem

### 5. Stripe Webhook Failure

**Detection**: Subscription changes (upgrades, cancellations, payment failures) not reflected in the app. Stripe dashboard shows webhook delivery failures.

**Response**:
1. Open Stripe dashboard > Webhooks > select the endpoint > Recent events
2. Check for HTTP errors (4xx/5xx) on the `/api/webhooks/stripe` endpoint
3. Verify `STRIPE_WEBHOOK_SECRET` in Vercel env matches the endpoint's signing secret in Stripe
4. If the endpoint was unreachable (deploy issue), retry failed events from the Stripe dashboard -- Stripe retains events for 72h
5. To resync a specific customer's subscription status:
   ```bash
   # Fetch current subscription from Stripe and compare with local DB
   curl https://api.stripe.com/v1/customers/<cus_id>/subscriptions \
     -u sk_live_...:
   ```
6. If subscriptions are out of sync, trigger a manual sync via the billing API (`/api/billing/sync`)

---

## New Engineer Onboarding Checklist

### Day 1: Access and environment

- [ ] Get added to the GitHub repo (`MartinPaviot/leads`) with write access
- [ ] Clone the repo, run `pnpm install` in `app/`, copy `.env.example` to `.env.local`
- [ ] Get development credentials from Martin: Neon DB connection string (dev branch), Anthropic API key (dev), Stripe test keys, Inngest dev key
- [ ] Run `pnpm dev` and verify the app starts on `localhost:3000`
- [ ] Run `pnpm test` and confirm all 1186 tests pass
- [ ] Run `pnpm tsc` and confirm no type errors

### Day 1: Accounts and tools

- [ ] Get access to: Vercel (deployment), Sentry (errors), Inngest (background jobs), Stripe (billing), Neon (database), PostHog (analytics)
- [ ] Install recommended VS Code extensions: ESLint, Tailwind CSS IntelliSense, Drizzle
- [ ] Set up Playwright for E2E tests: `pnpm e2e:install`

### Day 2: Codebase orientation

- [ ] Read `README.md` (repo root) for architecture overview
- [ ] Read `CLAUDE.md` for project principles and workflow
- [ ] Read `apps/web/RUNBOOK.md` (this file)
- [ ] Browse the database schema: `apps/web/src/db/schema.ts` (1632 lines -- read section headers)
- [ ] Browse the chat tools index: `apps/web/src/lib/chat/tools/index.ts` and one tool file to understand the pattern
- [ ] Read the capability resolver: `apps/web/src/lib/agents/capability-resolver.ts`
- [ ] Read the guardrails: `apps/web/src/lib/guardrails/` (3 files)

### Day 2: Ship something small

- [ ] Pick a small issue, create a `feat/` branch, implement, write tests, open a PR
- [ ] Verify CODEOWNERS triggers the right reviewer (`.github/CODEOWNERS`)
- [ ] Confirm the Vercel preview deploy works on the PR

### First week

- [ ] Understand the Inngest function lifecycle: `apps/web/src/inngest/` (31 functions)
- [ ] Run the agent eval suite: `pnpm eval:run`
- [ ] Review one existing PR to understand code review standards
- [ ] Read the admin console: `apps/admin/` (agent traces, flywheel, graph)

---

## Secret Rotation Procedures

### Overview

All secrets are stored in Vercel environment variables. After rotating any secret, redeploy the affected app. Secrets should be rotated on a quarterly schedule or immediately if compromised.

### AUTH_SECRET (Auth.js session signing)

**Impact**: All existing user sessions are invalidated. Users must re-login.
```bash
openssl rand -base64 32
```
1. Generate a new secret with the command above
2. Update `AUTH_SECRET` in Vercel > Settings > Environment Variables (Production + Preview)
3. Redeploy: Vercel dashboard > Deployments > Redeploy
4. All users will be logged out on their next request

### ELEVAY_APP_SECRET (audit HMAC + tenant encryption)

**Impact**: New audit entries use the new key. Old entries remain verifiable only if you keep the old key for verification.
```bash
openssl rand -hex 32
```
1. Generate a new secret
2. **Before updating**: note the old value -- you need it to verify historical audit entries
3. Update `ELEVAY_APP_SECRET` in Vercel
4. Redeploy
5. Run the audit verification script against recent entries to confirm the new key works for new writes
6. Store the old key securely for historical verification (consider a `ELEVAY_APP_SECRET_PREV` env var for dual-key verification)

### ANTHROPIC_API_KEY / OPENAI_API_KEY

**Impact**: Zero downtime if rotated one at a time (circuit breaker provides fallback).
1. Generate a new key in the provider dashboard (Anthropic Console / OpenAI Platform)
2. Update the key in Vercel env vars
3. Redeploy
4. Verify chat and AI features work
5. Revoke the old key in the provider dashboard

### STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET

**Impact**: Billing API calls and webhook verification. Rotate together.
1. In Stripe dashboard: roll the API key (Stripe supports key rolling with overlap period)
2. Update `STRIPE_SECRET_KEY` in Vercel
3. For webhook secret: create a new webhook endpoint secret in Stripe > Webhooks
4. Update `STRIPE_WEBHOOK_SECRET` in Vercel
5. Redeploy
6. Verify: trigger a test event in Stripe and confirm it arrives in `/api/webhooks/stripe`
7. Delete the old webhook endpoint in Stripe after confirming

### APOLLO_API_KEY

**Impact**: Enrichment and TAM builds will fail until the new key is active.
1. Generate a new key in Apollo.io settings
2. Update `APOLLO_API_KEY` in Vercel
3. Redeploy
4. Trigger a test enrichment to verify

### INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY

**Impact**: Background jobs stop processing until redeployed with new keys.
1. Rotate keys in the Inngest dashboard
2. Update both `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in Vercel
3. Redeploy
4. Check Inngest dashboard to verify functions are receiving events

### RESEND_API_KEY + RESEND_WEBHOOK_SECRET

**Impact**: Transactional emails (invites, notifications) stop sending.
1. Generate a new API key in Resend dashboard
2. Update `RESEND_API_KEY` in Vercel
3. If rotating webhook secret: update the endpoint in Resend > Webhooks, then update `RESEND_WEBHOOK_SECRET`
4. Redeploy
5. Send a test invite email to verify

### RECALL_API_KEY

**Impact**: Meeting bot will not auto-join calls.
1. Generate a new key in the Recall.ai dashboard
2. Update `RECALL_API_KEY` in Vercel
3. Redeploy
4. Schedule a test meeting to verify the bot joins

### DATABASE_URL

**Impact**: Full app outage during rotation. Plan for maintenance window.
1. Create a new Neon branch or update the database password in Neon console
2. Update `DATABASE_URL` in Vercel
3. Redeploy immediately
4. Verify database connectivity and run a smoke test

### Google/Microsoft OAuth Credentials

**Impact**: New logins via the rotated provider will fail until redeployed.
1. Generate new client secret in Google Cloud Console / Microsoft Entra
2. Update `GOOGLE_CLIENT_SECRET` or `MICROSOFT_CLIENT_SECRET` in Vercel
3. Redeploy
4. Test sign-in flow with the affected provider
5. Revoke the old secret in the provider console
