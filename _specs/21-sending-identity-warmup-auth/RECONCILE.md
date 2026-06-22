# RECONCILE.md — Spec 21 Sending Identity, Warmup and Auth (T0)

> Read-only reconciliation. Substantial cold-email infra exists (as the spec warned: "prefer wrapping"). The warmup ramp and the domain auth-flag model are reused; the DNS auth gate (DKIM 2048-bit), warmup-aware capacity, and the mixed-provider pool are the delta.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Register domain → mailboxes (2–3/domain), provider, daily cap, warmup state | **partial** | `deliverability/types.ts` `SendingDomain` has cap/warmup/auth flags; no explicit mailbox-per-domain registry with the 2–3 target + provider |
| AC2 | Verify SPF, DKIM (2048-bit), DMARC; not-sendable until all pass | **partial** | `SendingDomain` carries spf/dkim/dmarc booleans; `inbox/sender-auth.ts` parses *received* headers (wrong direction); no DNS verify of the sending domain + 2048-bit gate |
| AC3 | Per-mailbox warmup ramp from low across the window | **already** | `deliverability/warmup.ts` `getWarmupDailyTarget` (28-day ramp 2→50) + `isWarmupComplete` — REUSED |
| AC4 | Warming caps real sends to schedule, counted inside the daily ceiling | **partial** | `sentToday` + `dailyCapacity` exist; the warmup-aware effective cap is new |
| AC5 | Mixed-provider pool target + capacity per day | **missing** | No capacity-per-day / per-provider exposure |

## Reuse inventory (wrap, do not duplicate)
- `lib/campaign-engine/deliverability/warmup.ts` — `getWarmupDailyTarget` / `isWarmupComplete` (the AC3 ramp). **Imported and reused** so the methodology schedule (4-week, 2→50/day) is not restated.
- `lib/campaign-engine/deliverability/types.ts` — `SendingDomain` model (spf/dkim/dmarc flags, warmupStartedAt, dailyCapacity, sentToday).
- `lib/guardrails/sending-identity.ts` — `enforceSendingIdentity` (primary-domain protection) stays the per-send guardrail; spec-21 is the registry/capacity layer above it.

## Decisions (taken, full autonomy)
1. Build `lib/sending/identity/*` (blast radius `sending/identity/*`): `auth.ts` (AC2), `capacity.ts` (AC1/AC4/AC5 wrapping the warmup ramp), `index.ts`, tests.
2. **AC2:** `verifyAuth(domain, records)` / `verifyDomainAuth(domain, lookup)` — injected DNS/provider lookup; `sendable = spf && dmarc && dkim.pass && dkim.bits ≥ 2048` (`MIN_DKIM_BITS`). Not-sendable until all three pass.
3. **AC3/AC4:** `effectiveDailyCap(mailbox)` = `min(getWarmupDailyTarget, dailyCap)` while warming else `dailyCap`; `sentToday` already counts warmup volume → capacity subtracts it (warmup inside the ceiling).
4. **AC1/AC5:** `registerIdentity(domain, mailboxes)` validates the 2–3-per-domain target; `getSendableCapacity(mailboxes, authByDomain)` → per-mailbox available (0 when not auth-sendable), `totalAvailable`, and `byProvider` (the mixed-provider pool).
5. **No schema** (records/lookup injected; reuses the existing domain model) → mergeable off main.
