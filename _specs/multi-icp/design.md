# Multi-ICP Support · Design

> Phase 2 = Design. Architecture diff, 5 new tables (Drizzle DDL sketch), field-catalog seed mapping, TAM-build flow, matrix-scoring flow, AI-inference flow, priority resolution, retro-compat migration, guardrails.
> Verified against live code 2026-05-31. Stack locked per requirements.md D1-D4.

---

## 1. Architecture diff (added vs already there)

ALREADY THERE (reused, not rebuilt):
- Apollo client + OrgSearchParams (16 search/enrich fields) — lib/integrations/apollo-client.ts:156-244. The vocabulary D2 mirrors.
- Apollo-aligned taxonomies + mappers — lib/config/icp-constants.ts:7-163 (INDUSTRIES, COMPANY_SIZES, GEOGRAPHIES, JOB_SENIORITIES, JOB_DEPARTMENTS, sizesToApolloRanges, senioritiesToApollo).
- Pure scorer calculateFitScore + scoreCompanyWithModel — lib/scoring/scoring.ts:62-158, lib/scoring/company-scorer.ts:29-71. Pattern reused by the criteria engine (pure, DB-free).
- Streaming TAM pipeline + NDJSON events — api/tam/build/route.ts, lib/tam-stream/per-company.ts, lib/tam-stream/events.ts. The per-ICP build wraps this; the event contract is unchanged.
- Single AI ICP skill — skills/scoring/icp-identification/handler.ts:17-96. Extended to N candidates.
- Tenant settings JSONB + typed accessor + migration-marker pattern (ws1MigrationRanAt) — lib/config/tenant-settings.ts:9-294,226,449-463.
- RLS coverage pattern — drizzle/0038_rls_full_coverage.sql. New tables join it.
- Inngest 4.1 (64+ functions) for orchestration.

ADDED (this spec):
- 5 tables: icps, icp_criteria, icp_field_catalog, company_icp_fit, + 2 nullable FK columns (sequences.icp_id, custom_signals.icp_id). Migration 0056.
- lib/icp/criteria-engine.ts — pure evaluateCriterion + scoreCompanyAgainstIcp.
- lib/icp/apollo-translate.ts — icp_criteria -> OrgSearchParams (the D2 1:1 map) + post-filter predicate for custom/signal criteria.
- lib/icp/priority.ts — primary-ICP resolution.
- lib/icp/catalog-seed.ts — the ~16 global field rows (section 3).
- Inngest fn icp.fit.recompute — incremental matrix recompute on ICP edit / company enrich.
- Extended skill output (N ICP candidates) + mapper onto catalog.
- ICP CRUD API + rebuilt /settings/icp UI (list + criteria editor + AI-infer button).
- Migration runner: flat target* -> Default ICP (idempotent). Pilae seed -> 4 vertical ICPs.

NET: the single scalar companies.score is kept (now = primary-ICP fit, R8.3). The new source of truth for fit is the company_icp_fit matrix.

---

## 2. Data model diff (Drizzle DDL sketch)

New enums (db/schema/enums.ts or co-located in a new db/schema/icp.ts):
- icp_status: active | draft | archived
- icp_criterion_operator: eq | in | gt | lt | contains | exists | between
- icp_field_source: apollo_search | apollo_enrich | custom_property | signal
- icp_field_value_type: enum | range | multi_select | boolean | text | date_range

