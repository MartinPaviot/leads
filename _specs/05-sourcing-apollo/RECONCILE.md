# RECONCILE.md — Spec 05 Sourcing: Apollo (T0)

> Read-only reconciliation, 5-finder audit, cited `file:line`. Heavy overlap with existing TAM sourcing + the just-merged spec-01 adapter. The mapping logic is battle-tested but **bypasses the spec-01 adapter** and **leaks Apollo vendor types** into blind DB inserts.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | `CanonicalICPQuery` → Apollo request (person+org) via the spec-01 adapter | **partial** | Mature `criteriaToApolloParams`/`icpToStrategy` mapping exists but hand-rolls `OrgSearchParams`; no `CanonicalICPQuery`; adapter is org-only (no person facet) |
| AC2 | Paginate to volume within caps (100/pg, 50k max); count-only credit-free | **partial** | `per_page=100` everywhere + a real count-only `/api/tam/estimate` (reads `total_entries`); **no** 50k cap (loops bound to 3/6/10 pages), not through the adapter, count route unmetered |
| AC3 | Normalize to canonical (no vendor leak) + persist via spec-00 upserts | **missing** | Blind `db.insert` leaks `OrgSearchOrganization`/`ApolloPerson` into `properties` (`apollo_id`, …); `fromProviderResponse` used by no sourcing path; no spec-00 upsert |
| AC4 | No enrichment in search | **satisfied** | Search path is credit-free; `/api/tam/estimate` proves count without `enrichOrganization` |
| AC5 | Meter credit-consuming calls + segment budget | **partial** | Not metered today; spec-02 `meter()` is on an unmerged branch → inject it |

## AC1 — query mapping — `partial`
- The canonical ICP query today is `Criterion[]` (`icp/criteria-engine.ts:21-28`) from `icps`/`icp_criteria` (`schema/icp.ts:74`); **no `CanonicalICPQuery` type** (grep = 0). The mapping `criteriaToApolloParams` (`icp/to-apollo-params.ts:75-101`) is driven by `field-catalog.ts:68-86` (`apolloParam` per fieldKey), wrapped by `icpToStrategy` (`icp-to-tam.ts:43-69`), tested. It **hand-rolls `OrgSearchParams`** and never touches `apolloCompanySearchAdapter` (`providers/apollo/search-adapter.ts:116` — imported only by its own test + port.ts).
- Person filters live separately (`icp/person-targeting.ts:35-41` `person_titles`/`person_seniorities`); the spec-01 adapter is **org-only**.
- **Delta:** add `CanonicalICPQuery`, map `Criterion[]` → spec-01 `CompanySearchQuery` and call `adapter.toProviderRequest`; extend the adapter (or a people sibling) for person filters so one Flow-A request covers person+org. Reuse `field-catalog` as the field→param source of truth.

## AC2 — pagination + count — `partial`
- `per_page=100` universal (`apollo-client.ts:268`); count-only `/api/tam/estimate` (`estimate/route.ts:53-56,91-98`, `per_page=1` reading `total_entries`, no enrichment — the strongest reuse). Pagination loops are bound to 3/6/10 pages (`api/tam/route.ts:258`, `tam/build/route.ts:55`, `tam-builder/handler.ts:91`); **no 50k cap**, not segment-volume-driven, not through the adapter.
- **Delta:** `paginateOrgSearch(request, targetVolume)` looping the adapter at `per_page=100` until `min(targetVolume, total_entries, 50000)` (page≤500 guard); count-only mode = one `per_page=1` metered call.

## AC3 — normalize + persist — `missing`
- No `CanonicalAccount`/`CanonicalContact` type (prose only in `port.ts`); the lone neutral shape is the adapter's `EnrichedCompany` (company-only, no neutral contact). Every path leaks raw Apollo types into blind inserts: `tam-stream/per-company.ts:175-200` writes `apollo_id`/`enrichment_source` into `properties`; `api/tam/route.ts`, `voice/source-prospects.ts` likewise. `fromProviderResponse` used by none. No `onConflictDoUpdate`/identity upsert. Spec-00 `upsertAccount`/`upsertContact` don't exist on main (unmerged feat/00).
- **Delta:** normalize via `adapter.fromProviderResponse` (+ a contact-side mapping), persist via **injected** spec-00 `upsertAccount`/`upsertContact` (decoupled from the unmerged branch). None of the blind-insert paths are reusable as-is.

## AC4 — no enrichment in search — `satisfied`
- The search path is credit-free; `/api/tam/estimate` counts without `enrichOrganization`. Keep sourcing enrichment-free (08/17 own it).

## AC5 — metering + budget — `partial`
- No metering on sourcing today; `meter()` (spec 02) is on the unmerged branch.
- **Delta:** wrap credit-consuming calls in the **injected** spec-02 `meter()` + check the segment budget; count-only is one metered cheap call.

## Reuse inventory
- **`apolloCompanySearchAdapter` (spec 01, merged on main)** — the mapping boundary; reuse `toProviderRequest`/`fromProviderResponse` directly.
- `field-catalog.ts` + `criteriaToApolloParams` — the field→Apollo-param source of truth (feed the `CompanySearchQuery` mapping).
- `/api/tam/estimate` — the count-only-credit-free pattern.
- `apollo-client.searchOrganizations` + `OrgSearchResult.pagination.total_entries` — pagination primitive.

## Decisions (taken, per full-autonomy grant)
1. Build `sourcing/apollo/*` as `sourceAccounts(segment, mode, deps)` reusing the merged spec-01 adapter; **inject** spec-00 `upsert*` + spec-02 `meter()` (both parked) so feat/05 builds off main.
2. Extend the adapter's `CompanySearchQuery` with optional person filters (`titles`/`seniorities`) so AC1's person+org is one request — small, additive to the merged adapter.
3. Tests against recorded fixtures (no live Apollo in CI); count-only proven credit-free.

**Schema-changing?** No new tables — persistence is via the (parked) spec-00 upserts. So **feat/05 has no migration** and is **mergeable** once spec 00 merges (it imports the injected upsert at the composition root). Pure code; CI-mergeable like spec 01.
