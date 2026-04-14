# Production setup checklist — post-Kiro bugfix series

After the 12 BUGFIX commits between `b721e22` and `01263d2`, the code expects
a few new pieces of infrastructure to be wired up. None of these were needed
before because the affected code paths were either silently broken or
unreachable.

## 1. Environment variables

Add to your production `.env` (and to whatever secret store you use):

| Var | Purpose | Required for | Notes |
|---|---|---|---|
| `AUTH_SECRET` | HMAC key for unsubscribe tokens | `/api/unsubscribe`, `lib/unsubscribe-token` | Was probably already set for NextAuth; the unsubscribe tokens reuse the same secret. **Do not rotate without an email send freeze** — every outstanding outreach email carries a token signed with this secret. |
| `RESEND_WEBHOOK_SECRET` | Svix signature verification on `/api/webhooks/resend` | BUGFIX-07 | Get from Resend → Webhooks → your endpoint → "Signing Secret". Format `whsec_<base64>`. **In dev, leave unset** to skip verification (so curl works). In prod, the route returns 401 if missing-signature/missing-secret. |
| `EMAILENGINE_WEBHOOK_SECRET` | HMAC verification on `/api/webhooks/emailengine` | Pre-existing | Already needed before; double-check it's set. |
| `RESEND_API_KEY` | Email sending (sequences, invites) | Pre-existing | — |
| `INVITE_FROM_ADDRESS` | From address on `/api/settings/members/invite` emails | BUGFIX-02 | Optional. Defaults to `Elevay <invites@resend.dev>` — fine for testing but **must be set to a verified domain** before going live. |
| `NEXT_PUBLIC_APP_URL` | Used to build absolute URLs in emails (unsubscribe, accept-invite, tracking pixel, click redirects) | Pre-existing | Should be `https://app.elevay.com` in prod. Defaults to that string in code as a fallback, so missing the var won't break — but make it explicit. |

## 2. Database migration

BUGFIX-02 added one new table. Apply migration `0008_silky_rhodey.sql`:

```bash
cd app/apps/web
pnpm drizzle-kit push   # OR: psql $DATABASE_URL -f drizzle/0008_silky_rhodey.sql
```

The migration creates `pending_invites` with two indexes
(`pending_invites_tenant_status_idx`, `pending_invites_email_idx`) and three
FKs (`tenant_id`, `invited_by_user_id`, `accepted_by_user_id`). Verify with
`\d pending_invites` in psql.

## 3. Resend dashboard — webhook endpoint

Resend → Webhooks → **Add Endpoint**:

- **URL:** `https://app.elevay.com/api/webhooks/resend`
- **Events:** `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`
- Copy the **Signing Secret** to `RESEND_WEBHOOK_SECRET`.

Validation curl (replace the secret + the test payload):

```bash
SECRET="whsec_..."
BODY='{"type":"email.opened","data":{"email_id":"some-uuid"}}'
ID="msg_$(date +%s)"
TS=$(date +%s)
SIG=$(printf "$ID.$TS.$BODY" | openssl dgst -sha256 -hmac "$(echo "${SECRET#whsec_}" | base64 -d)" -binary | base64)
curl -i https://app.elevay.com/api/webhooks/resend \
  -H "svix-id: $ID" -H "svix-timestamp: $TS" -H "svix-signature: v1,$SIG" \
  -H "Content-Type: application/json" -d "$BODY"
# expected: 200 {"ok":true} on success, 401 on bad sig
```

## 4. EmailEngine — webhook endpoint

Already configured for `messageNew` and `messageBounce`. Just verify the
endpoint URL points at `https://app.elevay.com/api/webhooks/emailengine` and
`EMAILENGINE_WEBHOOK_SECRET` matches.

## 5. Inngest functions to register

The recently-modified Inngest functions are auto-registered via
`app/api/inngest/route.ts`. After deploy, hit Inngest dev (`pnpm inngest dev`
locally, or your prod Inngest cloud sync) and confirm these are present and
healthy:

- `cron-trigger-sequence-steps` (every 2 min, fires `sequence/step-due`)
- `send-sequence-step` (consumes `sequence/step-due`, drafts next email)
- `process-outbound-emails` (every 2 min, sends queued emails via Resend)
- `cron-daily-mailbox-reset` (midnight UTC, resets sentToday + transitions warmup→active)
- `execute-workflow` (consumes `workflow/trigger`)
- `prepare-campaign` (consumes `campaign/prepare`)
- `process-reply`, `handle-reply-intelligently`

## 6. Smoke tests post-deploy

Quick manual checks that the BUGFIX work didn't regress:

