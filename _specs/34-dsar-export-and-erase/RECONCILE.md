# RECONCILE.md — Spec 34 DSAR Export and Erase (T0)

> Read-only reconciliation. Cascade-delete primitives exist; the DSAR-compliant orchestration (export, verified erase, CRM propagation, do-not-resurrect, suppression) does not. Erasure is destructive — gated + verified.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Compile all data held (canonical, provenance, activity, CRM) into an export | **missing** | No DSAR export |
| AC2 | Erase/anonymize across stores + caches, propagate to CRM, add suppression (22) | **partial** | `lib/contacts/cascade-delete.ts` deletes a contact; no DSAR orchestration / CRM propagation / suppression |
| AC3 | Complete within the legal window + audit | **missing** | — |
| AC4 | Re-sourced erased person re-suppressed (permanent do-not-resurrect marker) | **missing** | — |
| AC5 | Idempotent + verifiable (no residual personal data) | **missing** | — |

## Reuse inventory (injected)
- `lib/contacts/cascade-delete.ts` / `accounts/cascade-delete.ts` — the erase primitives (injected as `eraseCanonical`).
- spec-22 suppression (`addSuppression`), spec-28 CRM (`propagateCrm`) — injected.

## Decisions (taken, full autonomy)
1. Build `lib/compliance/dsar/*` (blast radius `compliance/dsar/*`): `export.ts` (`exportSubject`), `erase.ts` (`eraseSubject`, `checkResurrection`), `index.ts`, tests. Fully deterministic over injected stores.
2. **AC1:** `exportSubject` compiles canonical + provenance + activity + CRM from injected readers, stamped `compiledAt`.
3. **AC2:** `eraseSubject` erases canonical, clears caches, propagates to the CRM, adds spec-22 suppression, and sets a **permanent do-not-resurrect** marker.
4. **AC5 verify:** an injected `findResidual` scans managed stores after erase; `verified = residual.length === 0`. Idempotent — re-running an already-erased subject still verifies clean.
5. **AC4:** `checkResurrection` re-suppresses a re-sourced person when the DNR marker is present — never re-contacted.
6. **AC3:** the erase is timed against the configured window; the report + audit entry record the request and actions.
7. **No schema** (stores/erase/suppression/CRM/marker injected) → mergeable off main.
