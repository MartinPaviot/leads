# RECONCILE.md — Spec 25 Sequence Engine (T0)

> Read-only reconciliation. DB-backed enrollment pause + anti-ICP eligibility exist; the durable enroll/advance conductor with the full precondition stack + step routing does not. The conductor owns no sending/classification — it routes.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Durable step workflow; enroll only if verified (17) + not suppressed (22) + lock acquired (14) | **partial** | `lib/sequences/enrollment-eligibility.ts` checks anti-ICP eligibility; no verified/suppressed/lock stack, no step workflow |
| AC2 | Route each step through the right port (23/24), pull a QC-passed approved variant (20), caps/windows | **missing** | No step-routing engine |
| AC3 | Reply/opt-out → halt + release lock (14) | **partial** | `enrollment.ts` `pauseEnrollment` (DB) exists but no lock release, no engine halt state |
| AC4 | Step delays + cadence; never send before the delay | **missing** | No step state machine |
| AC5 | Idempotent per (contact, step); guard (27) pauses the whole sequence | **missing** | No idempotency / guard-pause |

## Reuse inventory (injected, decoupled)
- spec-17 verified-eligible, spec-22 suppression, spec-14 lock acquire/release, spec-20 variant pull, spec-23/24 send ports, spec-27 guard — all **injected** so the conductor builds off main decoupled and unit-tests with stub ports.
- `lib/sequences/enrollment.ts` (DB pause) + `enrollment-eligibility.ts` — the DB-backed helpers that will wire INTO the engine (the engine is the pure state machine above them).

## Decisions (taken, full autonomy)
1. Build `lib/sequence/*` (singular, per the spec blast radius `sequence/*`): `types.ts`, `engine.ts` (enroll/advance/halt/pause/resume), `index.ts`, tests. Distinct from the existing `lib/sequences/` (plural) DB helpers.
2. **AC1:** `enroll` refuses unless eligible + not suppressed, then acquires the anti-collision lock; a refusal carries the reason.
3. **AC4:** each step has `delayMs`; the enrollment's `dueAt` gates execution — `advance` is a no-op before `dueAt`. `wait` steps only pass time.
4. **AC2:** `advance` routes email→sendEmail / linkedin→sendLinkedIn after pulling a QC-passed approved variant; a step with no available variant does not advance (retried later).
5. **AC3:** `haltSequence` sets `halted` + releases the lock; reply/opt-out (26) calls it.
6. **AC5:** idempotent per `(enrollmentId, stepId)` — a step already `sent` is never re-sent (the index just advances); `advance` pauses the whole sequence when `isGuardTripped`. Halt / pause / completed are first-class terminal/non-advancing states.
7. **No schema** (ports/guards/lock/variant injected) → mergeable off main.