| What | How |
|---|---|
| Mail-calendar sync prefs save (BUGFIX-01) | `/settings/mail-calendar` → change "Record creation" → click Save → Network tab shows `PUT /api/settings/mail-calendar` 200 → reload → value persisted |
| Members invite email arrives (BUGFIX-02) | `/settings/members` → enter email → click Invite → check Resend logs OR the recipient's inbox |
| Workflows multi-action (BUGFIX-03) | `/settings/workflows` → Create → "+ Add action" twice → save → workflow list shows "trigger → action1 → action2 → action3" |
| Sequence sends in correct tenant (BUGFIX-04) | Enroll a contact → wait 4 min for `cron-trigger-sequence-steps` cycle → query `outbound_emails WHERE tenant_id = <your tenant>` (no longer `'default'`) |
| Eval page redirects non-admin (BUGFIX-05) | Log in as `member` → go to `/settings/evals` → expect redirect to `/settings`. Sidebar "Admin" section should be hidden. |
| Failure toasts visible (BUGFIX-06) | DevTools → Network → throttle to "Offline" → click "Enrich all" on `/accounts` → toast "Failed to score accounts" appears |
| Unsubscribe link works (BUGFIX-07) | Send a test sequence email to yourself → click footer "Unsubscribe" → page renders "Unsubscribed" → DB: `email_optouts` row inserted, active enrollments paused |

## 7. What's still on the bench (non-blocking)

- Playwright E2E tests for the 7 BUGFIX flows. The Vitest suite covers the
  pure helpers (business-days, unsubscribe-token, safe-fetch) but the
  end-to-end browser flows (admin redirect, invite + accept, multi-action
  workflow execution, sequence pipeline, unsubscribe round-trip) are not
  automated yet. Spec files in `_specs/BUGFIX-XX/tasks.md` enumerate the
  needed Playwright specs.
- New-user signup-with-invite **does** work end-to-end (sign-up consumes
  `?invite=<token>`, redirects through `/sign-in?callbackUrl=/accept-invite`
  after credentials signup, then the accept page switches the tenant), but
  there's no automated test covering the full path yet.
- The 2 dependent-rows delete + EmailEngine cleanup branches in
  `/api/settings/mailboxes` DELETE are now logged on failure but still
  best-effort. If we ever observe orphaned mailboxes in prod, harden the
  cleanup with retries + alerting.

---

## 8. T0 + T1 Phase 1 additions (2026-04-13)

### Manual SQL (data cleanup)

Apply **once per environment**:

```bash
psql "$DATABASE_URL" -f app/apps/web/drizzle/manual/0001_fix_challenge_label.sql
```

Normalises legacy `primaryChallenge = "Finding the right leads"` →
`"Finding leads"` so the home subtitle renders (T0.3).

Tracking log lives in `app/apps/web/drizzle/manual/README.md`.

### New Drizzle migrations (auto-applied by `drizzle-kit migrate`)

| File | Purpose |
|---|---|
| `0009_broad_golden_guardian.sql` | `password_reset_tokens` (T0.8) |
| `0010_dashing_human_robot.sql`   | `user_preferences` (T1-F5) |
| `0011_fast_rictor.sql`           | `saved_views` (T1-F4) |

### New environment variables

| Var | Purpose | Required for | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Client + server Sentry DSN | T1-F13 | Unset = Sentry disabled. |
| `SENTRY_DSN` | Server-only DSN override | T1-F13 | Falls back to `NEXT_PUBLIC_SENTRY_DSN` if unset. |
| `SENTRY_ORG` | Sentry org slug | T1-F13 | Only needed when uploading source maps. |
| `SENTRY_PROJECT` | Sentry project slug | T1-F13 | Only needed when uploading source maps. |
| `SENTRY_AUTH_TOKEN` | API token for source map upload | T1-F13 (prod) | Set in CI. Not required locally. |
| `NEXT_PUBLIC_APP_ENV` | Env tag (dev/staging/prod) | T1-F13 | Defaults to `NODE_ENV`. |

### Smoke tests (T0 + T1)

| What | How |
|---|---|
| Password reset flow (T0.8) | `/sign-in` → "Forgot password?" → submit email → receive link → open in incognito → submit new pwd → `/sign-in?reason=password-reset-success` → sign in with new pwd. |
| Onboarding resume (T0.2) | Start wizard, advance to "Product" step, close tab, log back in → wizard reopens at "Product" with "Welcome back" banner. |
| Chat approveCard error toast (T0.4) | Throttle network to Offline, approve a proposed contact card → error toast, card stays in "pending" state. |
| Accounts bulk enrich progress (T0.5) | Select ~30 accounts, "Enrich all" → progress toast updates in chunks of 20, final toast reports enriched count. |
| SkipLink (T1-F11) | Tab into any page from a cold load → "Skip to main content" appears → Enter → focus jumps past the sidebar. |
| Sentry (T1-F13, post-DSN) | Trigger an intentional error in `/sign-in` via DevTools → Sentry project shows the event with the user + URL breadcrumbs. |
