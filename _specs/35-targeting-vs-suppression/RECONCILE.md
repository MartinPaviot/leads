# RECONCILE.md — Spec 35 Targeting vs Suppression (T0)

> Read-only reconciliation gate. Base = `feat/35-targeting-suppression` off
> committed `main` (`0f405d09`, includes spec 22 #338). Verified in the worktree;
> the spec-33 session's uncommitted edits to `sending-gate.ts`/`core.ts` are NOT
> in this base (isolation is intentional — design §0).

## 1. Current state (verified at HEAD)

| Concern | Today | Location |
|---|---|---|
| Reversible targeting | `companies.excludedReason`/`excludedAt` + `deletedAt`; two view-toggles | `core.ts:77-78,107`; `accounts/page.tsx:265-270` |
| Suppression store (read) | `suppression` table, `level` address\|domain, `type` opt_out\|hard_bounce\|manual_dnc\|competitor\|existing_customer, `permanent`, `expires_at`, global/tenant, RLS | `outbound.ts:411-429`; `0089_suppression.sql` |
| Suppression lookup | `addSuppressionDb`/`suppressedDb`/`isSuppressedDb`/`drizzleSuppressionLoader` | `lib/suppression/db-store.ts` |
| Send gate | `isSuppressed(email_optouts)` → `opted_out`, then `isSuppressedDb(suppression)` → `suppressed`, then `enforceSendingIdentity` | `sending-gate.ts:137,148-156` |
| Legacy opt-out store | `email_optouts` (address-only, reasons unsubscribe/bounce_hard/complaint/manual) | `outbound.ts:389-401` |
| Sourcing-removal ledger | `account_suppressions` (kind deleted\|excluded — reversible, sourcing dedup) | `core.ts:140-175` |

## 2. AC verification vs spec 35

| AC area | Verdict | Note |
|---|---|---|
| R1 targeting_status enum | **missing** | no enum/column; state implicit in excludedReason/deletedAt |
| R2 SAFE_MODE | **missing** | only `OUTBOUND_TEST_MODE` env exists (`recipient-guardrail.ts:33`) |
| R3 store EMAIL/DOMAIN | **present (spec 22)** | reuse `suppression` table + db-store |
| R3 ACCOUNT scope | **missing** | `level` has no `account`; add value=identityKey |
| R3 status/source/actor/history | **missing** | table has none; add 5 cols + reuse `logAudit` |
| R4 permanence enforcement | **missing** | `permanent` flag only; no anti-delete |
| R4 complaint type / already-customer | **partial** | `existing_customer` ≈ ALREADY_CUSTOMER; `complaint` absent |
| R5 gate suppression (addr/domain) | **present (spec 22)** | gate already calls `isSuppressedDb` |
| R5 targeting + account scope | **missing** | new check-3 + thread contactId/companyId |
| R6 re-application import/restore | **missing** | `filterAllowed` (`lib/accounts/suppression.ts:186`) called by NO build path; `addSuppressionDb` has zero prod callers |
| R8 backfill | **missing** | see §3 |

## 3. Backfill ownership (decision)

Spec 22's RECONCILE explicitly ships **no schema/data backfill** (in-memory pilot;
the `suppression` table + db-store landed later as a read-path pilot, #338). Its
26/27 ingestion is **still unwired** (`addSuppressionDb` has zero production
callers — verified). Therefore:

- **Spec 35 owns** the `email_optouts → suppression` consolidation (R8.2) in T13.
- **Not go-live-blocking for correctness**: the gate checks `email_optouts` FIRST
  (`sending-gate.ts:137`), so every existing unsubscribe/bounce/complaint is still
  enforced via the legacy path even before consolidation. Keep that legacy check
  during transition (belt-and-suspenders).
- `account_suppressions` kind `excluded`/`deleted` → **targeting only** (map to
  `archived`), never consent (R8.4).
- `companies.excludedReason = 'do_not_contact_request'` → `suppression`
  `level=account`, `type=manual_dnc` (R8.5).

## 4. Data inventory (queries to run on dev at T13)

Live counts captured at T13 execution on `leadsens-localdev` (not fabricated here):

```sql
SELECT reason, count(*) FROM email_optouts GROUP BY reason;          -- R8.2 sources
SELECT kind, count(*) FROM account_suppressions GROUP BY kind;       -- R8.4 (targeting, not consent)
SELECT count(*) FROM companies WHERE excluded_reason = 'do_not_contact_request'; -- R8.5
SELECT count(*) FROM meeting_opt_outs;                               -- R8.3
SELECT (excluded_reason IS NOT NULL) AS excluded, (deleted_at IS NOT NULL) AS deleted, count(*)
  FROM companies GROUP BY 1,2;                                       -- R8.6 targeting backfill split
```

## 5. Locked decisions

- **Migration indices**: committed high-water was `0090` at audit time; `main`
  has since advanced to `0091_contact_lawful_basis` + `0092_enrollment_lock`, so
  spec 35 now uses **0093 / 0094 / 0095** (targeting_status / suppression-columns
  / permanence-trigger). Re-check at merge (main may advance further).
- **Rollout guard**: env `TARGETING_GATE_ENABLED` (default **off**). Check-3
  (targeting/SAFE_MODE) is inert until flipped on (T14), after the T13 backfill —
  honours "no change to real outreach behavior". Suppression checks are NOT
  guarded (already live, only safer).
- **Account key**: `companies.identityKey` (fallback `companies.id`), survives
  re-import (R6.4).
- **Permanence frozen set**: `opt_out` + `complaint` only; `manual_dnc` /
  `existing_customer` admin-deactivatable (R4.2).

`=== GATE: reconciliation reviewed — proceed to T1 ===`
