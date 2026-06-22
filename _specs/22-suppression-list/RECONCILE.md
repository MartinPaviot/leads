# RECONCILE.md — Spec 22 Suppression List (T0)

> Read-only reconciliation. An account-SOURCING suppression ledger exists; the send/enroll compliance suppression (opt-outs, bounces, DNC, competitor/customer domains; address + domain; O(1) hot path) does not.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Entries scoped global + workspace: opt-outs, hard bounces, manual DNC, competitor + existing-customer domains | **missing** | `lib/accounts/suppression.ts` types are `deleted\|excluded` (sourcing removal), no compliance types, no global scope |
| AC2 | Check before enrollment AND each send | **missing** | `filterAllowed*` is a sourcing-time DB filter, not a send/enroll hot-path `isSuppressed` |
| AC3 | Opt-out/bounce → add immediately; opt-out permanent, bounce per policy | **missing** | No ingestion of 26/27 events into suppression |
| AC4 | Domain-level AND address-level | **partial** | Account ledger matches domain/nativeId; address-level email opt-out is new |
| AC5 | Idempotent + O(1) hot path | **partial** | Existing path is a DB query; spec wants O(1) cached lookup |

## Reuse inventory
- `lib/accounts/suppression.ts` `normalizeDomain` / `normalizeEmail` — the normalization to stay consistent with. **Mirrored** (not imported) so the send-hot-path module stays free of the `@/db` coupling that file carries.
- spec-00 contact identity (email/domain) — the suppression target.

## Decisions (taken, full autonomy)
1. Build `lib/suppression/*` (blast radius `suppression/*`): `suppression.ts` (store + check + add + ingestion), `index.ts`, tests.
2. **AC1/AC4:** `SuppressionEntry { scope: 'global'|tenantId, level: 'address'|'domain', value, type, permanent, expiresAt? }`; types = opt_out / hard_bounce / manual_dnc / competitor / existing_customer.
3. **AC2/AC5:** `isSuppressed(target, store)` does a constant number of `Map.get` lookups (global+workspace × address+domain) → O(1); returns the matching hit or null. `InMemorySuppressionStore` is the cache.
4. **AC3:** `suppressionFromOptOut` / `suppressionFromBounce(policy)` map 26/27 events; opt-out/DNC/competitor/customer → permanent, hard bounce → permanent or a cool-off TTL per policy. An expired cool-off no longer suppresses.
5. **AC5 idempotency:** `addSuppression` keyed on `(scope, level, value)` — re-adding merges to the stronger entry (permanent wins, earliest createdAt), stable.
6. **No schema** (injected store + in-memory) → mergeable off main.
