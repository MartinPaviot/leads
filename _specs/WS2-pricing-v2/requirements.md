# WS-2 — Pricing v2 · Requirements

## User story

As a **founder on the Free Trial plan**, when I try to send my 51st outbound
email in the current billing period, I should be stopped with a clear message
explaining the limit and a one-click path to upgrade — **not** silently blocked
or, worse, silently succeed and break my billing model.

As a **founder whose Elevay bot attended a meeting with a prospect who later
signed up for their own Elevay account**, I should see a credit on my next Stripe
invoice without doing anything, so the referral channel has real economic value
and I'm incentivised to keep using the branded notetaker.

As a **Martin (operator)**, I need to lift quotas for a specific design-partner
tenant without editing code, so I can say yes to a "can you uncap me for two
months" without a deploy.

## Acceptance criteria (GIVEN / WHEN / THEN)

### AC-1 — single source of truth for tiers

GIVEN the repo contains exactly three locations that hard-code plan quotas
  (lib/billing.ts, pricing/page.tsx, settings/billing/page.tsx)
WHEN this feature ships
THEN all three locations import from `lib/pricing/tiers.ts` and the grep
  `PLAN_LIMITS|contacts:.*emails` returns only the new file + test fixtures.

### AC-2 — email send enforcement

GIVEN a tenant on `trial` plan with 50 `email_sent` usage events this period
WHEN their outbound worker attempts to send the 51st email
THEN the send is aborted, the attempt is recorded with reason=`quota_exceeded`,
  and the user sees a banner "You've hit your 50 emails / month trial limit.
  Upgrade to Starter to keep sending." with a "Upgrade" CTA linking to
  /pricing.

AND GIVEN a tenant on `pro` with `aiQueriesPerMonth: Infinity`
WHEN they submit their 10,000th AI chat query
THEN the query succeeds and a `ai_query` usage event is written.

### AC-3 — contact create enforcement

GIVEN a tenant on `starter` with exactly 1000 contacts
WHEN any code path (manual create, import, smart-import, onboarding find-contacts,
  MCP, chat tool, campaign sync) attempts to insert contact #1001
THEN the insert is rejected with a structured error `{code: "quota_exceeded",
  limit: 1000, current: 1000, feature: "contacts"}`, **no contact row is
  written**, and an appropriate user-surfacing message is returned by each
  API route (not swallowed).

### AC-4 — AI query metering

GIVEN a tenant uses the chat feature
WHEN the model responds with a non-error final message
THEN exactly one `ai_query` usage event is written (not one per tool call,
  not zero).

### AC-5 — banner visibility

GIVEN a tenant's current-period usage of any metered kind is ≥ 80% of the
  limit
WHEN they load any /dashboard route
THEN a yellow banner shows "Email sends: 45 / 50 used this period". If ≥ 100%
  the banner turns red and the primary action becomes "Upgrade".

GIVEN a tenant on `pro` with `aiQueriesPerMonth: Infinity`
WHEN their ai_query count is 50,000
THEN no banner is shown for that kind.

### AC-6 — credit wallet → Stripe

GIVEN a tenant has a live Stripe customer (stripeCustomerId set in
  `subscriptions`)
AND a referral credit of 10,00 € (1000 cents) has just been earned via a
  new `referral_credit_events` row with `event_type='credit_granted'` and
  `amount_cents=1000`
WHEN the insertion completes
THEN `stripe.customers.createBalanceTransaction` is called with:
  - amount: -1000 (credit reduces balance)
  - currency: as per the customer's default
  - description: "Elevay referral credit · {attributed tenant name}"
  - idempotency key: `referral_credit:{event.id}` (so a replay never
    double-credits).

AND IF the tenant has no Stripe customer yet (still on trial, never checked
  out) THEN the credit stays in our ledger and a `pending_stripe_push`
  metadata flag is set; a reconciliation job (or the next checkout) pushes
  accumulated credits at customer-creation time.

### AC-7 — admin quota override

GIVEN a tenant row has `quotaOverrides: {"contacts": 50000, "emailsPerMonth":
  null}` (null means "inherit from plan")
WHEN any enforcement check runs against that tenant
THEN the override value is used for contacts, and the plan default is used
  for emailsPerMonth.
AND no UI exists for editing overrides in v1 — it's a DB column Martin sets
  manually. (UI is Series A work.)

### AC-8 — no regressions

- `npx tsc --noEmit -p apps/web` returns 0 errors.
- `npx vitest run` all tests green including new WS-2 tests and the existing
  `billing-usage-api.test.ts`.
- `/api/billing/usage` response shape unchanged (existing UI consumer).
- `/api/billing/subscription` response shape unchanged.
- Stripe webhook still maps priceId → plan name correctly (no change to
  `getPlanFromPriceId`).

## Edge cases

1. **Race**: two concurrent email-send jobs for a tenant at 49/50. Expected:
   the first succeeds, the second either succeeds or fails cleanly (counted
   or blocked, never corrupted). Acceptable to over-count by ±1 since email
   sends are async.
2. **Clock skew vs period boundary**: a send submitted at 23:59:59 on the last
   day of the period. Usage event takes the server timestamp, consistent with
   the period boundary.
3. **Webhook replay**: Stripe re-delivers `checkout.session.completed`. The
   subscription upsert is idempotent (keyed on tenantId). The credit push is
   keyed on event.id (idempotent).
4. **Tenant with no subscription row** (never hit checkout): plan = "trial",
   quotas applied, no Stripe customer → credit stays pending.
5. **Tenant on `canceled`**: treated as trial tier for quotas (we don't want
   to silently let a cancelled tenant keep using at pro rates).
6. **Infinity quotas**: `Infinity` limits must serialise as `null` over JSON
   (never `Number.MAX_SAFE_INTEGER`, never the string "Infinity"). Client
   treats `null` as unlimited.
7. **Override = 0**: treated as "force block all" (legitimate use: pause a
   tenant without deleting their data).

## Evaluation plan (Phase 6 rubric)

- Test a live trial tenant sending 51 emails via the outbound worker.
  Screenshot the banner + the blocked 51st.
- Simulate a `referral_credit_events` insert with amount_cents=500 for a
  tenant with a live Stripe customer; check `stripe.customers.balanceTransactions.list`
  shows the -500 entry with description + idempotency metadata.
- Replay the same insert → expect exactly 0 new Stripe balance transactions
  (idempotency working).
- Set `tenants.quotaOverrides = {contacts: 5}` on a test tenant, try to
  create 6 contacts, expect the 6th to block.
