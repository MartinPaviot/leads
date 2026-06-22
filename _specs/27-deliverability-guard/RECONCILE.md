# RECONCILE.md — Spec 27 Deliverability Guard (T0)

> Read-only reconciliation. A 7-day-snapshot health model exists on `SendingDomain`; the rolling-from-events guard with provider-specific pause thresholds, cool-off + ramp-back resume, and hard-bounce suppression does not.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Per-mailbox/domain rolling bounce, spam, send/reply health from events | **partial** | `deliverability/types.ts` `SendingDomain` carries `bounceRate7d`/`complaintRate7d`/`healthScore` snapshots; no rolling computation from send/reply events |
| AC2 | Pause on bounce/spam breach (provider-specific, Microsoft stricter) + alert | **missing** | No threshold-breach pause; no provider-specific spam thresholds |
| AC3 | Hard bounce → suppression (22) | **missing** | No bounce→suppression wiring |
| AC4 | Resume only after cool-off, ramping back | **missing** | No recovery/ramp-back |
| AC5 | Expose health + threshold state (dashboard, weekly agent 31) | **partial** | `DomainHealthReport` exists but not the guard's threshold state |

## Reuse inventory
- `lib/campaign-engine/deliverability/types.ts` — `SendingDomain` health fields, `DomainHealthReport` (the snapshot model the guard's rolling metrics complement).
- spec-22 `addSuppression` — the hard-bounce sink (AC3); the guard exposes the pure `hardBounceAddresses`, the caller wires spec-22.

## Decisions (taken, full autonomy)
1. Build `lib/deliverability/*` (blast radius `deliverability/*`): `thresholds.ts` (config SSOT), `guard.ts` (metrics + evaluate + pause/resume), `index.ts`, tests. Fully deterministic.
2. **Thresholds config SSOT (no methodology.md present in repo):** `DEFAULT_THRESHOLDS` — bounce pause 5% / warn 3%; spam pause Gmail 0.3%, **Microsoft 0.1% (stricter)**; `minSampleForPause` so tiny samples don't trip; `coolOffMs`. One place, referenced not duplicated.
3. **AC1:** `computeHealth(scope, provider, events, window, now)` — rolling counts/rates over the window.
4. **AC2:** `evaluateHealth` flags breaches (bounce ≥ pause OR spam ≥ provider threshold, given enough sample); `pause(state, reason)` is idempotent + carries an alert reason.
5. **AC3:** pure `hardBounceAddresses(events)` → the caller adds to spec-22 suppression.
6. **AC4:** `resumeIfRecovered` resumes only after the cool-off AND rates below safe, at a reduced `rampLevel` (ramp-back, not full volume); `rampUp` grows it.
7. **AC5:** the `Health` + `GuardState` objects expose rates, breaches, status, and ramp level. **No schema** (events passed in; suppression injected) → mergeable off main.
