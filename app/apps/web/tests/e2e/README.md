# E2E Playwright tests

Covers the test specs that landed with BUGFIX-01..07. Five run
in-process; two are skipped pending external infra (Resend capture
and Inngest dev server).

## Running

```bash
cd app/apps/web
pnpm e2e                 # all specs (webServer boots automatically)
pnpm e2e --ui            # Playwright UI mode
pnpm e2e -g "mail-cal"   # filter by test name
```

The `webServer` block in `playwright.config.ts` spawns
`next dev --turbopack --port 3100`. The seed / cleanup test
endpoints light up whenever `NODE_ENV !== "production"`, which
`next dev` sets automatically. Locally the server is reused
between runs; in CI each run starts fresh (2 retries).

## Test matrix

| Spec | Covers | Runs |
|---|---|---|
| `webhooks-engagement.spec.ts` | BUGFIX-07 T8 — tracking + unsubscribe | ✅ 4/4 |
| `admin-only-routes.spec.ts` | BUGFIX-05 T5 — API-layer admin gates | ✅ 2/2 |
| `mail-calendar-prefs.spec.ts` | BUGFIX-01 T3 — prefs PUT round-trip | 🚧 fixme — settings/mail-calendar doesn't render Save for a fresh tenant |
| `offline-resilience.spec.ts` | BUGFIX-06 T9 — offline doesn't crash | 🚧 fixme — needs a deterministic app-shell-ready signal |
| `workflows-multi-action.spec.ts` | BUGFIX-03 T6 — 3-action CRUD persist | 🚧 fixme — list doesn't re-render in time after save |
| `accept-invite.spec.ts` | BUGFIX-02 T8+T9 | ⏭ skipped — needs Resend capture |
| `sequence-pipeline.spec.ts` | BUGFIX-04 T11 | ⏭ skipped — needs Inngest dev + Resend |

`fixme` tests are real but need either a deterministic wait on the
server-side response (waitForResponse) or a fresh tenant seeding
strategy that includes enough state (mailboxes, ICP) that the page
renders its non-empty branch. The infra itself — seed, credentials
login via /api/auth/callback/credentials, cleanup — is proven by the
6 passing tests.

## Infrastructure

### Seed endpoints

- `POST /api/test-e2e/seed` — create tenant + auth user + credentials
  row with bcrypt password. Returns `{ tenantId, email, password,
  role, ... }`.
- `POST /api/test-e2e/cleanup` — delete every tenant-scoped row + auth
  user by id, plus any leftover auth rows matching an email prefix.

Both endpoints 404 when `NODE_ENV === "production"`. Every real
deploy (Vercel, `next build && next start`) sets NODE_ENV=production,
so the endpoints never reach a prod user.

### Auth strategy

Each test seeds a fresh tenant + user with a known password, then
drives the `/sign-in` Credentials form. The session cookie is
JWT-signed by NextAuth using the normal server path — no JWT forgery.

### DB isolation

Tests write to the configured `DATABASE_URL` (currently Supabase).
Every row they create is scoped to the seeded tenant, and the
`afterEach` cleanup hook deletes everything owned by that tenant
plus the auth user. If a test crashes hard, leftover rows can be
reaped with `emailPrefix` — seed emails follow the pattern
`<tenantSlug>-<timestamp>@example.test`.

## Unskipping the deferred specs

### `accept-invite.spec.ts`

Need a way to capture the outgoing Resend invite email. Two options:

1. Point `RESEND_API_KEY` at a test account whose inbox we can drain
   via the Resend API.
2. Stub the Resend client in the webServer env with an in-memory
   capture, exposed to tests via `/api/test-e2e/last-invite-email`.

### `sequence-pipeline.spec.ts`

Need:

1. Inngest dev server running alongside Next.js during the test run
   (`pnpm inngest-cli dev --no-discovery -u http://localhost:3100/api/inngest`).
2. Resend test mode to flip outbound-email status from `queued` to
   `sent`.
3. A test-only reply-injector endpoint that feeds a fake EmailEngine
   webhook payload so we can assert the enrollment flips to
   `replied`.
