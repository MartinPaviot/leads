# ICP → Accounts audit (2026-06-02)

Hostile-QA pass: does the system state match what we **defined** for Pilae's
two ICPs? Tenant `47dca783` ("E2E Test Workspace", Martin's login).

## Headline: expected ~660, actually 0 sourced

- Dry-run reported **544 (ICP-1) + 116 (ICP-2) = 660**. That is Apollo's
  `total_entries` — how many companies *exist* matching the search params.
  It was **never** a count of accounts sourced into the tenant.
- `companies` on tenant: **109**, every one with **no `properties.source`** →
  **0 came from Build TAM** (TAM inserts carry `source:"tam"`). The 109 are
  pre-existing E2E fixtures (89 null industry, 10 IT&services, 2 financial,
  plus medical/retail/machinery noise) — they match **neither** ICP.
- `company_icp_fit`: **0 rows** for both ICPs. Nothing has ever been scored
  against the two ICPs.

## Why no build ran — BUG (fixed)

`GET /api/icps` counts criteria/fit with a correlated subquery. Drizzle
renders `${icps.id}` as a **bare, unqualified `"id"`**:

```sql
(SELECT count(*)::int FROM icp_criteria WHERE icp_criteria.icp_id = "id")
```

`icp_criteria` has its own `id`, so `"id"` binds to the inner table →
`icp_criteria.icp_id = icp_criteria.id` → **always 0**. Same for
`company_icp_fit`. The UI gates "Build TAM" on `criteriaCount > 0`, so the
button was **permanently disabled for every tenant**. DB had 8 criteria each
the whole time.

- **Fixed** `src/app/api/icps/route.ts` → qualify literally `"icps"."id"`.
  Verified live: both ICPs now report `criteria=8`.
- **Same footgun fixed** in `src/app/api/eval/datasets/route.ts` (caseCount,
  admin-facing).
- **Flagged, not fixed**: `src/lib/context/relationship-graph.ts:330`
  (`entity_id = ${contacts.id}` → binds to `context_graph_nodes.id`). Same
  pattern; needs its own test before touching warm-path logic.

## Structural caps — why a build still won't give 600+

1. **Page cap.** `tam/build` uses `MAX_PAGES_PER_STRATEGY = 3 × 100 = 300`
   orgs/strategy, and ICP mode runs exactly **one** strategy. So ICP-1 (544
   reachable) sources **≤300 per run**; ICP-2 ≤116. After per-company skips
   (no domain, dupes, own domain) it's lower. To reach 544 we must raise the
   page cap to ~6 (and likely chunk — `maxDuration = 300s`).
2. **Fit matrix not populated by the build.** The pipeline inserts into
   `companies` with a *legacy* score (`scoreCompanyWithModel` over a reduced
   ICP), but **never writes `company_icp_fit`**. That matrix — and the ICP
   card's "N companies fit" — is only filled by the `icp/recompute-tenant`
   Inngest job. The build route does **not** emit it. So after a build the
   card still shows "0 companies fit" until a recompute runs.

## Precision mismatches — defined vs what actually filters

| Defined | What the translator actually does |
|---|---|
| `industry` ∈ {Computer Software, IT&Services, Internet} | Pushed to `q_organization_keyword_tags`, **merged with** `keywords` into one bag. Not a structured industry filter — fuzzy keyword match, diluted by business keywords. Apollo has `organization_industry_tag_ids`; we don't use it. |
| `person_titles` / `person_seniorities` (founder/CTO-led) | **Dropped from account sourcing** — org search carries no person params. Only post-filters at the *contact* level. So "founder/CTO-led" does **not** restrict which accounts are sourced. |
| `latest_funding_stage` ∈ {seed, A, B} | `apollo_enrich` → **post-filter only**, never narrows the search. |
| `technologies` (weight 3, the "replaceable-bill" filter) | Mapped via **unverified** best-effort UIDs (`MongoDB Atlas`→`mongodb`, `AWS`→`amazon_aws`). A wrong UID is silently ignored by Apollo. Highest-weight criterion, least verified. |
| `geography` | Sourced correctly (`organization_locations`); `country` lands in `properties.country` for scoring. No first-class `country` column on `companies` (minor — scoring reads properties). |

## Net

- The two ICPs are correctly stored (8 criteria each, match the spec).
- The blocking bug is fixed; Build TAM is now enabled.
- To actually get matching accounts: (a) decide spend/scope of the source
  run, (b) raise the page cap if we want the full 544, (c) wire the
  `icp/recompute-tenant` trigger after a build so the fit matrix fills,
  (d) optionally fix the industry-filter precision before sourcing.

---

## Update — reliability fixes applied + full source (2026-06-02)

Martin chose "fiabiliser puis sourcer tout". Fixes applied (all test-covered):

1. **Count subquery** (`api/icps`, `api/eval/datasets`) — qualify `"icps"."id"`.
   Verified live: ICPs now report `criteria=8`.
2. **DB schema drift** — the live Supabase DB was migrated *outside*
   `scripts/apply-migrations.ts` (`__drizzle_migrations` absent) and was missing
   the 4 columns from `0027_add_company_logo_columns.sql`. Every
   `db.insert(companies)` failed `42703 column "resolved_logo_url" does not
   exist` — silently (pipeline absorbs insert errors). This was the REAL reason
   "0/30" inserted earlier (NOT RLS — RLS is off). Applied 0027 directly.
3. **Geography scoring** — criterion lists regions ("Vaud", "Île-de-France");
   Apollo splits location into state/city/country. `buildCompanyContext` now
   exposes all three as a `geography` array so a region matches Apollo's `state`.
4. **Accent + ampersand** — `norm()` now strips diacritics (NFD + `\p{Diacritic}`)
   and equates `&`/`and`. Without diacritic stripping, Apollo's "Ile-de-France"
   ≠ criterion "Île-de-France" → the *required* geography criterion zeroed the
   fit of EVERY French company. (Validated: 11/12 of a smoke batch now fit ≥0.5.)
5. **Recompute wiring** — `recomputeTenant` exported; `tam/build` emits
   `icp/recompute-tenant` after a build so `company_icp_fit` fills.
6. **Page cap** — `MAX_PAGES_PER_STRATEGY` 3 → 6 (one ICP can reach 544+).
7. **Bulk narration gate** — `TAM_SKIP_NARRATION=1` skips the per-row narration
   LLM in `scripts/source-icp-tam.ts`.

### Sourcing tool

`scripts/source-icp-tam.ts <tenant> "<ICP>" [target] [maxPages]` — same proven
pipeline as the build route, no 300s limit, recomputes fit at the end.

### Open precision lever (Martin's call, not changed)

ICP-1 `industry` is **soft** (weight 2), so off-industry companies (publishing,
insurance, staffing) still clear the 0.5 fit gate on geo+size+tech+keywords —
they just rank below true software cos (0.58 vs 0.83). Re-scoring is free
(`recomputeTenant`), so the fix is a one-toggle change (make `industry`
required) → free recompute tightens the "fit" set, no re-sourcing needed.
