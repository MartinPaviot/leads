# WS-2 — Pricing v2 · Office Hours

## Problem

Our pricing page promises quotas ("1,000 contacts", "500 emails / month", "500 AI
queries / month") that are **never enforced** anywhere in the app. A Free Trial
tenant can send 10,000 emails. Worse, WS-1 just shipped a referral-credit ledger
(`tenant_referral_credits`, `referral_credit_events`) whose credits never actually
discount an invoice — so the referring tenant gets nothing real when one of their
meeting participants signs up.

### Concrete state (grep-verified 2026-04-15)

- `lib/billing.ts` **already defines** `checkPlanLimit(tenantId, feature)` and
  `trackUsage(tenantId, eventType, count)` — typed and correct. But zero call
  sites. The functions are dead code.
- Quotas are duplicated in **three places** that will drift:
  1. `lib/billing.ts:15` — `PLAN_LIMITS` (used by `checkPlanLimit`)
  2. `app/(dashboard)/pricing/page.tsx` — hardcoded in `tiers[]` strings
  3. `app/(dashboard)/settings/billing/page.tsx:36` — another `PLAN_LIMITS`
     for display in settings
- Referral credits from WS-1: `referral_credit_events.amount_cents` is written
  by `channel.ts#attributeSignupFromExposure`, but nothing pushes to Stripe.
- `tenants.plan` is freeform text; mapping plan → PriceId lives in the Stripe
  webhook only (`getPlanFromPriceId`, stripe/route.ts:268).

## Premise check

- "We need to charge more." → **No.** The tiers and prices are fine for the ICP
  (founder-led sales, low seat count). The leak is enforcement + wallet.
- "We need seat-based pricing." → **No, not now.** ICP = founder-led = 1–3 seats.
  Seat pricing is a Series A concern, not a pre-launch one. Flag as ocean.
- "We need yearly billing, proration UX, tax automation." → **Not now.** Stripe
  Portal covers plan change / cancel; `automatic_tax` on checkout is one flag
  away but no customer is asking. Ocean.
- "The hardcoded tiers on the pricing page are fine." → **No.** Two readers need
  them (pricing page + enforcement layer). Duplicating means they'll drift.
  One `pricing/tiers.ts` typed source of truth.

So WS-2 v1 is exactly three things: **(a) collapse the 3 quota definitions into
one typed source that `billing.ts` / pricing page / settings all import, (b) wire
the existing `checkPlanLimit` + `trackUsage` helpers into the 3 call sites that
actually consume (outbound email send, contact create, AI query) + surface a
user-visible banner, (c) plumb credit wallet into Stripe Customer Balance.**

Important: this is *not* "build enforcement from scratch" — it's "finish what
was started". Keeps the delta small and realistic.

## Alternatives considered

### (a) Where to define tier features & quotas

1. Keep in `pricing/page.tsx` as-is. Add a second copy in a new `quota.ts` for
   enforcement. **7/10 completeness — will drift within a month.**
2. Single `lib/pricing/tiers.ts` read by pricing page + enforcement + admin
   override UI. Typed, testable, one place. **10/10.** ← chosen
3. Move into the DB (admin UI to change tiers at runtime). **10/10 but premature
   — we change tiers via PR-reviewed commit right now, and admin UI is a Series A
   problem. Flag as ocean.**

### (b) Quota enforcement strategy

1. Hard block at the API route level (checkQuota() guard in every handler that
   could consume). **10/10 coverage but ~30 touch points.**
2. Wrap at a single chokepoint (db insert trigger for usage_events). **6/10 —
   race conditions between check and insert, and contacts/emails aren't in
   usage_events anyway.**
3. Middleware at the quota-sensitive surfaces only — outbound email send,
   contact create, AI query — with a shared `assertWithinQuota(tenant, kind)`
   helper. Read current count from usage_events for metered kinds, from
   `select count(*) from contacts` for resource kinds. **9/10 — clean, avoids
   race by doing the check inline with the mutation in a tx where it matters
   (email send is async-queued, so a race only costs one extra email).** ← chosen
4. Monaco-style "soft cap with upgrade prompt, never actually block". **3/10 —
   removes any commercial teeth; free tier becomes the real tier.**

### (c) Credit wallet → Stripe

1. Stripe Coupon per credit event. **4/10 — coupon limits, hard to revoke.**
2. Stripe Customer Balance (negative balance applied at next invoice). **10/10 —
   exactly what it's for. Persists across invoices. Refunds cleanly.** ← chosen
3. Apply discount only at checkout (new sub). **5/10 — leaves existing subs
   without the benefit, which is most of the WS-1 target (attribution happens
   after signup, i.e. when they're already on a sub).**

## Layer check

- **Layer 1 (proven)**: Stripe Customer Balance, Next.js route handlers,
  Drizzle — all used elsewhere in repo.
- **Layer 2 (popular)**: single-file typed plan config — common pattern in
  Shopify, Linear, Vercel's own pricing. No exotic choice.
- **Layer 3 (first principles)**: the enforcement point is **where the resource
  is committed** (outbound send queued, contact row inserted, AI call billed).
  Anywhere else is either too early (over-blocks) or too late (already spent).

## Completeness target

**9/10.** Missing from a true 10/10:
- Seat-based pricing (flagged ocean — ICP doesn't need it)
- Yearly toggle with auto-discount (ocean — no one's asking)
- Admin runtime tier editor (ocean — PR review is fine at our volume)
- Per-tenant comp/override of quotas (we need 2/10 for launch: a
  `tenants.quotaOverrides jsonb` column consulted by the assertion helper, so
  we can manually uncap a design partner. Included in scope.)

## Non-goals (explicit, so the spec stays tight)

- No new Stripe Product / Price objects — reuse the existing Starter / Pro.
- No change to the three pricing tiers' dollar amounts.
- No new pricing page layout — same page reads from the new source of truth.
- No migration of existing subscribers — webhook-maintained `tenants.plan`
  stays authoritative.
- No referral payout to the referring tenant in dollars — credits are the
  mechanism (simpler, self-contained in Stripe).

## Scope summary

1. `lib/pricing/tiers.ts` — typed source of truth for plan → {quotas, features,
   priceEnvKey, stripePriceId lookup}.
2. `lib/pricing/quota.ts` — `assertWithinQuota(tenantId, kind)` helper.
   Integrated at: outbound email send, contact create, AI query.
3. `tenants.quotaOverrides` jsonb column + migration.
4. `api/billing/quota` GET endpoint — returns `{plan, usage, limits, overLimit[]}`
   for UI banner.
5. Dashboard banner component — shows when any quota > 80%, red when over.
6. Credit wallet → Stripe Customer Balance: extend `channel.ts`
   `attributeSignupFromExposure` so after inserting a `referral_credit_events`
   row with `amount_cents > 0`, it calls `stripe.customers.createBalanceTransaction`
   on the referring tenant's Stripe customer (if one exists) with the negative
   amount and the event id as idempotency key.
7. Tests: unit tests on tiers + quota helper, integration test on the balance
   transaction call.
