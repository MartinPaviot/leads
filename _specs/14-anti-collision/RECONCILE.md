# RECONCILE.md — Spec 14 Anti-Collision (T0)

> Read-only reconciliation (targeted scout — small, well-defined spec). An existing `lib/collision/*` module handles **multi-user rep attribution** ("which teammate touched this prospect recently") — a *different* concern from spec 14's **cross-campaign enrollment lock**. The enrollment lock + overlap detection are new.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Acquire a lock on contact identity at enroll; block + record collision if held | **missing** | `lib/collision/recent-touch.ts` is rep-touch awareness, not an enrollment lock; no `acquireEnrollmentLock` |
| AC2 | Detect accounts targeted by >1 active campaign + surface overlap | **missing** | No cross-campaign overlap detection (`recent-touch` is per-contact rep touches) |
| AC3 | Release the lock on complete / reply / opt-out | **missing** | No lock to release; reply/opt-out events (spec 26) exist but no release hook |
| AC4 | Idempotent under concurrency: one winner | **missing** | No atomic acquire |

## Reuse inventory
- `lib/infra/rate-limit-store.ts` — the **Upstash REST atomic pattern** (`SET`/`INCR` via pipeline) to back a `SET NX PX` lock; falls back to in-memory when Upstash isn't configured.
- `db/schema/outbound.ts` `sequence_enrollments` (`status` enum, default `active`) — the active-enrollment source for overlap detection.
- spec-07 dedup `canonicalIdentityKey` for contacts — the lock key (clean identity).

## Decisions (taken, full autonomy)
1. Build `lib/anti-collision/*` (distinct from `lib/collision/*`, which stays the rep-touch concern).
2. **AC1/AC4:** `acquireEnrollmentLock(contactId, enrollmentId, deps)` over an **injected** `CollisionLock` (atomic `SET NX PX`); InMemory impl for tests (proves one-winner under concurrency), Upstash-REST impl for prod. A blocked acquire records a collision via the injected recorder.
3. **AC3:** `releaseEnrollmentLock(contactId, deps)` — idempotent; the caller wires it to complete/reply/opt-out. TTL safety net on the lock for crashed enrollments.
4. **AC2:** `detectAccountOverlap(activeEnrollments)` — pure: group active enrollments by account, surface accounts with >1 distinct campaign.
5. Lock injected → **no schema → mergeable** off main. Concurrency + release + overlap unit-tested with the in-memory lock.
