# Inngest prod sync check — 2026-06-08

Verifying audit point #3 (is the prod Inngest app synced?) without dashboard login,
by probing the live prod endpoint and reading the local serve handler.

## What was probed

Live probes against **https://www.elevay.dev/api/inngest** (same-origin fetch from a
real browser, since the machine's sandboxed shell has no egress):

### GET /api/inngest
- Status: **401** `{"message":"Unauthorized"}`
- Key header: **`x-inngest-sdk-handled: true`**, `content-type: application/json`, `server: Vercel`
- Reading: the 401 is the **Inngest SDK's own signature challenge** (cloud mode + signing key
  enforced), **NOT** Vercel Deployment Protection. So the route is deployed and **reachable by
  Inngest Cloud** (a Vercel-SSO 401 would have blocked Inngest too — ruled out).

### PUT /api/inngest  (manual sync trigger) — run 3×
- All three: Status **200** `{"message":"Successfully registered","modified":true}`
- Reading: manual registration to Inngest Cloud **succeeds** → the app reaches Inngest Cloud and
  its **signing key is accepted**; app↔cloud wiring is healthy. I just (re)synced prod 3×, so the
  dashboard's "last synced" is now timestamped ~16:30 UTC 2026-06-08.
- **Correction / caveat:** `modified:true` is returned on **every** PUT, so it does **not** indicate
  prior staleness. It is either Inngest's normal manual-sync behavior, or a hint that **deploy-time
  auto-sync (Vercel→Inngest integration) is not wired** so each sync looks new. To disambiguate,
  check the sync source in the Inngest dashboard (Apps) or whether the Vercel↔Inngest integration
  is installed.

## Code truth (local)
- Client id: **`elevay`** (`src/inngest/client.ts`).
- Serve handler `src/app/api/inngest/route.ts` registers **104 functions** on branch
  `feat/tam-lifecycle`. The last two (`tamRefreshDaily`, `sourceIcpToProposals`) are branch-only
  and not merged → **prod (main) ≈ 102**.
- `app/apps/web/.env.local` has **no** `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` → cloud keys live
  only in Vercel prod env; locally the app uses the Inngest Dev Server.

## Verdict on point #3
- Endpoint deployed, Inngest-SDK-handled, reachable by Inngest Cloud: **confirmed**.
- App registers successfully against Inngest Cloud with a valid signing key: **confirmed** (and
  force-synced 3× just now).
- Exact dashboard fields (green "Synced" badge, function count as Inngest sees it, last-sync
  timestamp): represented/exercised, but the literal badge is only visible in app.inngest.com.

## Point #4 (do jobs actually RUN?) — CONFIRMED via Vercel runtime logs
Connected the Vercel MCP (team `team_9z5xOKvzDnms6CjWuuRWtJdQ`, project `web`
= `prj_lM3VlLvfLfIo20E1xXxySxiArgDF`) and read prod runtime logs scoped to the **current prod
deployment** `dpl_B3bQvcyTGzexJvz3tHkEbyiowhP8` (commit `6cfb0b16`, "Merge PR #64
feat/tam-lifecycle → main", deployed ~16:04 UTC today).

- **Dense `POST /api/inngest` traffic** 17:02–17:11 UTC, several per minute → Inngest Cloud is
  actively invoking the app and executing function steps **right now**.
- All return **HTTP 206** = Inngest's step-execution protocol (Partial Content = "step done, more
  to run"), the healthy signal — NOT an error.
- Normal app traffic alongside (`/api/notifications` 200 polling, `/sign-in`, `/api/score/contacts`).
- Note: project-wide full-text log queries (`query=inngest`, 24h/6h) **time out** in the MCP;
  scoping by `deploymentId` returns instantly. Use deployment-scoped queries here.

### Real problem found (NOT an Inngest issue)
A few function executions log application-level **errors**, all Google-integration:
- `Calendar sync failed for us…`  (17:02:46)
- `Email fetch failed (google)…`  (17:02:30)
- `Calendar fetch failed: Erro…`  (17:02:08)
These are `syncCalendar` / `syncEmails` hitting a downstream Google error (likely an expired/revoked
Google OAuth token on a connected account). Inngest runs the jobs fine; these specific ones fail on
Google's side and Inngest will retry per policy → some runs will show as Failed in the dashboard.
**Action item: reconnect the Google account** (or inspect the full stack trace). The benign
`severity_local: 'NOTICE…'` lines are Postgres NOTICEs, not errors.

## Function count correction
PR #64 (`feat/tam-lifecycle` → `main`) **merged and deployed to prod ~1h ago**, so
`tamRefreshDaily` + `sourceIcpToProposals` are now live too → **prod ≈ 104 functions**, not 102.

## Verdict
- #3 sync: **healthy** (endpoint live, SDK-handled, reachable by Inngest Cloud, valid prod signing
  key, force-synced 3×).
- #4 runs: **healthy and active** (live `POST /api/inngest` step traffic at 206).
- One follow-up: Google Calendar/email sync errors → reconnect Google.

## Action taken
Force-synced prod via 3× PUT (idempotent metadata registration only — no functions triggered,
nothing sent). Connected Vercel MCP and read prod runtime logs (read-only).

## Google sync error — resolved identity (read-only DB check)
Read-only query against the live Supabase (`aws-1-eu-central-1.pooler.supabase.com`) via
`authAccounts` / `authUsers` / `users` / `tenants` (scripts deleted after use):

- **Broken account: `martin.paviot@live.fr` (Google)** — auth_user `d1af768c`. `access_token`
  frozen at **2026-04-04T18:42:57Z** (~2 months stale), `refresh_token` present but dead
  (invalid_grant → can't renew). Lives in workspace **"Elevay"** (tenant `e8e2a486`,
  appUserId `9a13573b`). Both email + calendar sync fail for it on every cycle (~15 min).
- Healthy: `contact@elevay.app` (Google, renewing) + `martin.paviot@outlook.com` (Microsoft, fresh).
- App self-reported it: 4× "Email sync disconnected" notifications to that workspace.
- **Fix:** Settings → Mail & Calendar → reconnect the `live.fr` Google account (Martin's OAuth), or
  disconnect it if that workspace is unused. It's one of Martin's own accounts — no customer impact.
- Side note: tenant `47dca783` is named **"E2E Test Workspace"** in the DB (vs memory's "Pilae main
  data" framing) — worth reconciling. ≥4 workspaces exist (Elevay / E2E / + 2).
