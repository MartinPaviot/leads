# WS-2 — Pricing v2 · Design

## System fit

Three existing subsystems need to be connected:

```
                 ┌──────────────────────┐
                 │  lib/pricing/tiers   │  single source of truth
                 │  (TIERS, LIMITS)     │  (NEW — replaces 3 dup defs)
                 └─────────┬────────────┘
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   pricing/page.tsx   lib/pricing/quota   settings/billing
   (display)          (NEW enforcement)   (display)

   lib/pricing/quota
          ├── checkResource(tenantId, 'contacts')   → count(*) from contacts
          ├── checkMetered(tenantId, 'emails')      → sum(usage_events)
          └── checkMetered(tenantId, 'ai_queries')  → sum(usage_events)
                      │
                      ▼
         call sites (5 user-facing):
           • inngest/email-send-worker   (per send, before resend.send)
           • api/contacts POST           (before insert)
           • api/import, api/import/smart (batch-aware check)
           • api/mcp (contact insert branch)
           • lib/chat/tools/create       (before insert)
           • chat route (on final assistant message, metered track)

   channel.ts#attributeSignupFromExposure
       ├── insert referral_credit_events (existing)
       └── NEW: pushCreditToStripe(tenantId, event) → customers.createBalanceTransaction

   /api/billing/quota (NEW)  → returns {plan, usage, limits, overLimit[]}
       │
       ▼
   components/quota-banner.tsx (NEW) — mounted in (dashboard) layout
```

## Data model changes

### 1. `tenants.quotaOverrides` jsonb (new column)

```sql
ALTER TABLE tenants
  ADD COLUMN quota_overrides jsonb NOT NULL DEFAULT '{}';
```

Shape: `{"contacts"?: number|null, "emailsPerMonth"?: number|null,
"aiQueriesPerMonth"?: number|null}`. `null` = inherit plan default. Missing
key = inherit. A number (incl. 0) = override.

Drizzle:
```ts
quotaOverrides: jsonb("quota_overrides").default({}).notNull(),
```

Migration file: `app/apps/web/drizzle/0017_quota_overrides.sql`.

### 2. `referral_credit_events.stripe_balance_txn_id` text (new column)

```sql
ALTER TABLE referral_credit_events
  ADD COLUMN stripe_balance_txn_id text;
CREATE UNIQUE INDEX referral_credit_events_stripe_txn_uniq
  ON referral_credit_events(stripe_balance_txn_id)
  WHERE stripe_balance_txn_id IS NOT NULL;
```

Populated after a successful `customers.createBalanceTransaction`. Enables
the idempotency check: if a row already has this set, skip the push.

### 3. `referral_credit_events.metadata.pending_stripe_push` (no schema change)

Written into the existing `metadata` jsonb when the tenant has no Stripe
customer yet. Consumed by a reconciliation step at customer-creation time
(checkout route).

## API contracts

### `GET /api/billing/quota`

Auth: required. Tenant from session.

Response:
```ts
{
  plan: "trial" | "starter" | "pro" | "canceled",
  periodStart: string | null,  // ISO
  periodEnd: string | null,
  usage: {
    contacts: number,       // count(*) from contacts
    emails: number,         // sum(usage_events.count) for email_sent this period
    ai_queries: number,     // sum for ai_query this period
  },
  limits: {
    contacts: number | null,         // null = unlimited
    emailsPerMonth: number | null,
    aiQueriesPerMonth: number | null,
  },
  overLimit: Array<"contacts" | "emails" | "ai_queries">,
  nearLimit: Array<"contacts" | "emails" | "ai_queries">, // >= 80%
}
```

Note: `Infinity` in TIERS must serialise as `null` — never `"Infinity"`, never
`Number.MAX_SAFE_INTEGER`. Helper: `serialiseLimit(n) => Number.isFinite(n) ? n : null`.

### Quota enforcement error shape

When a guarded operation rejects:
```ts
{
  error: "Quota exceeded",
  code: "quota_exceeded",
  feature: "contacts" | "emails" | "ai_queries",
  current: number,
  limit: number,
  plan: string,
  upgradeUrl: "/pricing",
}
```
HTTP 402 (Payment Required) — a standard code the frontend can intercept.

