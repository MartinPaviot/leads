# 35 — Build status

Branch `feat/35-targeting-suppression` (git worktree off committed `main` 0f405d09,
isolated from the spec-33 session's uncommitted edits). `TARGETING_GATE_ENABLED`
defaults **off** ⇒ zero change to live outreach until T14 flips it after T13.

## Done + verified (tsc green, 73 targeted tests green)

| Task | What | Verify |
|---|---|---|
| T0 | RECONCILE.md (base state, backfill ownership, locked indices 0092-0094) | committed |
| T1 | targeting_status pgEnum + companies column + index + migration 0092 | tsc |
| T2 | suppression status/source/actor/deactivation cols + account level + complaint type + migration 0093 | tsc |
| T3 | pure suppression: complaint type, account scope, accountKey target | unit (3 cases) |
| T4 | db-store: account loader + active filter, audited addSuppressionDb, deactivateSuppressionDb, isConsentSuppressed/filterConsentSuppressed | unit (existing + injected) |
| T5 | safeModeEnabled tenant setting (default true) | tsc |
| T6 | lib/targeting/status: loadTargetingStatus + loadAccountGateContext (fail-closed) + dual-write into exclude/batch/restore | tsc |
| T7 | evaluateSend check-3 (SAFE_MODE targeting, guarded, interactive-exempt, fail-closed) + account-scope suppression + not_targeted code | unit (8 cases) |
| T8 | thread contactId/interactive into all 5 chokepoints | tsc + 5 chokepoint tests |
| T9 | permanence trigger (0094) freezing opt_out/complaint | SQL trigger written (DB-level test pending dev DB) |
| T12 | manual-DNC add + admin-deactivate API routes | tsc |
| T13 | T0 backfill script (idempotent) | written (run pending dev DB) |

## Satisfied by design (no risky hot-path edits)

- **T10 (R6 re-application)**: suppression is keyed by durable identifiers
  (email / domain / canonical `identity_key`) and the gate checks **live**, so a
  re-imported or TAM-rebuilt identity is automatically re-caught with no
  import-time code. Restore's `liftSuppression` touches the separate
  `account_suppressions` sourcing ledger (`core.ts:140`), never the consent
  `suppression` table — so restore cannot clear consent (R6.1). The
  `filterConsentSuppressed` helper exists for optional import-time hardening +
  future 26/27 ingestion.

## Remaining (need the running app / dev DB)

- **T11 — Account-page UI**: read-only suppression badge (type/scope/date/source),
  manual "Do not contact" action, admin deactivate, targeting control. Needs (a)
  account-detail API to return targeting_status + suppression summary, (b)
  components on `accounts/[id]/page.tsx`, (c) live design-review pass (memory
  `feedback_inbox-feel-gap`). Built + verified against the dev server, not blind.
- **T13 run / T14 eval**: run the backfill on `leadsens-localdev`, capture counts,
  flip `TARGETING_GATE_ENABLED=on`, run the E1-E12 acceptance + DB-level trigger
  test, then merge on PASS. Prod migration ops-gated.

## Migrations to apply (dev, then ops-gated prod)

`0092_targeting_status.sql`, `0093_suppression_status_source.sql`,
`0094_suppression_permanence.sql` — all additive + idempotent.
