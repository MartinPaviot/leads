# WS-2 Pricing v2 — Reviewer Guide

Short guide for whoever reviews the PR. If you only have 10 minutes, read
this file + the diffs of the four files in **"Look here first"** below.

## What this PR does

Makes the pricing page's quota promises real. Until now "1,000 contacts / 500
emails / month / 500 AI queries" were marketing copy with no enforcement
anywhere in the app. This PR:

1. Collapses three duplicated quota definitions onto one typed source
   (`lib/pricing/tiers.ts`).
2. Adds enforcement at the 7 user-initiated mutation points (contact
   creates, outbound email sends, AI chat queries, imports), gated by the
   `PRICING_V2_ENFORCEMENT` env flag.
3. Adds a live quota endpoint + dashboard banner so tenants see headroom.
4. Pushes WS-1 referral credits to Stripe customer balance for real (they
   were ledger-only before).
5. Admin UI so we can uncap / pause individual tenants without hand-editing
   jsonb.

## Look here first

Four files carry most of the intent. Everything else is wiring.

| File | Why |
|---|---|
| `app/apps/web/src/lib/pricing/tiers.ts` | Single source of truth. If the quotas look wrong, they're wrong here first. |
| `app/apps/web/src/lib/pricing/quota.ts` | Assertion primitives. `assertResource` (count-based) vs `assertMetered` (usage-events-sum) — this distinction was the bug in the old `checkPlanLimit` that never shipped. |
| `app/apps/web/src/lib/pricing/enforce.ts` | Flag-gated wrappers. Feature flag lives here — one place to kill/enable enforcement. |
| `app/apps/web/src/lib/pricing/credits.ts` | WS-1 → Stripe bridge. Idempotency is critical — read the fast-paths carefully. |

## Key decisions to scrutinise

Each one has a reasonable alternative. If you disagree, push back.

1. **`REFERRAL_CREDIT_CENTS = 4900` (flat, plan-independent).**
   Alternative: read the referring tenant's current plan and credit one
   month of whatever they pay. Rejected because it adds a Stripe round trip
   per grant and makes the reward less predictable. Tradeoff: a Pro referrer
   gets ~50% off for a month, not 100%. Acceptable for v1.

2. **`canceled` tier quotas == `trial` quotas.**
   Alternative: let cancelled tenants keep their former tier's limits until
   their data ages out. Rejected because a sub-status-canceled tenant
   quietly sending Pro-tier email volume is how we lose money in this
   commercial model.

3. **Unknown `stripePriceId` → "starter" (not "trial").**
   This is the opposite of the rest of the "unknown → safest" logic, and
   it's deliberate. A paying customer whose price id isn't mapped shouldn't
   get trial quotas — that would under-quota them. Trial fallback is only
   for genuinely unpaid tenants.

4. **Async-path contact creates NOT guarded.**
   `inngest/sync-functions`, `api/email/sync`, `campaign-functions`,
   `onboarding-functions`, `lib/chat/tool-call-log` — these auto-create
   contacts from inbound data. Blocking them would break sync idempotency.
   So a trial tenant at 99 contacts can have 1000 contacts next morning
   via email auto-capture. The banner will scream 10x over, which is
   fine — it drives upgrade conversations. Flagged as WS-2.2.

5. **Admin app has no auth gate beyond what was already there.**
   The "Tenants" page edits `quota_overrides` on any tenant. If the admin
   app is ever exposed outside a trusted network, we need a middleware
   auth check. Today it relies on infra-level gating (same as the rest of
   `apps/admin`).

6. **Migrations renumbered 0017→0018 and 0018→0019** to avoid collision
   with `feat/journey-audit-haute`'s `0017_email_verification_and_lockout`.
   See commit `7b267d6` + `notes.md` §6. Proactive, no functional impact.

## Manual test checklist before merge

Minimum set to run locally before approving. None of this is in CI.

- [ ] **`PRICING_V2_ENFORCEMENT` unset (default)**: create a trial tenant,
  spam 100 emails via the outbound worker, verify all send. Verify
  `/api/billing/quota` returns `emails: 100, overLimit: ["emails"]`.
- [ ] **`PRICING_V2_ENFORCEMENT=on`**: same tenant, spam the 101st email,
  verify it lands in `outbound_emails` with `status='failed'` and
  `error_message` containing "Quota exceeded".