## Module layout

```
app/apps/web/src/lib/pricing/
├── tiers.ts           export TIERS, getTierForPlan, getLimitsForTenant (plan + overrides)
├── quota.ts           assertResource, assertMetered, readUsage (internal)
├── enforce.ts         guardedInsertContact, guardedSendEmail, guardedAiQuery (wrappers)
└── credits.ts         pushCreditToStripe, backfillPendingCredits
```

`lib/billing.ts` stays for back-compat exports; re-exports from new files
and marks old entry points `@deprecated`. No behaviour change for existing
callers. Removing it is a follow-up.

## Data flow: email send enforcement

```
inngest/email-send-worker (per outbound email)
  1. Load outboundEmail row with tenantId
  2. Call guardedSendEmail(tenantId, resendPayload):
     a. assertMetered(tenantId, "emails") → throws QuotaExceededError if over
     b. await resend.emails.send(...)
     c. trackUsage(tenantId, "email_sent", 1)
  3. On QuotaExceededError:
     - Mark outboundEmail.status = 'quota_blocked'
     - Insert activity: "quota_exceeded: emails, 50/50 used"
     - Do NOT retry (inngest NonRetriableError)
  4. On other errors: normal retry path
```

The track-usage call after send means we can over-count only if the request
is re-queued by inngest after a partial failure. Acceptable ±1 drift.

## Data flow: contact create enforcement

Each of the 5 user-facing call sites replaces:
```ts
await db.insert(contacts).values(row).returning();
```
with:
```ts
await guardedInsertContact(tenantId, row);  // throws QuotaExceededError
```

The helper:
```ts
export async function guardedInsertContact(tenantId, values) {
  await assertResource(tenantId, "contacts"); // NOT in a tx — eventual consistency
  return db.insert(contacts).values(values).returning();
}
```

For **batch imports** (`api/import`, `api/import/smart`) the check is done
once up-front with a size argument:
```ts
await assertResource(tenantId, "contacts", { addingCount: rows.length });
// throws if current + rows.length > limit
```
This prevents a 10,000-row import on a trial tenant. The batch is rejected
atomically (all-or-nothing) rather than partially inserted.

Async/auto contact creation (`inngest/sync-functions`, `email/sync`,
`campaign-functions`, `onboarding-functions`, `tool-call-log`) does NOT use
`guardedInsertContact`. It stays on raw insert with only `trackUsage`
best-effort. Reason: these are background enrichments and failing them
silently would break sync idempotency. Flag as follow-up (WS-2.1).

## Data flow: AI query metering

`app/api/chat/route.ts` (chat handler, streams model responses). At the point
where the assistant's **final** message is written (stream end, not per-tool-call):
```ts
await trackUsage(tenantId, "ai_query", 1);
```

For enforcement: pre-flight `await assertMetered(tenantId, "ai_queries")`
at the **start** of the handler, before streaming begins. If over quota,
return 402 with the error shape. The frontend chat component renders
"You've used all your AI queries this period" inline + upgrade CTA.

## Data flow: credits → Stripe

`channel.ts#attributeSignupFromExposure` today:
```
1. Look up exposure by normalized participant email
2. If found and recent enough: set signupAttributedTenantId
3. Insert referral_credit_events with amount_cents=500
4. Increment tenant_referral_credits.creditsEarnedCount
```

New step 5: `await pushCreditToStripe(referringTenantId, eventId, amountCents)`.