CREATE TABLE icps (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  status        icp_status NOT NULL DEFAULT 'draft',
  priority      integer NOT NULL DEFAULT 100,   -- lower = higher priority (R8.1)
  created_by    text REFERENCES users(id),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
-- idx (tenant_id), idx (tenant_id, status), idx (tenant_id, priority)

CREATE TABLE icp_criteria (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  icp_id        text NOT NULL REFERENCES icps(id) ON DELETE CASCADE,
  field_key     text NOT NULL,                  -- joins icp_field_catalog.field_key
  operator      icp_criterion_operator NOT NULL,
  value         jsonb NOT NULL DEFAULT 'null',
  weight        numeric NOT NULL DEFAULT 1,
  is_required   boolean NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now()
);
-- idx (icp_id)

CREATE TABLE icp_field_catalog (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     text REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = global Apollo-standard
  field_key     text NOT NULL,
  label         text NOT NULL,
  source        icp_field_source NOT NULL,
  value_type    icp_field_value_type NOT NULL,
  operators     jsonb NOT NULL DEFAULT '[]',     -- allowed icp_criterion_operator values
  apollo_param  text,                            -- NULL for non-apollo sources
  created_at    timestamptz DEFAULT now()
);
-- unique (tenant_id, field_key) -- NULLS distinct: global + per-tenant key can coexist
-- idx (tenant_id)

CREATE TABLE company_icp_fit (
  company_id        text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  icp_id            text NOT NULL REFERENCES icps(id) ON DELETE CASCADE,
  fit_score         numeric NOT NULL DEFAULT 0,   -- [0,1]
  matched_criteria  jsonb NOT NULL DEFAULT '[]',  -- [{field_key, matched, required, weight}]
  computed_at       timestamptz DEFAULT now(),
  PRIMARY KEY (company_id, icp_id)
);
-- idx (icp_id), idx (company_id, fit_score)

ALTER columns (migration 0056):
- ALTER TABLE sequences      ADD COLUMN icp_id text REFERENCES icps(id) ON DELETE SET NULL;  -- R9.1
- ALTER TABLE custom_signals ADD COLUMN icp_id text REFERENCES icps(id) ON DELETE SET NULL;  -- R9.2
- idx sequences(icp_id), idx custom_signals(icp_id)

RLS: add icps / icp_criteria / company_icp_fit / icp_field_catalog to the tenant-isolation policy set following drizzle/0038_rls_full_coverage.sql. icp_field_catalog policy must allow rows WHERE tenant_id IS NULL (global) OR tenant_id = current tenant (R2.5).

---

## 3. Field-catalog seed mapping (Apollo param -> global catalog row)

Seed in lib/icp/catalog-seed.ts; written by migration 0056 as tenant_id = NULL rows. apollo_param is verbatim the OrgSearchParams / OrgSearchOrganization key (apollo-client.ts:156-230). value sets reuse icp-constants.ts (R2.6). All keys verified present in apollo-client.ts.

ORG SEARCH (source = apollo_search; drives TAM build R4.1):

| field_key            | label                  | value_type   | operators        | apollo_param                            | value source |
|----------------------|------------------------|--------------|------------------|-----------------------------------------|--------------|
| org_keywords         | Keywords               | multi_select | in, contains     | q_organization_keyword_tags             | free text |
| employee_range       | Employee count         | range        | between, in      | organization_num_employees_ranges       | COMPANY_SIZES (via sizesToApolloRanges) |
| hq_location          | HQ location            | multi_select | in               | organization_locations                  | GEOGRAPHIES |
| hq_not_location      | Exclude HQ location    | multi_select | in               | organization_not_locations              | GEOGRAPHIES |
| revenue              | Annual revenue         | range        | between, gt, lt  | revenue_range                           | numeric USD |
| technologies         | Tech used              | multi_select | in, contains     | currently_using_any_of_technology_uids  | free text |
| latest_funding_date  | Latest funding date    | date_range   | between, gt      | latest_funding_date_range               | ISO date |
| total_funding        | Total funding          | range        | between, gt, lt  | total_funding_range                     | numeric USD |
| num_jobs             | Open job count         | range        | between, gt      | organization_num_jobs_range             | numeric |
| job_titles           | Hiring for titles      | multi_select | in, contains     | q_organization_job_titles               | free text |
| job_locations        | Job locations          | multi_select | in               | organization_job_locations              | GEOGRAPHIES |
| job_posted_at        | Job posted date        | date_range   | between, gt      | organization_job_posted_at_range        | ISO date |

PEOPLE SEARCH (source = apollo_search; applied to the people-search leg, searchPeople, apollo-client.ts:136):

| field_key          | label             | value_type   | operators | apollo_param        | value source |
|--------------------|-------------------|--------------|-----------|---------------------|--------------|
| person_titles      | Contact titles    | multi_select | in        | person_titles       | DECISION_MAKER_ROLES |
| person_seniorities | Contact seniority | multi_select | in        | person_seniorities  | JOB_SENIORITIES (via senioritiesToApollo) |

ENRICH-ONLY (source = apollo_enrich; NOT Apollo request params — scored post-fetch from the enriched row, R3.3). apollo_param = NULL:

| field_key            | label            | value_type   | operators        | scored from (apollo-client.ts:201-230) |
|----------------------|------------------|--------------|------------------|-----------------------------------------|
| industry             | Industry         | enum         | eq, in, contains | OrgSearchOrganization.industry          | (value set INDUSTRIES)
| latest_funding_stage | Funding stage    | enum         | eq, in           | latest_funding_stage                    |
| founded_year         | Founded year     | range        | between, gt, lt  | founded_year                            |
| investor_names       | Investors        | multi_select | in, contains     | investor_names                          |
| num_job_openings     | Current openings | range        | between, gt      | num_current_job_openings                |

CUSTOM (source = custom_property | signal; tenant_id set, added at runtime R2.4) — not seeded; created when a tenant references a customFields def or a custom_signals row.

Note on employee_range: the catalog value_type is range; the translator (section 4) converts the [min,max] value into Apollo's "min,max" string list via sizesToApolloRanges-style formatting. between maps to one range string; in maps to several.

---

## 4. TAM-build flow (per-ICP, R4)

POST /api/tam/build now accepts { icpId, targetCount?, strategyCount? }.

1. Load the ICP + its icp_criteria + the resolved catalog rows (tenant union, R2.5).
2. apollo-translate.toOrgSearchParams(criteria, catalog):
   - For each criterion whose catalog.source = apollo_search and apollo_param is non-null, set the matching OrgSearchParams key. Range/date -> {min,max}; multi_select/enum -> string[]; employee_range -> Apollo "min,max" string list.
   - People-search criteria (person_titles, person_seniorities) feed the existing people-search leg (apollo-client.ts:136), not the org search body.
   - Criteria with source apollo_enrich, custom_property, or signal are NOT translated to params -> collected into a postFilter predicate (R4.2, R3.3-R3.4).
3. Existing LLM strategy planner (api/tam/build/route.ts:412-499) still runs, but seeded by the ICP's translated params instead of the flat tenant settings, so it diversifies around the ICP rather than the tenant-wide ICP. The planner output is intersected with the ICP's hard apollo_search params (required ones kept verbatim).
4. searchOrganizations() per strategy/page (unchanged loop, route.ts:281-369).
5. runPerCompanyPipeline (per-company.ts) per org — unchanged enrichment + signal compute + NDJSON events. After the existing scoreCompanyWithModel call, apply postFilter; if a required custom/signal criterion fails, the company is skipped from this ICP's TAM (not inserted under this ICP) but may still be inserted if it matches another active ICP build.
6. After insert/enrich, enqueue icp.fit.recompute for (company, icpId) (section 5) so company_icp_fit is populated.

Unchanged: dedup against existing domains + own-domain skip (route.ts:222-231, R4.4); concurrency limiter (route.ts:508-535); NDJSON contract (events.ts).

---

## 5. Matrix-scoring flow (R5)

lib/icp/criteria-engine.ts (pure, DB-free — mirrors scoring.ts):

evaluateCriterion(criterion, fields) -> { matched, contribution }
  - Resolve the value for criterion.field_key from fields (a flat record assembled from companies row + companies.properties + customSignals values).
  - Apply the operator (R3.2). Missing field -> matched=false, no throw (R3.5).
  - contribution = matched ? weight : 0.

scoreCompanyAgainstIcp(company, props, criteria) -> { fitScore, matchedCriteria }
  - required = criteria.filter(is_required). If any required criterion unmatched -> fitScore = 0, record it (R5.3).
  - weighted = criteria.filter(!is_required). fitScore = sum(contribution) / sum(weight), clamp [0,1] (R5.2). Empty weighted set with all required matched -> fitScore = 1.
  - matchedCriteria = per-criterion {field_key, matched, required, weight}.

Inngest fn icp.fit.recompute (incremental, R5.4):
  - Trigger A (event icp/criteria.changed): payload { tenantId, icpId }. Page through the tenant's companies (batched, e.g. 500/iteration), recompute company_icp_fit for (each company, icpId), upsert. After the page, recompute the primary-ICP for affected companies (section 7) and write companies.score (R8.3, R5.6).
  - Trigger B (event company/enriched): payload { tenantId, companyId }. Recompute company_icp_fit for (companyId, each active icp). Then primary-ICP + companies.score for that one company.
  - Never iterates the full N x M product in one run — A is bounded by one ICP across companies, B by one company across ICPs (R11.5).

Write-site change: per-company.ts:163-193 still computes the legacy scalar via scoreCompanyWithModel; companies.score is then OVERWRITTEN by the primary-ICP fit on the next icp.fit.recompute(B) for that company. The learned model stays tenant-level (R11.7) and continues to feed scoreCompanyWithModel; multi-ICP fit lives in company_icp_fit. Both coexist.

---

## 6. AI-inference flow (R6)

Extend skills/scoring/icp-identification (handler.ts:17-96):
- Input grows from { companyDomain } to { productDescription, exampleCustomerDomains[] }.
- For each example domain, enrichOrganization() (already imported, handler.ts:1) to ground the LLM in real firmographics.
- Prompt (tracedGenerateObject, R6.5) asks for N candidate ICPs (e.g. clustered by vertical/size), each a { name, fields }. Reuse industriesPromptHint()/companySizesPromptHint() (handler.ts:6) so the LLM emits Apollo-taxonomy labels (keeps D2 alignment).
- mapProposalToCriteria(proposal, catalog): for each proposed field, find the catalog row (prefer apollo_search), pick the default operator (multi_select->in, range->between, enum->eq), build the value. Unmappable fields -> recorded as unmappedSuggestions, dropped from criteria (R6.3).
- Returns ICP candidates as status=draft (R6.4). UI loads one into the rule-builder for confirmation (R7.4); save flips to active.

Single-domain back-compat: the existing /api/onboarding/enrich-icp path (one domain -> one ICP) keeps working by calling the extended skill with exampleCustomerDomains=[domain] and taking the first candidate.

---

## 7. Priority resolution (R8)

lib/icp/priority.ts: resolvePrimaryIcp(companyId) reads company_icp_fit rows with fit_score > 0, joins icps (status=active), orders by (priority asc, fit_score desc, icps.created_at desc), returns the top icp_id (R8.1). 
- companies.score := that row's fit_score * 100 (legacy scalar is 0-100; company_icp_fit is 0-1) so dashboard/grade thresholds (scoring.ts:9-16) keep working (R8.3, R5.6).
- Enrollment (signal-to-sequence / sequence picker) consults resolvePrimaryIcp; if a sequence has icp_id set, only enroll when primary == sequence.icp_id (R9.3). A company is enrolled under exactly one ICP at a time (R8.2).

---

## 8. Retro-compat migration (R10)

Runner lib/icp/migrate-flat-icp.ts (invoked by a one-shot Inngest fn over all tenants, mirroring the WS-1 default migration pattern):
- Guard: skip if settings.multiIcpMigratedAt set (R10.2).
- If any of the 6 target* fields present: create icps "Default" (active, priority 1). Build icp_criteria:
  - targetIndustries -> {field_key: industry, op: in, value: [...]}
  - targetCompanySizes -> {field_key: employee_range, op: in, value: ranges}
  - targetGeographies -> {field_key: hq_location, op: in, value: [...]}
  - targetSeniorities -> {field_key: person_seniorities, op: in, value: senioritiesToApollo(...)}
  - targetDepartments / targetRoles -> {field_key: person_titles, op: in, value: parsed roles}
- Stamp settings.multiIcpMigratedAt. Keep flat fields in place (R10.3).
- Backfill: enqueue icp.fit.recompute(A) for the new Default ICP.

Pilae 4-vertical (R10.4-R10.5) in scripts/seed-pilae-tenant.ts: replace the nested settings.icp write with 4 icps inserts — "SaaS / Tech", "Fintech", "Sante", "Agence" (from verticales, lines 41) — priorities 1-4. Each gets:
- industry/keyword criteria for its vertical, hq_location in [France, Switzerland] (geo, line 41),
- person_seniorities/person_titles from personas.decideur+influenceur (lines 43-44),
- is_required exclusion from anti_icp (line 47): employee_range gt 5 (the "< 5 FTE" anti rule) as is_required=true so sub-5-FTE companies score 0 (R5.3).
This supersedes the inert nested shape that scoring never read (the documented bug). The bloqueur persona (line 45) is recorded as a non-scoring note (out of scope for criteria — it is a deal-risk signal, not a targeting filter).

---

## 9. Guardrails (one line each)

- Apollo-only TAM source; no new provider (D4, R4.5, R11.1).
- apollo_param values are verbatim OrgSearchParams keys — a unit test asserts every apollo_search catalog row key exists on the OrgSearchParams type (R2.3).
- Incremental recompute only; icp.fit.recompute never iterates the full N x M product in one run (R5.4, R11.5).
- companies.score retained = primary-ICP fit; no existing reader of companies.score breaks (R5.6, R8.3, R11.4).
- AI-proposed ICPs are draft until user confirms (R6.4); unmappable fields dropped, never silently invented (R6.3).
- Migration idempotent via settings.multiIcpMigratedAt; flat fields not dropped (R10.2-R10.3, R11.3).
- All new tables RLS tenant-scoped; icp_field_catalog policy allows global (NULL tenant) + own-tenant rows only (R1.5, R2.5).
- ON DELETE: icp delete cascades criteria+fit; sequences/custom_signals icp_id SET NULL (no orphan enrollment break) (R1.4, R9.1-R9.2).
- No per-tenant ICP cap (D1, R11.2).
- A company is enrolled under exactly one ICP at a time (priority resolution) — prevents conflicting-sequence double-enroll (R8.2).
