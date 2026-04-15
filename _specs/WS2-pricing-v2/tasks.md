# WS-2 — Pricing v2 · Tasks

Ordered. Each task = code change + verify + test. Commit after every 1–2 tasks.
Branch: `feat/WS2-pricing-v2`.

---

## T1 — Create `lib/pricing/tiers.ts` (single source of truth)

**Do:**
- New file `app/apps/web/src/lib/pricing/tiers.ts`:
  - Export `PlanId = "trial" | "starter" | "pro" | "canceled"`
  - Export `TIERS: Record<PlanId, TierSpec>` with `{ displayName, price (string),
    priceNote, description, priceEnvKey, stripePriceIdEnvKey, highlighted,
    features: string[], limits: { contacts, emailsPerMonth, aiQueriesPerMonth }}`
  - `trial` features + limits mirror current pricing page Free Trial.
  - `canceled` tier: zero quotas, no CTA, hidden from pricing page list.
  - Export `getTierForPlan(plan: string | null | undefined): TierSpec` —
    null/unknown/canceled → trial.
  - Export `getLimitsForTenant(plan, overrides)` — merges `quotaOverrides` over
    plan defaults; `null` in override = inherit; missing key = inherit;
    number (incl. 0) = override.
  - Export `serialiseLimit(n: number): number | null` — Infinity → null.

**Verify:** `npx tsc --noEmit -p apps/web` clean.

**Test:** new `lib/pricing/__tests__/tiers.test.ts`:
- TIERS has entries for all PlanIds.
- `getTierForPlan("unknown")` returns trial spec.
- `getLimitsForTenant("pro", {})` has `aiQueriesPerMonth = Infinity`.
- `getLimitsForTenant("starter", {contacts: 5000})` → `{contacts: 5000, ...}`.
- `getLimitsForTenant("starter", {contacts: null})` → plan default (1000).
- `getLimitsForTenant("starter", {contacts: 0})` → 0 (hard block).
- `serialiseLimit(Infinity) === null`, `serialiseLimit(100) === 100`.

---

## T2 — Migrate pricing + billing settings pages onto TIERS

**Do:**
- `app/(dashboard)/pricing/page.tsx`: replace inline `tiers[]` with
  `import { TIERS, PlanId } from "@/lib/pricing/tiers"`. Loop over
  `(["trial", "starter", "pro"] as const).map(id => TIERS[id])`.
- `app/(dashboard)/settings/billing/page.tsx`: remove local `PLAN_LIMITS`
  const, read `TIERS[plan].limits` instead.
- `lib/billing.ts`: delete its private `PLAN_LIMITS` + `getPlanFromPrice`;
  replace with imports from `tiers.ts`. Keep the rest for back-compat.

**Verify:** pricing page renders unchanged (manual browse + typecheck).

**Test:** existing billing-usage-api test still green (it doesn't touch the
page but is the closest regression).

---

## T3 — Migration 0018: `tenants.quota_overrides` column

