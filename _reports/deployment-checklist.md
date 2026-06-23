# LeadSens Deployment Checklist — Vercel

Generated: 2026-04-02

---

## 1. Pre-Deployment: Config Changes Made

- [x] Removed `output: "standalone"` from `next.config.ts` (not needed for Vercel, causes issues)
- [x] Added `outputFileTracingRoot` to `next.config.ts` (fixes multi-lockfile workspace root warning)
- [x] Updated `vercel.json` with cron job definitions for 3 cron routes
- [x] Security headers configured in both `next.config.ts` (CSP, HSTS) and `vercel.json` (X-Frame, etc.)

---

## 2. Create Vercel Project

1. Go to https://vercel.com/new
2. Import the Git repository: `marti/leads` (or wherever the repo is hosted)
3. **CRITICAL** — Set **Root Directory** to: `apps/web`
4. Framework Preset: **Next.js** (auto-detected)
5. Build Command: leave as default (`next build`) — Vercel handles Turborepo automatically
6. Output Directory: leave as default (`.next`)
7. Install Command: leave as default — Vercel auto-detects pnpm from `packageManager` field
8. Node.js version: **20.x** (recommended for Next.js 15)

---

## 3. Environment Variables (Set in Vercel Dashboard)

### Required (app will not start without these)

| Variable | Description | Example / Notes |
|---|---|---|
| `AUTH_SECRET` | Auth.js v5 signing secret | Generate with `npx auth secret` — **DO NOT reuse the dev value** |
| `AUTH_URL` | Canonical app URL | `https://your-domain.vercel.app` (or custom domain) |
| `DATABASE_URL` | PostgreSQL connection string (Supabase) | `postgresql://postgres.xxx:password@pooler.supabase.com:6543/postgres` |
| `ANTHROPIC_API_KEY` | Claude API key (primary LLM) | `sk-ant-api03-...` |

### Required for Core Features

| Variable | Description | Feature |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key (embeddings, fallback LLM) | Embeddings, email summarization, TAM analysis |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Google sign-in, Gmail sync, Calendar sync |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Google sign-in, Gmail sync, Calendar sync |
| `RESEND_API_KEY` | Resend email service key | Email sending, notifications |
| `APOLLO_API_KEY` | Apollo.io API key | Contact/company enrichment, TAM search |

### Required for Microsoft Integration

| Variable | Description | Feature |
|---|---|---|
| `MICROSOFT_CLIENT_ID` | Microsoft Entra ID client ID | Microsoft sign-in, Outlook sync |
| `MICROSOFT_CLIENT_SECRET` | Microsoft Entra ID client secret | Microsoft sign-in, Outlook sync |

### Required for Billing

| Variable | Description | Feature |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key | Billing, subscriptions |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | Webhook verification |
| `STRIPE_STARTER_PRICE_ID` | Stripe price ID for Starter plan | Checkout |
| `STRIPE_PRO_PRICE_ID` | Stripe price ID for Pro plan | Checkout |
| `NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID` | Client-side Starter price ID | Pricing page |
| `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` | Client-side Pro price ID | Pricing page |

### Required for Background Jobs

| Variable | Description | Feature |
|---|---|---|
| `INNGEST_EVENT_KEY` | Inngest event key | Background job triggering |
| `INNGEST_SIGNING_KEY` | Inngest signing key | Webhook verification |

### Required for Cron Jobs (auto-set by Vercel)

| Variable | Description | Feature |
|---|---|---|
| `CRON_SECRET` | Vercel auto-generates this | Cron endpoint protection |

### Optional

| Variable | Description | Feature |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Public app URL (default: `https://app.elevay.dev`) | Sitemap, billing redirect URLs |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics key | Product analytics |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host (default: `https://us.i.posthog.com`) | Product analytics |
| `EMAILENGINE_URL` | EmailEngine instance URL | Advanced email sync |
| `EMAILENGINE_WEBHOOK_SECRET` | EmailEngine webhook secret | Webhook verification |
| `REDIS_URL` | Redis/Upstash connection string | Queue, reply detection |
| `RECALL_API_KEY` | Recall.ai API key | Meeting recording/transcription |
| `SLACK_BOT_TOKEN` | Slack bot token | Slack integration |

### IMPORTANT: `NEXT_PUBLIC_` Variables

Variables prefixed with `NEXT_PUBLIC_` are embedded at **build time**, not runtime.
If you change them, you must **redeploy** for changes to take effect.

---

## 4. OAuth Redirect URIs

After deploying, update OAuth redirect URIs in provider consoles:

### Google Cloud Console
- Go to: https://console.cloud.google.com/apis/credentials
- Edit the OAuth 2.0 Client ID
- Add Authorized redirect URI: `https://<your-vercel-domain>/api/auth/callback/google`

### Microsoft Entra ID (Azure Portal)
- Go to: https://portal.azure.com → App registrations
- Edit the LeadSens app
- Add redirect URI: `https://<your-vercel-domain>/api/auth/callback/microsoft-entra-id`

---

## 5. Stripe Webhooks

1. Go to: https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://<your-vercel-domain>/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` env var

---

## 6. Inngest Setup

