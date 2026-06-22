# RECONCILE.md — Spec 07 Identity Resolution and Dedup (T0)

> Read-only reconciliation, 5-finder audit. The single-record identity/merge lives in spec 00 (parked); spec 07 is the **run-level cross-provider collapse** on top of it, which exists nowhere.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Dedup accounts by identity key (domain→legal_id→name+country) across a run | **missing** | No `dedupeRun`/`MergeReport`; `canonicalIdentityKey` + `auditAccountQuality` *report* dupes but never collapse; `findCompanyDuplicate` is pairwise, domain+fuzzy-name, no legal_id, no run |
| AC2 | Merge by provider precedence, recompute `canonical_fields`, preserve provenance | **partial** | spec-00 (parked) does this **per single record** (`precedence.ts` `pickWinner`, `computeCanonicalFields`); no **cross-record** union-merge; the only live merge (`agentic-executor`) is fill-empty, no precedence/provenance |
| AC3 | Dedup contacts by verified email + `linkedin_url` | **partial** | `findContactDuplicate` keys on raw email + name fuzzy; **no `linkedin_url`** path; no "verified" distinction |
| AC4 | Merge-not-duplicate; below threshold → `needs-review` | **missing** | Fuzzy matching guess-merges; no threshold, no review status |
| AC5 | Idempotent re-run | **partial** | The pure key/group fns are order-independent; but there's no run-level dedup to be idempotent |

## Reuse inventory
- `lib/companies/identity.ts` — `canonicalIdentityKey` (siren→uid→domain→name) + `normalizeCompanyName` + `auditAccountQuality` (the grouping). **The grouping seed.** Add a country qualifier to the name tier.
- spec-00 (parked) `db/canonical/precedence.ts` `pickWinner`/`PROVIDER_RANK` + `computeCanonicalFields` — **inject** these (the cross-record merge resolves the union with the same precedence).
- `lib/import/dedup.ts` `findContactDuplicate` — extend with a linkedin key (don't reuse the pairwise account path).

## Decisions (taken, full autonomy)
1. Build `lib/dedup/*`: a **pure** run-level engine + a thin store-injected orchestrator. No schema (provenance lives in spec-00's field_source) → **mergeable** off main.
2. **AC1:** `groupByIdentity(accounts)` groups by `canonicalIdentityKey` (reuse). One survivor per group.
3. **AC2:** `collapseGroup(group, pickWinner)` — pick a deterministic survivor (lowest id → order-independent), **union** all field-source provenance, recompute canonical via the **injected** `pickWinner` (spec-00 precedence). The store re-points losers' `*_field_source` to the survivor.
4. **AC3:** `dedupeContacts` keys on lower(email) then `linkedin_url`.
5. **AC4:** a fuzzy near-match pass (normalized string similarity) over name-only/unkeyed accounts — `>= threshold` merges, `< threshold` (ambiguous) → `needs-review`, far-apart → kept. A compact Levenshtein-ratio (no new dep) backs it.
6. **AC5:** idempotent — re-running over an already-collapsed set yields singleton groups → `{merged:0, reviewed:0, kept:N}`; merge is order-independent.

`dedupeRun(accounts, contacts, deps): MergeReport{merged, reviewed, kept, ...}`. Pure logic unit-tested with stubs; the DB load/re-point is injected.