```ts
// lib/pricing/credits.ts
export async function pushCreditToStripe(tenantId, eventId, amountCents) {
  if (!stripe) return;  // billing not configured
  const [sub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId)).limit(1);
  if (!sub?.stripeCustomerId) {
    // Mark pending — will be backfilled at next checkout
    await db.update(referralCreditEvents)
      .set({ metadata: sql`metadata || '{"pending_stripe_push": true}'::jsonb` })
      .where(eq(referralCreditEvents.id, eventId));
    return;
  }
  const txn = await stripe.customers.createBalanceTransaction(
    sub.stripeCustomerId,
    {
      amount: -amountCents,  // negative = credit
      currency: "usd",  // TODO: read from customer default
      description: `Elevay referral credit`,
      metadata: { tenantId, creditEventId: eventId },
    },
    { idempotencyKey: `referral_credit:${eventId}` }
  );
  await db.update(referralCreditEvents)
    .set({ stripeBalanceTxnId: txn.id })
    .where(eq(referralCreditEvents.id, eventId));
}

export async function backfillPendingCredits(tenantId) {
  // Called after checkout creates a customer
  const pending = await db.select().from(referralCreditEvents)
    .where(and(
      eq(referralCreditEvents.tenantId, tenantId),
      sql`metadata->>'pending_stripe_push' = 'true'`,
      isNull(referralCreditEvents.stripeBalanceTxnId),
    ));
  for (const ev of pending) {
    await pushCreditToStripe(tenantId, ev.id, ev.amountCents);
  }
}
```

Idempotency: Stripe's idempotencyKey ensures the same event.id replayed
twice yields one balance transaction. Plus our pre-check of
`stripeBalanceTxnId` avoids a second Stripe call on DB replay.

Currency: **v1 ships USD-only**. Customer default currency reading is
straightforward (`stripe.customers.retrieve → currency`) but adds a round
trip. Flag as follow-up. Our ICP is early-stage US startups.

## Failure handling

| Failure | Behaviour |
|---|---|
| Stripe down (balance txn) | Log, leave `stripeBalanceTxnId` null, rely on backfill job / next checkout |
| DB tx fails mid-insert of credit event | No partial state — the insert is the audit record; txn push is after |
| `assertResource` reads stale count (concurrent insert) | Accept ±1 drift; Stripe quota is a commercial limit not a security boundary |
| `tenants.plan` is null / unknown | Treat as "trial" — most restrictive |
| `quotaOverrides` has garbage types | Zod-validate at read time; fall back to plan default on invalid shape |
| Chat request blocked mid-stream | 402 before stream starts; never mid-stream |

## Security

- `/api/billing/quota` requires session, returns only the caller's tenant.
- Admin override is a DB column, not an API — no new attack surface.
- Stripe idempotency key uses our internal event id (UUID) — no user input.
- Error messages never reveal other tenants' quota config.
- 402 responses are safe to log: no PII beyond tenantId.

## Test matrix

Unit (vitest):
- `tiers.test.ts`: TIERS shape, `getLimitsForTenant` with/without overrides,
  Infinity serialisation.
- `quota.test.ts`: `assertResource` / `assertMetered` against a stubbed db —
  allow / block / over-budget batch / override / null-plan.
- `credits.test.ts`: `pushCreditToStripe` with stubbed stripe — new
  customer / existing txn / idempotency / no-customer-yet pending path.

Integration (vitest + live Postgres via the repo's existing test harness):
- Seed trial tenant, insert 50 `email_sent` events, call `guardedSendEmail` →
  expect QuotaExceededError.
- Seed starter tenant with 1000 contacts, call `guardedInsertContact` →
  expect QuotaExceededError.
- `GET /api/billing/quota` returns the expected shape for each plan.
- Banner component renders over-limit copy.

Regression:
- `billing-usage-api.test.ts` unchanged and passing.
- `webhooks-stripe-api.test.ts` unchanged and passing.

## Rollout

1. Feature-flag via `process.env.PRICING_V2_ENFORCEMENT` (default "off" until
   we've run for 24h with banner only).
2. Banner ships first, shows usage but all guards no-op → verify usage
   numbers match expectations for live tenants.
3. Flip `PRICING_V2_ENFORCEMENT=on` → guards start rejecting.
4. Credit push ships concurrently; unaffected by the flag.

## Non-goals (reiterated from office-hours)

- No seats, no yearly, no proration UX, no `automatic_tax`.
- No admin UI for overrides.
- No retroactive enforcement on existing over-quota tenants (grandfather
  them; Martin adjusts via `quotaOverrides`).
- No async-path enforcement (sync-functions, email/sync) — flagged as WS-2.1.
