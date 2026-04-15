# WS-2 — Implementation notes (T10 output)

Things found during build that weren't visible from the spec alone.

## Pre-existing dead code / drift

### 1. `lib/billing.ts` had functional helpers that were never called

`checkPlanLimit(tenantId, feature)` and `trackUsage(tenantId, eventType, count)`
existed before WS-2 with clean signatures and types — but grep turned up zero
callers. Built and forgotten. WS-2 T5 repurposed `trackUsage` (via
`guardedSendEmail` + the chat route) and kept `checkPlanLimit` as an
`@deprecated` shim pointing callers at `lib/pricing/quota.ts`.

### 2. Three independent copies of the plan quotas

Before WS-2:
- `lib/billing.ts:15` — `PLAN_LIMITS` with `aiQueriesPerMonth: Infinity`
- `app/(dashboard)/pricing/page.tsx` — hardcoded in the marketing strings
- `app/(dashboard)/settings/billing/page.tsx:36` — `PLAN_LIMITS` with
  `ai: -1` as the unlimited sentinel (different from billing.ts!)

Three sources, two different "unlimited" representations. T1+T2 collapsed
them onto `lib/pricing/tiers.ts`. The settings page keeps its `-1` contract
for the `UsageMeter` component via a small `toMeterLimit` adapter —
untangling `UsageMeter`'s prop type was out of scope.

### 3. `checkPlanLimit`'s "contacts" semantic was wrong

The old helper looked up contact quota by summing `contact_enriched`
`usage_events` rows for the current billing period. That's a **metered**
read — but contacts are a **resource** (cumulative count of owned rows,
not a monthly rate). A tenant at 1000 contacts with only 600 enrichment
events this month would read as "400 under limit" — import 400 more and
you'd be at 1400 contacts. Almost certainly why the helper was never
wired: somebody noticed, didn't fix it, moved on.

`lib/pricing/quota.ts` splits into `assertResource` (count(*) from
contacts) and `assertMetered` (sum usage_events). Different quotas need
different reads.

### 4. Hardcoded "Elevay" bot name in recall.ts:98

Noticed during WS-1 but surfaces for WS-2 users too: the bot display
name from `tenantSettings.recordingBotName` is never read. `createBot`
hardcodes "Elevay". WS-1 routed new call sites through
`lib/recording/bot-deployment.ts` which does honor the setting; the raw
`createBot` call at `recall.ts:98` is the last hold-out but is no longer
called from any code path WS-1 ships (the 3 former call sites moved).

### 5. Drizzle meta journal is stale

`drizzle/meta/_journal.json` stops at migration `0011_fast_rictor` but
SQL migrations `0012` through `0019` exist. WS-2 added `0018_quota_overrides`
and `0019_referral_stripe_txn` without snapshot regeneration, matching
the pattern of `0012`–`0016`. Someone will need to regenerate snapshots
(`pnpm drizzle-kit generate` after reconciling) before the next time we
touch the journal properly.

### 6. Migration number collision with `feat/journey-audit-haute`

Martin's parallel branch added `0017_email_verification_and_lockout.sql`.
WS-2 originally used slot 0017 for `quota_overrides`, which would have
collided on merge. Renumbered proactively to **0018_quota_overrides** and
**0019_referral_stripe_txn** so both branches can merge to main in any
order without further rebasing.

### 7. History rewrite — `git filter-repo` pass

Before the first push to GitHub we discovered the `.git` was 822MB,
dominated by 10 `app/.turbo/cache/*.tar.zst` build-cache tarballs (3 of
them over GitHub's 100MB per-blob limit) plus assorted `*.tsbuildinfo`
incremental-compile outputs. The initial HTTPS push stalled silently
because the rejected blobs never finished uploading.

Fix: `git filter-repo --path app/.turbo --path-glob '*.tsbuildinfo'
--invert-paths --force` across all refs. `.git` dropped 822MB → 129MB.
Content unchanged, every commit SHA rewritten. A pre-filter bundle is
saved at `C:/Users/marti/leads-backups/pre-filter-*.bundle` in case we
ever need to reconstruct the original blobs.

Both paths are already in `.gitignore`, so new commits won't reintroduce
them.

Side effect: any branch that existed at the time of the filter got its
SHAs rewritten too (including Martin's parallel `feat/journey-audit-haute`
and the chore/feat branches). If he had already pushed those somewhere
else, he'd need to force-push; since nothing was published yet, no
external coordination needed.

## Martin's interleaved commits on `feat/WS2-pricing-v2`

Two unrelated commits landed on this branch during the WS-2 build session:
- `828726b` — feat(auth): I5+I6+S2+S5+S7+S8 sign-in/up HAUTE batch
- `dc3693f` — feat(onboarding): O7+O8+O9+O10 visibility, quick wins, welcome
  email, modal a11y

They're mixed into the branch history between WS-2 T2/T3 and T4/T5. The
second one briefly broke the suite (`onboarding-save-api.test.ts` mocked
`@/db` with only `update`, and the new O9 welcome-email path reads
`db.select`). Fixed in `73fdff0` by extending the mock to return an empty
settings row. Merge order to `main` should keep these together or split
them out before merging.

## Scope cuts (flagged for follow-up as WS-2.1)

- Async insert paths not guarded: `inngest/sync-functions`,
  `api/email/sync`, `inngest/campaign-functions`,
  `inngest/onboarding-functions`, `lib/chat/tool-call-log`. These
  auto-create contacts from inbound data and we don't want a silent
  block mid-sync. The synchronous, user-initiated paths (5 of them) are
  fully guarded.
- Admin UI for `tenants.quota_overrides`. The column + merge semantics
  ship; the editor doesn't. Martin writes the jsonb by hand for now.
- Multi-currency credit push. Hardcoded "usd" in `credits.ts` with a
  comment. Customer default-currency read adds a Stripe round trip per
  credit — deferred until we take non-USD customers.
- Yearly billing toggle, proration UX, `automatic_tax`, seat pricing.
  Per office-hours: explicit oceans, not v2.
- `lib/billing.ts`'s back-compat shims (`checkPlanLimit`). Kept so we
  can ship behind the flag without breaking any forgotten caller; remove
  in a cleanup commit after the flag is on in prod.

## Dark rollout plan (how Martin flips the switch)

Recommended sequence, not implemented here beyond the flag existing:

1. Deploy with `PRICING_V2_ENFORCEMENT` unset. Banner ships but guards
   no-op. Watch `/api/billing/quota` for tenants hitting near/over
   thresholds for 24h — sanity check the usage numbers aren't
   misbehaving (e.g. an `email_sent` counter that way over-counts would
   break every trial tenant the moment we flip).
2. Set `PRICING_V2_ENFORCEMENT=on`. Guards start returning 402. Watch
   for quota_exceeded activity log entries + user complaints.
3. If credit-push traffic is clean (`stripe_balance_txn_id` getting
   populated, no stuck `pending` backlog), the WS-1 → WS-2 loop is live.

## Test count delta

| Sprint | Tests (cumulative) |
|---|---|
| Pre-WS-2 | 693 |
| After T1+T2 | 716 (+23 tiers) |
| After T3+T4 | 732 (+16 quota) |
| After T5+T6 | 743 (+11 enforce; +test mock for dc3693f) |
| After T7     | 750 (+7 quota API route) |
| After T8+T9  | 762 (+12 credits) |

All 762 pass. Typecheck clean across `apps/web`.
