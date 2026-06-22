# RECONCILE.md — Spec 06 Sourcing: Registries (T0)

> Read-only reconciliation, 5-finder audit, cited `file:line`. Rich FR + CH registry clients already exist, but **none are on the spec-01 port**, none emit a `CanonicalAccount` with `legal_id`, and there's no code→NAICS mapping, cache, or field-level enrich.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1-FR | Pappers/SIRENE adapter on the spec-01 port, keyed SIREN/SIRET | **partial** | `pappers-client`/`recherche-entreprises-client` + discovery sources exist, but bespoke (only `ApolloCompanySearchAdapter` implements the port); **SIRET never captured** |
| AC1-CH | Zefix adapter on the port, keyed UID | **partial** | `zefix-client`/`zefix-lindas-client` + `zefix-lindas-adapter` exist on the **legacy** port; the adapter **drops the UID** |
| AC2 | `CanonicalAccount` w/ `legal_id` + firmographics | **partial** | Firmographics returned (NAF, effectif band, address) on bespoke shapes; no `CanonicalAccount`/`legal_id` type; SIREN travels as `nativeId` |
| AC3 | NAF/APE + NOGA → NAICS via normalizers | **missing** | No code→NAICS table; `sirene-adapter` maps NAF section letter → French label; `industryToNaics` (spec 01) is label→NAICS, unwired; Zefix carries no NOGA |
| AC4 | Meter + budget + long-TTL cache | **missing** | Cost is telemetry only (never persisted/budget-checked); **no cache** — registry data re-fetched every call |
| AC5 | `enrichFromRegistry(account, fields)` field-level path | **missing** | grep = 0; registries are bulk-source/enrich-adapter only |

## Reuse inventory (strong)
- `integrations/pappers-client.ts` — `searchCompaniesPappers({code_naf,region,tranche_effectif})` → `PappersCompany{siren,name,codeNaf,libelleNaf,...}`, `companyDomainBySirenPappers(siren)`.
- `integrations/recherche-entreprises-client.ts` — `searchCompaniesSirene`, `companyDetailBySiren`, `enrichCompanyByNameSirene` → `SireneCompany{siren,naf,effectifTranche,city,departement,...}` (keyless).
- `integrations/zefix-client.ts` + `zefix-lindas-client.ts` — `ZefixFirm{uid,canton,legalForm,...}` (key-gated REST + keyless LINDAS/SPARQL fallback).
- `icp/to-pappers-params.ts` / `to-sirene-params.ts` — criteria → registry search params.
- `integrations/pappers-codes.ts` — `NAF_BY_INDUSTRY` (inverse) + INSEE effectif tranches.
- `providers/normalizers/industry.ts` (spec 01) — `industryToNaics(label)`.
- spec-01 `ProviderAdapter` port (merged); spec-00 `*_field_source` (parked) for the cache.

## Decisions (taken, full autonomy)
1. Build `sourcing/registry/*`: pure mappers `PappersCompany`/`SireneCompany`/`ZefixFirm` → `CanonicalRegistryAccount` (with `legal_id` = `fr:<siren>`/`ch:<uid>`, firmographics, NAF/NOGA→NAICS), wrapping the existing clients (injected). No new integration code.
2. **AC3:** add `providers/normalizers/activity-codes.ts` — `nafToNaics(code)` + `nogaToNaics(code)` tables (the blast radius puts the table here). Capture SIRET when present.
3. **AC4:** inject a `RegistryCache` (get/set + long TTL) — default backed by spec-00 `*_field_source` (injected) — and the spec-02 `meter()`; both decoupled so feat/06 builds off main.
4. **AC5:** `enrichFromRegistry(account, fields, deps)` resolves specific fields from a registry by `legal_id`, cache-first, for spec 08's waterfall.
5. CanonicalRegistryAccount is the neutral output (no vendor type escapes); persist via injected spec-00 upsert.

**Schema-changing?** No — cache via injected `*_field_source`; no new table → **mergeable** off main (like 05). Pure code + tests against fixtures (no live registry call in CI).
