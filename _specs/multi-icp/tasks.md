# Multi-ICP Support · Tasks

> Phase 3 = Tasks. Ordered, executable. Each: ID, tag, action, verify step, test, requirement refs, estimate (half-day = 0.5 dev-day).
> Total estimate: ~13.5 dev-days (27 half-days). 19 tasks.
> Order respects dependencies: schema -> engine -> translate -> scoring -> TAM -> AI -> UI -> binding -> migration -> Pilae -> regression.

| Phase            | Tasks       | Est (dev-days) |
|------------------|-------------|----------------|
| Schema + catalog | B1.1-B1.3   | 2.0            |
| Criteria engine  | B2.1-B2.2   | 1.5            |
| Apollo translate | B3.1        | 1.0            |
| Matrix scoring   | B4.1-B4.2   | 2.0            |
| TAM per-ICP      | B5.1        | 1.0            |
| AI inference     | B6.1-B6.2   | 1.5            |
| CRUD API         | B7.1        | 0.5            |
| Rule-builder UI  | B8.1-B8.2   | 1.5            |
| Binding          | B9.1-B9.2   | 1.0            |
| Retro-compat     | B10.1       | 0.5            |
| Pilae 4-vertical | B10.2       | 0.5            |
| Regression+drift | B11.1       | 0.5            |
| **Total**        |             | **~13.5**      |

---

## Phase 1 — Schema + field catalog

### B1.1 [NEW] Create the 4 ICP enums + migration 0056 scaffold
- Action: Add icp_status, icp_criterion_operator, icp_field_source, icp_field_value_type pgEnums in a new db/schema/icp.ts; generate migration 0056 (drizzle next after 0055_voice_tables.sql).
- Verify: drizzle-kit generate produces 0056 with the 4 CREATE TYPE statements; npm run typecheck passes.
- Test: __tests__/icp-schema.test.ts asserts the 4 enums export the exact value sets in design.md section 2.
- Refs: R1.1, R1.3, R2.1. Est: 0.5

### B1.2 [NEW] Create icps, icp_criteria, icp_field_catalog, company_icp_fit tables + FKs + indexes + RLS
- Action: Define the 4 tables in db/schema/icp.ts per design.md section 2 (FKs, cascade rules, unique on company_icp_fit(company_id,icp_id), unique on icp_field_catalog(tenant_id,field_key) NULLS NOT DISTINCT-aware). Add RLS policies following drizzle/0038_rls_full_coverage.sql, with icp_field_catalog allowing tenant_id IS NULL OR tenant_id = current.
- Verify: migration applies on a scratch DB; \d icps shows the cascade FK; RLS policies present via pg_policies query.
- Test: __tests__/icp-rls.test.ts — a tenant A query cannot read tenant B icps; global (NULL) catalog rows readable by any tenant; tenant B custom catalog rows not readable by A (R2.5).
- Refs: R1.1, R1.3, R1.4, R1.5, R2.1, R5.1. Est: 1.0

### B1.3 [NEW] Seed the ~16 global field-catalog rows
- Action: lib/icp/catalog-seed.ts exporting the global rows from design.md section 3; migration 0056 inserts them as tenant_id=NULL. apollo_param verbatim from OrgSearchParams/OrgSearchOrganization keys; value sets reference icp-constants.ts.
- Verify: after migrate, SELECT count(*) FROM icp_field_catalog WHERE tenant_id IS NULL returns the seeded count; spot-check employee_range.apollo_param = 'organization_num_employees_ranges'.
- Test: __tests__/icp-catalog-seed.test.ts — for every apollo_search row, assert apollo_param is a key of OrgSearchParams (type-level + runtime keyof check against a sample params object); assert no apollo_enrich row has a non-null apollo_param.
- Refs: R2.2, R2.3, R2.6. Est: 0.5

---

## Phase 2 — Criteria evaluation engine

### B2.1 [NEW] Pure evaluateCriterion with all 7 operators
- Action: lib/icp/criteria-engine.ts: evaluateCriterion(criterion, fields) -> { matched, contribution }. Implement eq, in, gt, lt, contains, exists, between per R3.2. Case-insensitive strings; missing field -> matched=false (no throw).
- Verify: ad-hoc REPL over a sample fields record returns expected matches for each operator.
- Test: __tests__/icp-criteria-engine.test.ts — table-driven, >= 2 cases per operator incl. missing-field (R3.5), case-insensitivity, between boundary inclusivity.
- Refs: R3.1, R3.2, R3.5. Est: 1.0