- [ ] **Import 2000 rows CSV** on a trial tenant (100 contact limit). Verify
  the response is 402, verify `select count(*) from contacts where
  tenant_id = ...` is unchanged (atomic reject — not partial insert).
- [ ] **Banner**: load `/dashboard` on a tenant at 45/50 emails → yellow
  banner. Bump to 50/50 → red. Dismiss → sessionStorage entry set.
  Close/reopen tab → banner stays dismissed for 1h.
- [ ] **Admin quota overrides**: open `/tenants` in the admin app, pick any
  tenant, set `contacts: 50`, Save. Try to create a 51st contact via
  `/api/contacts` → expect 402. Set back to inherit → next create works.
- [ ] **Stripe balance push** (requires live Stripe test key + a referring
  tenant with a Stripe customer): simulate an attribution that triggers
  `maybeGrantCredit` three times. Check Stripe Dashboard → customer
  balance transactions list shows -$49 with description "Elevay referral
  credit" and metadata `{tenantId, creditEventId, source:"ws2_referral_credit"}`.
  Replay the same attribution → expect NO duplicate transaction
  (idempotencyKey `referral_credit:<eventId>` short-circuits).

## Rollout sequence (dark → live)

1. **Merge with `PRICING_V2_ENFORCEMENT` unset.** Banner ships. Guards
   no-op. Verify for 24h that `/api/billing/quota` usage numbers are
   sensible across real tenants — e.g. no 5000x overcounting of emails,
   no trial tenants somehow reading as 1M contacts.
2. **Set `PRICING_V2_ENFORCEMENT=on` in the staging env first.** Watch
   `outbound_emails` for `status='failed'` entries with
   `"Quota exceeded"` messages. Expected volume is low.
3. **Prod flip.** Watch Sentry for `QuotaExceededError` unhandled throws
   (there shouldn't be any — every call site catches). Watch `/pricing`
   for an uptick in clicks from the banner CTA.
4. **Stripe credit push is live from day one** (no flag). Watch
   `referral_credit_events` for rows where `stripe_balance_txn_id IS NULL`
   AND `created_at < now() - interval '7 days'` — that's the stuck-pending
   bucket, shouldn't grow unbounded.

## Known limitations (WS-2.2 backlog)

All of these are deliberate v1 scope cuts documented in `office-hours.md`
and `notes.md`. None block launch.

- Async-path guards (5 call sites listed above in §4).
- Multi-currency credit push (hardcoded USD, TODO-commented in `credits.ts`).
- Admin audit log of who-changed-what on `quota_overrides`.
- Yearly billing toggle, proration UX, seat pricing, `automatic_tax`.
- Bulk editor on the admin page.
- Removal of `lib/billing.ts` shims — partially done (`checkPlanLimit`
  deleted in commit `81f2f9f`); the remaining three functions
  (`getSubscription`, `isTrialActive`, `trackUsage`) have real callers
  and stay.

## What the PR deliberately does NOT change

- Pricing tier dollar amounts.
- Pricing page layout.
- Existing Stripe Product / Price objects.
- `/api/billing/usage` response shape (consumed by `settings/billing/page.tsx`).
- `/api/billing/subscription` response shape.
- Stripe webhook plan-resolution logic (same function, moved to
  `lib/pricing/tiers.ts#getPlanFromPriceId`).

## Commit map

| Commit | What to focus on |
|---|---|
| `5ab8f2d` T1+T2 | The new `tiers.ts` file; the 3 consumers migrate onto it. |
| `58035dd` T3+T4 | Migration 0018 + the resource-vs-metered split in `quota.ts`. |
| `d868842` T5+T6 | 7 call sites + the `PRICING_V2_ENFORCEMENT` gate. |
| `936ee9a` T7 | `/api/billing/quota` endpoint + `QuotaBanner` mount. |
| `3a7f340` T8+T9 | `credits.ts` Stripe push + `channel.ts` wiring + checkout backfill. |
| `bd17a07` T10 | Docs + a test-file TypeScript fix. |
| `359831e` WS-2.1 | Admin UI + shared `admin-validation.ts`. |
| `81f2f9f` cleanup | `checkPlanLimit` removal. |
| `7b267d6` renumber | Migration number shift for the collision with Martin's parallel branch. |

## If you only review one diff

Review `lib/pricing/quota.ts`. The rest of the PR assumes the semantics
in that file are correct. If you can't explain in one sentence why
`assertResource` uses `count(*) from contacts` but `assertMetered` sums
`usage_events`, something is off.