(Originally planned as 0017; renumbered post-build to 0018 to avoid
collision with Martin's parallel `0017_email_verification_and_lockout.sql`.)

**Do:**
- New SQL: `app/apps/web/drizzle/0018_quota_overrides.sql`:
  ```sql
  ALTER TABLE tenants
    ADD COLUMN quota_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
  ```
- Drizzle: add `quotaOverrides: jsonb("quota_overrides").default({}).notNull()`
  to `tenants` table in `schema.ts`.
- Note: journal drift (0012–0016 already missing snapshots) — we follow
  the same pattern; snapshot regeneration is a separate concern for Martin.

**Verify:** `pnpm drizzle-kit push` in a scratch DB doesn't error.
Existing typecheck clean.

**Test:** `schema.test.ts` (if exists) — else skip; column existence is
validated implicitly by T5 integration tests.

---

## T4 — Create `lib/pricing/quota.ts`

**Do:**
- New file exporting:
  ```ts
  class QuotaExceededError extends Error {
    feature: "contacts" | "emails" | "ai_queries";
    current: number;
    limit: number;
    plan: string;
  }

  export async function readUsage(tenantId): Promise<{
    periodStart: Date, periodEnd: Date | null,
    contacts: number, emails: number, ai_queries: number,
  }>;

  export async function assertResource(
    tenantId: string,
    kind: "contacts",
    opts?: { addingCount?: number }
  ): Promise<void>;

  export async function assertMetered(
    tenantId: string,
    kind: "emails" | "ai_queries"
  ): Promise<void>;
  ```
- `readUsage` queries:
  - `SELECT count(*) FROM contacts WHERE tenant_id = $1` for contacts.
  - `SELECT sum(count) FROM usage_events WHERE tenant_id=$1 AND event_type=$2
    AND created_at >= periodStart` for each metered kind.
  - `periodStart`: `subscriptions.currentPeriodStart` if live, else start of
    calendar month.
- Enforcement reads plan via `subscriptions.stripePriceId` → `getPlanFromPrice`
  (now sourced from tiers.ts), plus `tenants.quotaOverrides` merged via
  `getLimitsForTenant`.

**Verify:** typecheck clean. Unit tests green.

**Test:** `lib/pricing/__tests__/quota.test.ts` with db mocked:
- 50/50 emails → `assertMetered("emails")` rejects with QuotaExceededError
  (feature="emails", current=50, limit=50).
- 49/50 emails → resolves.
- 999 contacts, `addingCount: 1` → resolves. 999 contacts, `addingCount: 2`
  → rejects.
- Infinity limit on pro `ai_queries` → always resolves.
- Override `{emailsPerMonth: 0}` on trial → rejects at 0/0.
- Override `{emailsPerMonth: 200}` on trial → resolves at 50/200.
- Unknown plan (`null`) → falls back to trial limits.

---

## T5 — Wire guards at the 5 user-facing synchronous call sites

**Do:**
Create `lib/pricing/enforce.ts` with:
```ts
export async function guardedInsertContact(tenantId, values, tx?) { ... }
export async function guardedInsertContacts(tenantId, values[], tx?) { ... }
export async function guardedSendEmail(tenantId, sendFn) { ... }
export async function guardedAiQuery(tenantId) { ... }  // pre-flight only
```

Replace raw inserts at:
1. `api/contacts/route.ts` POST — `guardedInsertContact`.
2. `api/mcp/route.ts` contact-create branch — `guardedInsertContact`.
3. `api/onboarding/find-contacts/route.ts` — `guardedInsertContact`.
4. `api/import/route.ts` + `api/import/smart/route.ts` — `guardedInsertContacts`
   with the full batch size up front; reject 402 if exceeded.
5. `lib/chat/tools/create.ts` (both insert sites, contacts-relevant one) —
   `guardedInsertContact`.

Wrap email send in `inngest/email-send-worker.ts` around the
`resend.emails.send(...)` call with `guardedSendEmail`. On QuotaExceededError:
mark outboundEmail row status = `quota_blocked` and log an activity.
Wrap as `NonRetriableError` (inngest) so inngest doesn't retry.

Wrap AI chat entry (`app/api/chat/route.ts`) with `assertMetered(tenantId,
"ai_queries")` before streaming begins. On error, return 402 with the
documented shape. On stream end (success only), call `trackUsage(tenantId,
"ai_query", 1)`.

Each route handler converts QuotaExceededError → 402 with the documented
error body. Factor the conversion into `lib/pricing/http.ts` to avoid
repeating the shape.

**Verify:** hit each route in dev with a tenant seeded at limit — expect
402 response, no rows inserted.

**Test:**
- Integration test `__tests__/pricing-enforcement.test.ts`: fixture tenant
  at 50/50 emails, POST to a test harness route that invokes
  `guardedSendEmail`, expect throw + outboundEmail status.
- Route test for `/api/contacts` POST at 1000/1000 → 402.
- Route test for `/api/import/smart` with a 200-row body for a trial tenant
  at 50/100 contacts → 402, zero rows inserted.

---

## T6 — Feature flag `PRICING_V2_ENFORCEMENT`

**Do:**
- In `enforce.ts`, wrap each `assertResource` / `assertMetered` call:
  ```ts
  if (process.env.PRICING_V2_ENFORCEMENT !== "on") return;
  ```
- `trackUsage` runs regardless of the flag (we want data to flow for banner
  calibration even while enforcement is off).

**Verify:** with flag off, over-limit tenant can still create contacts and
send emails; with flag on, blocked.

**Test:** quota.test.ts already covers the pure assertion logic; add one
test in enforcement to verify the flag bypass.

---

## T7 — `GET /api/billing/quota` endpoint + banner

**Do:**
- New route `app/apps/web/src/app/api/billing/quota/route.ts`:
  returns the response shape documented in design.md §API contracts.
  Uses `readUsage` + `getLimitsForTenant`. `overLimit` / `nearLimit`
  computed server-side. Infinity → null.
- New client component `components/quota-banner.tsx` that:
  - Fetches `/api/billing/quota` on mount (SWR or raw fetch; repo already
    uses SWR for similar things, reuse).
  - Hidden if all `overLimit` + `nearLimit` are empty.
  - Yellow strip with count + "X / Y used" for the first `nearLimit` kind,
    red strip with upgrade CTA if any `overLimit`.
- Mount in `app/(dashboard)/layout.tsx` above the main content.

**Verify:** seed a tenant at 41/50 emails → yellow banner appears. Seed
at 51/50 → red banner with Upgrade button.

**Test:**
- `__tests__/quota-api.test.ts`: shape + overLimit/nearLimit arithmetic
  + Infinity → null serialisation.
- `__tests__/quota-banner.test.tsx` (if RTL setup exists — else skip):
  renders nothing on empty, yellow on nearLimit, red on overLimit.

---

## T8 — Migration 0019: `referral_credit_events.stripe_balance_txn_id`

(Originally planned as 0018; renumbered post-build to 0019 — see T3.)

**Do:**
- New SQL `app/apps/web/drizzle/0019_referral_stripe_txn.sql`:
  ```sql
  ALTER TABLE referral_credit_events
    ADD COLUMN stripe_balance_txn_id text;
  CREATE UNIQUE INDEX referral_credit_events_stripe_txn_uniq
    ON referral_credit_events(stripe_balance_txn_id)
    WHERE stripe_balance_txn_id IS NOT NULL;
  ```
- Drizzle: add `stripeBalanceTxnId: text("stripe_balance_txn_id")` with
  appropriate unique index in schema.ts.

**Verify:** typecheck clean.

---

## T9 — `lib/pricing/credits.ts` — Stripe Customer Balance push

**Do:**
- New file with `pushCreditToStripe` and `backfillPendingCredits` per
  design.md §Data flow: credits → Stripe.
- Call `pushCreditToStripe` at the end of
  `lib/recording/channel.ts#attributeSignupFromExposure`, after the
  `referral_credit_events` insert returns the new id. Non-blocking: wrap in
  a try/catch that logs (signup path must not fail because Stripe is down).
- Call `backfillPendingCredits(tenantId)` from `api/billing/checkout/route.ts`
  immediately after the `stripe.customers.create` branch succeeds.

**Verify:** simulate manually — insert a credit event for a tenant with a
live customer, confirm a balance transaction appears in Stripe Dashboard
with the right description + idempotency metadata. Replay → no duplicate.

**Test:**
- `lib/pricing/__tests__/credits.test.ts` with stripe stubbed:
  - pushCreditToStripe with a live customer → stripe called once with
    amount=-500, idempotencyKey=`referral_credit:<id>`.
  - Same call replayed → stripe NOT called again (row has
    stripeBalanceTxnId set).
  - No customer yet → metadata.pending_stripe_push set, stripe not called.
  - backfillPendingCredits picks up the pending row and pushes it.

---

## T10 — Regression + docs

**Do:**
- Run full `npx vitest run` — all green.
- Run `npx tsc --noEmit -p apps/web` — 0 errors.
- Update `_specs/WS2-pricing-v2/notes.md` with any surprises found during
  build (expected: the `lib/billing.ts` dead code, the 3-way quota drift,
  the resource-vs-metered semantic mismatch already noted in office-hours).
- Commit with the trailers required by CLAUDE.md.

**Verify:** final spot-check on `/pricing`, `/settings/billing`,
`/dashboard` (banner), and one contact-create flow with flag on/off.

---

## Out of scope (WS-2.1 follow-ups)

- Async-path enforcement (email/sync, sync-functions, campaign-functions,
  onboarding-functions, tool-call-log).
- Per-tenant admin UI for quota overrides.
- Multi-currency credit pushes.
- Yearly billing toggle + proration UX.
- Seat-based pricing.
- Removal of the back-compat shims in `lib/billing.ts`.
