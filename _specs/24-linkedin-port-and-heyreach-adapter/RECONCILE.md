# RECONCILE.md — Spec 24 LinkedIn Port and HeyReach Adapter (T0)

> Read-only reconciliation. A generic stubbed dispatch channel-adapter exists; the typed LinkedInPort + HeyReach adapter + daily limits + guards + idempotency do not. Mirrors spec 23's send port.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | `LinkedInPort` (connect/message/status) + HeyReach adapter; profileUrl identity; customUserFields `[a-z0-9_]` | **missing** | `lib/sequence-dispatch/linkedin-adapter.ts` is a stub `ChannelAdapter` (isAvailable=false, Expandi/Unipile follow-up); no HeyReach, no connect/status, no profileUrl contract |
| AC2 | Per-sender-account daily action limits (connects + messages) | **missing** | No limits |
| AC3 | Refuse suppressed (22) + respect anti-collision (14) | **missing** | Guards exist (merged); gating new |
| AC4 | Idempotent per (stepId, contactId) | **missing** | No idempotency |
| AC5 | Meter actions + emit events (29) | **missing** | No metering/events |

## Reuse inventory (injected, decoupled)
- spec-22 `isSuppressed`, spec-14 anti-collision lock — injected as predicates (`isSuppressed`, `isCollisionLocked`).
- spec-02 `meter` — injected.
- `lib/sequence-dispatch/linkedin-adapter.ts` — the existing stub stays the dispatcher's generic channel; spec-24 `LinkedInPort` is the dedicated typed port the HeyReach adapter implements (sequence engine 25 will consume it).

## Decisions (taken, full autonomy)
1. Build `lib/sending/linkedin/*` (port + limits + orchestration) and `lib/providers/heyreach/*` (adapter). Blast radius `sending/linkedin/*`, `providers/heyreach/*`.
2. **AC1:** `LinkedInPort { connect, message, status? }`; `HeyReachAdapter` keyed on `profileUrl`; `toHeyReachCustomFields` keeps scalar values under keys matching `^[a-z0-9_]+$` (invalid keys dropped + reported).
3. **AC2:** `DEFAULT_LINKEDIN_DAILY_LIMITS` (connect 20, message 100 — platform-safe); `withinDailyLimit(action, doneToday)` gates per sender account.
4. **AC3:** refuse `suppressed` then `collision-locked` before any spend; also refuse `no-profile` (profileUrl is the identity).
5. **AC4:** `runLinkedInAction` dedupes on `(stepId, contactId)` via an injected store — retry after success returns the prior result, single provider call.
6. **AC5:** metered action + `linkedin_action_event`; typed 4xx terminal, 5xx bubbles.
7. **No schema** (guards/store/meter/event injected) → mergeable off main.