1. Sign up at https://www.inngest.com/
2. Create a new app, get Event Key and Signing Key
3. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in Vercel
4. After first deploy, Inngest auto-discovers functions via `/api/inngest`
5. Verify all 13 functions appear in Inngest dashboard:
   - enrichCompany, enrichContact, sendSequenceStep, processReply
   - syncEmails, syncCalendar, onGoogleOAuthConnected, cronSyncEmails
   - aiAutoFill, executeWorkflow
   - cronCalendarSync, autoMeetingPrep, generateMeetingPrep

---

## 7. Database Setup

The app uses Supabase PostgreSQL. Ensure:
1. The database is accessible from Vercel's IP ranges (Supabase handles this by default)
2. Connection pooling is enabled (the current URL uses Supabase's transaction pooler on port 6543)
3. Run migrations if needed: `pnpm drizzle-kit push` from `apps/web/`
4. Ensure the `pgvector` extension is enabled in Supabase for embedding search

---

## 8. Vercel Cron Jobs

The `vercel.json` defines 3 cron jobs (requires Vercel Pro plan for custom schedules):

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/email-sync` | Every 15 minutes | Sync emails from connected mailboxes |
| `/api/cron/stale-deals` | Daily at 8 AM UTC | Flag stale deals |
| `/api/cron/world-model` | Daily at 2 AM UTC | Rebuild world model / AI analysis |

**Note:** Vercel Hobby plan only supports daily crons. The 15-minute email sync
requires Vercel Pro ($20/mo) or you can use Inngest's cron scheduling instead.

Vercel automatically sets `CRON_SECRET` and sends it as an `Authorization: Bearer <secret>`
header. The cron routes already validate this in production.

---

## 9. Deployment Blockers — Resolved

### EPERM Symlink Error on Windows
- **Status:** Not a Vercel blocker. This only affects local Windows builds.
- Vercel builds on Linux where symlinks work normally.
- The `output: "standalone"` removal also eliminates the symlink creation step.

### Hardcoded localhost URLs
- **Status:** Safe. Only found in:
  - Test files (`__tests__/`) — not deployed
  - Fallback defaults with env var overrides (e.g., `process.env.EMAILENGINE_URL || "http://localhost:3100"`)
  - `process.env.REDIS_URL || "redis://localhost:6379"` — set env var in production
  - `new URL(req.url, "http://localhost")` in knowledge route — only used for URL parsing, host is ignored

### Multiple Lockfiles Warning
- **Status:** Fixed by adding `outputFileTracingRoot` to `next.config.ts`

---

## 10. Post-Deployment Verification

After first deploy, verify these in order:

### Basic Health
- [ ] Visit `https://<domain>/` — should show landing page
- [ ] Visit `https://<domain>/api/health` — should return 200
- [ ] Visit `https://<domain>/sign-in` — should show sign-in page
- [ ] Check response headers include security headers (CSP, X-Frame-Options, etc.)

### Authentication
- [ ] Sign up with email/password
- [ ] Sign in with email/password
- [ ] Sign in with Google OAuth (if configured)
- [ ] Sign in with Microsoft OAuth (if configured)
- [ ] Verify JWT session works (navigate to dashboard after sign-in)

### Core Features
- [ ] Dashboard loads with real data from Supabase
- [ ] Chat (AI) works — sends message and gets response
- [ ] Contacts page loads
- [ ] Accounts page loads
- [ ] Opportunities page loads

### Background Jobs
- [ ] Visit `https://<domain>/api/inngest` — should return Inngest introspection
- [ ] Verify Inngest dashboard shows connected functions
- [ ] Trigger a test enrichment and verify it processes

### Cron Jobs
- [ ] Check Vercel dashboard > Cron Jobs tab — should show 3 jobs
- [ ] Wait for first cron execution and verify logs

### Billing (if Stripe configured)
- [ ] Visit pricing page — plans should show correct prices
- [ ] Test checkout flow with Stripe test mode
- [ ] Verify webhook delivery in Stripe dashboard

---

## 11. Custom Domain (Optional)

1. In Vercel project settings > Domains
2. Add your domain (e.g., `app.leadsens.com` or `app.elevay.dev`)
3. Update DNS records as instructed by Vercel
4. Update `AUTH_URL` env var to the new domain
5. Update `NEXT_PUBLIC_APP_URL` env var and redeploy
6. Update OAuth redirect URIs in Google/Microsoft consoles
7. Update Stripe webhook endpoint URL

---

## 12. Quick Deploy Commands

```bash
# First time: install Vercel CLI
npm i -g vercel

# Link to Vercel project (run from app/ directory)
cd C:/Users/marti/leads/app
vercel link

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# Or just push to main branch — Vercel auto-deploys from Git
```

---

## 13. Environment Variable Template for Copy-Paste

```
AUTH_SECRET=<generate-new-secret>
AUTH_URL=https://<your-domain>
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres
ANTHROPIC_API_KEY=<your-key>
OPENAI_API_KEY=<your-key>
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
RESEND_API_KEY=<your-key>
APOLLO_API_KEY=<your-key>
INNGEST_EVENT_KEY=<from-inngest-dashboard>
INNGEST_SIGNING_KEY=<from-inngest-dashboard>
STRIPE_SECRET_KEY=<your-key>
STRIPE_WEBHOOK_SECRET=<from-stripe-dashboard>
STRIPE_STARTER_PRICE_ID=<your-price-id>
STRIPE_PRO_PRICE_ID=<your-price-id>
NEXT_PUBLIC_APP_URL=https://<your-domain>
NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID=<your-price-id>
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=<your-price-id>
```