### B2.2 [NEW] Field resolver (apollo_enrich / custom_property / signal)
- Action: In criteria-engine.ts, resolveFields(companyRow, props, catalog) assembling the flat fields record: apollo_enrich keys from companies row + props (apollo-client.ts:201-230); custom_property from props[field_key]; signal from props.customSignals[signalId].value (intelligence.ts:662-663).
- Verify: a company row with properties.customSignals resolves a signal field_key to its .value.
- Test: extend icp-criteria-engine.test.ts — resolver maps each source kind to the right slot; signal value read from customSignals[id].value.
- Refs: R3.3, R3.4. Est: 0.5

---

## Phase 3 — Apollo translation

### B3.1 [NEW] icp_criteria -> OrgSearchParams + post-filter predicate
- Action: lib/icp/apollo-translate.ts: toOrgSearchParams(criteria, catalog) building the OrgSearchParams body for apollo_search criteria (range->{min,max}, multi_select->string[], employee_range->Apollo "min,max" list via sizesToApolloRanges-style format); split person_titles/person_seniorities into the people-search leg; collect apollo_enrich/custom/signal criteria into a postFilter predicate (reuses B2 engine).
- Verify: a Default-style ICP (industries+sizes+geo) yields organization_locations + organization_num_employees_ranges + keyword tags matching what api/tam/build sends today.
- Test: __tests__/icp-apollo-translate.test.ts — assert produced keys are all valid OrgSearchParams keys; employee_range between [51,200] -> ["51,200"]; person_seniorities routed out of the org body; an apollo_enrich criterion is NOT in the params and IS in postFilter.
- Refs: R4.1, R4.2, R2.3. Est: 1.0

---

## Phase 4 — Matrix scoring

### B4.1 [NEW] scoreCompanyAgainstIcp + company_icp_fit upsert
- Action: In criteria-engine.ts add scoreCompanyAgainstIcp(company, props, criteria) -> { fitScore, matchedCriteria } per R5.2-R5.3 (required-fail -> 0; weighted sum / total weight; clamp [0,1]). Add lib/icp/fit-store.ts upsertCompanyIcpFit writing company_icp_fit.
- Verify: a company matching 2/3 weighted criteria (equal weights) scores ~0.67; a failed required criterion forces 0.
- Test: __tests__/icp-scoring.test.ts — weighted math, required-fail zeroing, empty-weighted+required-pass -> 1, matchedCriteria shape.
- Refs: R5.1, R5.2, R5.3. Est: 1.0

### B4.2 [NEW] Inngest fn icp.fit.recompute (incremental A + B) + primary write-back
- Action: inngest/icp-fit-recompute.ts handling icp/criteria.changed (Trigger A: one ICP across companies, batched 500) and company/enriched (Trigger B: one company across active ICPs). After each, call resolvePrimaryIcp (B7/priority lib) and write companies.score = primary fit_score*100. Register in the Inngest functions array.
- Verify: editing an ICP criterion enqueues A; recompute populates company_icp_fit for that icp across companies; companies.score updates to primary fit; a full N x M product is never iterated in one run.
- Test: __tests__/icp-fit-recompute.test.ts (mock db) — Trigger A only touches the given icpId; Trigger B only the given companyId; companies.score equals primary fit*100; batching paginates.
- Refs: R5.4, R5.5, R5.6, R8.3, R11.5. Est: 1.0

---

## Phase 5 — TAM build per-ICP

### B5.1 [NEW] Wire /api/tam/build to icpId
- Action: api/tam/build/route.ts accepts { icpId }, loads ICP+criteria+catalog, seeds the LLM planner from toOrgSearchParams(...) instead of flat settings (route.ts:242-259,420-471), intersects planner output with required apollo_search params, applies postFilter inside the per-company step (per-company.ts after scoreCompanyWithModel), and enqueues icp.fit.recompute(B) per inserted company. Keep dedup/own-domain/NDJSON unchanged.
- Verify: POST with a Default ICP streams company.inserted events as today; companies appear with company_icp_fit rows for that ICP; a required custom/signal mismatch excludes the company from this ICP build.
- Test: extend __tests__/tam-api.test.ts — build with icpId calls searchOrganizations with the translated params; postFilter excludes a mismatching company; recompute enqueued.
- Refs: R4.1, R4.2, R4.3, R4.4, R4.5. Est: 1.0

