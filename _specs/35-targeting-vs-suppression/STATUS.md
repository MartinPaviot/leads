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

## Done + verified (added)

| T11 | Account-page UI: detail API returns targeting_status + active account/
domain suppression badges; `_targeting-suppression-panel` (read-only badge,
manual DNC, admin deactivate); mounted in detail header | RTL (4 cases) + 42
account tests green, tsc green |

Verification totals: tsc green (whole web app); 77 spec-35 tests + 42 account
tests green (pure logic, db-store, gate check-3, 5 chokepoints, panel UI).

## DB-level verified on localdev (`DATABASE_URL_LOCALDEV`, project mrxxeuozlzgwsuojebad)

`DATABASE_URL` = prod (wdgwytpaxuvgigqgzxrw); `DATABASE_URL_LOCALDEV` is the dev DB.
Applied to localdev (idempotent): `0089_suppression` (prereq — localdev was behind),
`0093/0094/0095`. Verified via rolled-back transactions (zero residue):

- T9 permanence trigger: opt_out DELETE blocked, opt_out status-weaken blocked,
  opt_out benign reason-edit allowed; complaint DELETE blocked; manual_dnc
  deactivate + delete allowed (R4.1/R4.2/R4.3).
- T13 backfill: runs clean + idempotent (localdev has no seed data -> 0 rows
  migrated); targeting CASE verified clean->targeted, excluded->archived,
  deleted->archived (R8.6).

Note: applied via a one-off (not the `__elevay_migrations` runner) since the
runner breaks at idx 12; SQL is idempotent so dev state is correct. Prod apply is
ops-gated (do not migrate prod wdgwytpaxuvgigqgzxrw from this branch).

## Remaining — only the live UI walkthrough (human OAuth)

- **T14 visual eval**: run the dev server against localdev, flip
  `TARGETING_GATE_ENABLED=on` (after seeding/backfill on a populated DB), Playwright
  E1-E12 + a design-review of the badge. Needs a human OAuth login (memory
  `playwright-session-idle-logout`). Gate logic itself is unit-covered (8 check-3
  cases + precedence + fail-closed) and the DB safety net is verified above.
- **Prod rollout** (post-merge): apply 0093-0095 to prod (ops), run the backfill,
  then flip `TARGETING_GATE_ENABLED=on`. Merge gates on full CI.

## UI follow-up (polish, not blocking)

- Admin-gating of the Deactivate button is server-enforced (403); client-side
  hide-for-non-admins is a polish item (no role hook wired into the panel yet).

## Migrations to apply (dev, then ops-gated prod)

`0093_targeting_status.sql`, `0094_suppression_status_source.sql`,
`0095_suppression_permanence.sql` — all additive + idempotent. (Renumbered from
0092-0094 after `main` advanced to `0092_enrollment_lock`; re-check at merge.)