---

## Phase 6 — AI inference (v1)

### B6.1 [NEW] Extend icp-identification skill to N candidates
- Action: skills/scoring/icp-identification — grow input to { productDescription, exampleCustomerDomains[] }, enrich each domain (enrichOrganization, handler.ts:1), prompt tracedGenerateObject for N candidate ICPs each { name, fields } using industriesPromptHint/companySizesPromptHint (handler.ts:6). Keep single-domain back-compat (enrich-icp route passes [domain], takes first candidate).
- Verify: skill run with a product desc + 2 domains returns >= 1 candidate with Apollo-taxonomy field labels; enrich-icp route still returns one ICP.
- Test: __tests__/icp-ai-infer.test.ts (mock LLM + Apollo) — returns N candidates; single-domain path returns one; output labels are from icp-constants taxonomies.
- Refs: R6.1, R6.2, R6.5. Est: 1.0

### B6.2 [NEW] mapProposalToCriteria onto the catalog
- Action: lib/icp/map-proposal.ts: for each proposed field, resolve a catalog row (prefer apollo_search), pick default operator by value_type, build value; collect unmappable -> unmappedSuggestions (dropped). Candidates surface as status=draft.
- Verify: a proposal with industries+sizes maps to industry(in)+employee_range(in) criteria; an unknown field lands in unmappedSuggestions, not criteria.
- Test: extend icp-ai-infer.test.ts — mapping picks apollo_search over apollo_enrich on collision; unmappable field dropped; resulting ICP is draft.
- Refs: R6.3, R6.4. Est: 0.5

---

## Phase 7 — CRUD API

### B7.1 [NEW] ICP CRUD + catalog list + priority + resolvePrimaryIcp
- Action: api/icps routes (GET list, POST create, PATCH rename/status/priority, DELETE), api/icps/[id]/criteria (GET/PUT replace), GET api/icp-fields (catalog union, R2.5). lib/icp/priority.ts resolvePrimaryIcp per design section 7. All tenant-scoped via getAuthContext.
- Verify: create -> list -> set priority -> archive round-trips; criteria PUT enqueues icp.fit.recompute(A); GET icp-fields returns global + own custom rows only.
- Test: __tests__/icp-crud-api.test.ts — CRUD round-trip; archived ICP excluded from active list; criteria edit triggers recompute; cross-tenant read blocked.
- Refs: R1.1, R1.2, R1.6, R2.5, R5.5, R7.1, R8.1. Est: 0.5

---

## Phase 8 — Rule-builder UI (v1)

### B8.1 [NEW] ICP list + criteria editor at /settings/icp
- Action: Replace the single-form app/(dashboard)/settings/icp/page.tsx with: an ICP list (name, status, priority, drag/spin priority), and an editor where each criterion row = field picker (from GET api/icp-fields), operator (constrained by the catalog row operators), value widget keyed by value_type (range->two inputs+between; multi_select->chip picker+in; enum->select; boolean/text/date_range accordingly), weight, is_required toggle. No emojis; lucide icons only.
- Verify: create an ICP in the UI, add an industry(in) + employee_range(between) criterion, save; row persists; selecting employee_range shows two numeric inputs and locks operator to between/in.
- Test: e2e (Playwright) settings-icp.spec — create ICP, add 2 criteria, save, reload, criteria intact; operator options change with field type.
- Refs: R7.1, R7.2, R7.3, R7.5. Est: 1.0

### B8.2 [NEW] AI-infer button loads a draft into the editor
- Action: Add an "Infer with AI" action in the builder that POSTs product desc + example domains, shows returned draft candidate(s), and loads one into the editor (still draft) for review; save flips to active.
- Verify: clicking infer returns >= 1 draft ICP; choosing one populates the criteria editor; the ICP stays draft until explicit save.
- Test: extend settings-icp.spec — infer returns a draft, loads criteria, save activates; unmapped suggestions are shown but not added as criteria.
- Refs: R6.4, R7.4. Est: 0.5

---

## Phase 9 — Sequence + signal binding

### B9.1 [NEW] Add sequences.icp_id + custom_signals.icp_id (in migration 0056)
- Action: ALTER sequences ADD icp_id text REFERENCES icps(id) ON DELETE SET NULL; same for custom_signals; add indexes; add the column to the Drizzle table defs (outbound.ts:35, intelligence.ts:664).
- Verify: migration applies; inserting a sequence with a valid icp_id works; deleting the ICP nulls the FK (no row delete).
- Test: __tests__/icp-binding-schema.test.ts — FK SET NULL on ICP delete; NULL icp_id allowed.
- Refs: R9.1, R9.2. Est: 0.5

### B9.2 [NEW] Enrollment respects primary ICP + sequence.icp_id
- Action: In the enrollment path (signal-to-sequence / sequence picker), consult resolvePrimaryIcp; when sequence.icp_id is set, only enroll companies whose primary == sequence.icp_id (R9.3); ensure a company is enrolled under one ICP at a time (R8.2).
- Verify: a company matching ICP-A(priority1) and ICP-B(priority2) enrolls only into A's sequence; a B-bound sequence skips it.
- Test: __tests__/icp-enrollment.test.ts — primary resolution picks lowest priority; tie -> higher fit; icp_id-bound sequence filters correctly.
- Refs: R8.1, R8.2, R9.3. Est: 0.5

---

## Phase 10 — Retro-compat migration

### B10.1 [NEW] Flat target* -> Default ICP (idempotent)
- Action: lib/icp/migrate-flat-icp.ts + one-shot Inngest fn over all tenants. Per design section 8: create "Default" (active, priority 1) with criteria from the 6 flat fields; stamp settings.multiIcpMigratedAt; keep flat fields; enqueue icp.fit.recompute(A).
- Verify: run twice -> exactly one "Default" ICP per migrated tenant; flat fields still present; company_icp_fit populated for Default; companies.score unchanged in value vs pre-migration for a tenant whose Default mirrors its old ICP.
- Test: __tests__/icp-migrate-flat.test.ts — idempotency (second run no-op via marker); criteria mapping matches the 6 fields; tenants with no target* fields get no Default.
- Refs: R10.1, R10.2, R10.3. Est: 0.5

---

## Phase 11 — Pilae 4-vertical

### B10.2 [NEW] Seed Pilae as 4 distinct ICPs
- Action: scripts/seed-pilae-tenant.ts — replace the nested settings.icp write with 4 icps inserts ("SaaS / Tech", "Fintech", "Sante", "Agence", priorities 1-4) + criteria per design section 8 (vertical industry/keywords, hq_location in [France, Switzerland], personas decideur+influenceur -> person_seniorities/person_titles, anti_icp "< 5 FTE" -> employee_range gt 5 is_required=true). Idempotent on icps(tenant_id,name).
- Verify: run seed -> 4 active ICPs on tenant pilae each with criteria; a sub-5-FTE company scores 0 against every Pilae ICP (required exclusion); the previously-inert nested settings.icp no longer drives scoring.
- Test: __tests__/seed-pilae-icps.test.ts — 4 ICPs created; re-run no duplicates; anti-ICP required criterion zeroes a 3-FTE company.
- Refs: R10.4, R10.5, R5.3. Est: 0.5

---

## Phase 12 — Regression + drift

### B11.1 [NEW] Regression pass + drift check
- Action: Run regression.sh; confirm existing scoring (scoring.test.ts, score-api.test.ts) and TAM (tam-api.test.ts) still pass with companies.score now sourced from primary-ICP fit; confirm calculateContactFitScore (scoring.ts:234, reads companies.score) unaffected. Drift-check the spec against final code.
- Verify: regression.sh green; no existing test modified except the documented TAM/score extensions; companies.score readers behave identically for single-ICP tenants.
- Test: regression.sh (existing) + assert contact scoring reads companies.score correctly post-migration.
- Refs: R5.6, R11.4, R11.5. Est: 0.5
