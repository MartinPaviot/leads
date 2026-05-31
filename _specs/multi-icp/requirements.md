# Multi-ICP Support · Requirements (EARS)

> **Methodo:** Kiro (Spec -> Plan -> Execute). Phase 1 = Requirements in EARS form.
> **What:** Replace the single-ICP-per-tenant model (6 flat tenants.settings.target* fields) with N ICPs per tenant, each a dynamic criteria set whose standard vocabulary mirrors the Apollo search DB, plus a per-(company,ICP) scoring matrix.
> **Stack (LOCKED):** Next.js 15.5, TypeScript, Drizzle 0.45, Neon Postgres, Inngest 4.1, Apollo (TAM source), Anthropic Claude + OpenAI fallback. No new provider.
> **Owner:** Martin Paviot. **Verified against live code 2026-05-31.**

---

## 0. Ground truth — verified against the code (do NOT re-spec)

Single-ICP today, confirmed file:line:

- 6 flat ICP fields on tenants.settings: targetIndustries, targetCompanySizes, targetRoles, targetSeniorities, targetDepartments, targetGeographies — lib/config/tenant-settings.ts:58-64. [DONE] (the thing being replaced).
- One scalar fit score companies.score (real) + scoreReasons — db/schema/core.ts:60-61. Computed by calculateFitScore() (lib/scoring/scoring.ts:62-158) via scoreCompanyWithModel() (lib/scoring/company-scorer.ts:29-71). FitIcp is ONE object (scoring.ts:36-42). [DONE].
- Score write-site (single scalar): lib/tam-stream/per-company.ts:163-193 writes companies.score + properties.score_fit. [DONE].
- TAM build translates the one tenant ICP into Apollo strategies via an LLM planner — api/tam/build/route.ts:242-259,412-499. searchOrganizations() + OrgSearchParams — lib/integrations/apollo-client.ts:156-244. [DONE].
- ICP settings page is a single form — app/(dashboard)/settings/icp/page.tsx:15-286. [DONE].
- Onboarding writes the one ICP — api/onboarding/save/route.ts:87-99. [DONE].
- AI ICP inference (single) exists: skills/scoring/icp-identification/handler.ts:17-96 + api/onboarding/enrich-icp/route.ts:21-23 — produces ONE flat ICP from one company domain. [DONE] (to be extended, not reinvented).
- Apollo mapping helpers already align the taxonomy to Apollo: sizesToApolloRanges(), senioritiesToApollo(), industriesPromptHint() — lib/config/icp-constants.ts:139-163. Industry/size/geo taxonomies are Apollo-aligned by construction (icp-constants.ts:7-117). [DONE] (reused by the field-catalog seed).
- sequences has NO icpId — db/schema/outbound.ts:35-51. customSignals has NO icpId — intelligence.ts:664-707. Confirmed gaps. [NEW].
- NO icps / icp_criteria / icp_field_catalog / company_icp_fit tables exist anywhere (the files matching icp_id are the existing single-ICP skill, not tables). Latest migration is 0055_voice_tables.sql -> multi-ICP is 0056. [NEW].
- Pilae seed bug: app/apps/web/scripts/seed-pilae-tenant.ts:39-60 writes settings.icp.{verticales,personas,anti_icp} (nested) but scoring reads settings.targetIndustries (flat, scoring.ts:73). The Pilae ICP is inert today. [NEW] (superseded by R10).

### Locked product decisions (do NOT reopen)

- [LOCKED] D1. N ICPs per tenant, unbounded — no hardcoded limit.
- [LOCKED] D2. Standard criteria vocabulary mirrors the Apollo search DB 1:1 so TAM build is a direct translation; custom attributes + signals extend it.
- [LOCKED] D3. Creation v1 ships BOTH rule-builder AND AI-inference in parallel.
- [LOCKED] D4. Apollo is the TAM source; Anthropic+OpenAI the LLM. No new provider introduced by this spec.

---

## R1. Data model — icps and icp_criteria

- [NEW] R1.1 THE SYSTEM SHALL persist ICPs in an `icps` table keyed by tenant_id, each with id, name, status (one of active/draft/archived), integer priority, created_by, and created_at/updated_at timestamps.
- [NEW] R1.2 THE SYSTEM SHALL allow an unbounded number of icps rows per tenant (no application-enforced cap) — per D1.
- [NEW] R1.3 THE SYSTEM SHALL persist each ICP's criteria in an `icp_criteria` table keyed by icp_id, each row carrying field_key, operator (one of eq/in/gt/lt/contains/exists/between), value (jsonb), weight (numeric), and is_required (boolean).
- [NEW] R1.4 WHERE an icps row is deleted, THE SYSTEM SHALL cascade-delete its icp_criteria and company_icp_fit rows.
- [NEW] R1.5 THE SYSTEM SHALL scope every icps, icp_criteria, and company_icp_fit read/write to the caller tenant_id (RLS-covered, consistent with drizzle/0038_rls_full_coverage.sql).
- [NEW] R1.6 WHEN an ICP status is archived, THE SYSTEM SHALL exclude it from TAM build, matrix scoring recompute, and enrollment, while retaining its rows and historical company_icp_fit scores.

## R2. Field catalog — Apollo-mirrored vocabulary

- [NEW] R2.1 THE SYSTEM SHALL persist an `icp_field_catalog` table with id, nullable tenant_id (NULL = global Apollo-standard field; non-null = tenant custom field), field_key, label, source (one of apollo_search/apollo_enrich/custom_property/signal), value_type (one of enum/range/multi_select/boolean/text/date_range), operators (jsonb array of allowed operators), and nullable apollo_param (the Apollo request key).
- [NEW] R2.2 THE SYSTEM SHALL seed the NULL-tenant catalog rows from the ~16 Apollo search/enrich fields enumerated in design.md section 3, each apollo_param matching the exact key on OrgSearchParams / OrgSearchOrganization (apollo-client.ts:156-230).
- [LOCKED] R2.3 WHERE a criterion catalog source is apollo_search, its apollo_param SHALL map 1:1 onto a key accepted by searchOrganizations() — per D2; the seed MUST NOT invent params Apollo does not accept.
- [NEW] R2.4 THE SYSTEM SHALL allow a tenant to add a custom catalog field (tenant_id = that tenant) with source custom_property or signal, referencing an existing customFields def (tenant-settings.ts:313) or custom_signals row (intelligence.ts:664) respectively.
- [NEW] R2.5 WHEN the rule-builder or AI inference offers selectable fields, THE SYSTEM SHALL return the union of the tenant NULL-tenant (global) rows and that tenant custom rows, and SHALL NOT expose another tenant custom fields.
- [CFG] R2.6 THE SYSTEM SHALL reuse the existing Apollo-aligned vocabularies (INDUSTRIES, COMPANY_SIZES, GEOGRAPHIES, JOB_SENIORITIES, JOB_DEPARTMENTS in icp-constants.ts:7-117) as the enum/multi_select value sets for the corresponding global catalog rows — no new taxonomy is authored.

## R3. Criteria evaluation engine

- [NEW] R3.1 THE SYSTEM SHALL provide a pure, DB-free evaluateCriterion(criterion, fields) function returning { matched, contribution }, mirroring the side-effect-free contract of scoring.ts.
- [NEW] R3.2 THE SYSTEM SHALL implement each operator: eq (scalar equality, case-insensitive for strings), in (membership), gt/lt (numeric/date), contains (substring/array-membership, case-insensitive), exists (field present and non-empty), between (inclusive numeric/date range from a 2-tuple value).
- [NEW] R3.3 WHERE a criterion field_key resolves to a catalog row with source apollo_enrich, THE SYSTEM SHALL read the value from the enriched companies row / companies.properties (e.g. industry, estimated_num_employees, annual_revenue, total_funding, technology_names — apollo-client.ts:201-230).
- [NEW] R3.4 WHERE a criterion field_key resolves to source custom_property, THE SYSTEM SHALL read from companies.properties[field_key]; WHERE it resolves to source signal, THE SYSTEM SHALL read from companies.properties.customSignals[signalId].value (intelligence.ts:662-663).
- [NEW] R3.5 IF a criterion references a field_key absent from the resolved fields, THEN THE SYSTEM SHALL treat that criterion as unmatched (contribution 0) and SHALL NOT throw.

## R4. TAM build per-ICP

- [NEW] R4.1 WHEN a TAM build is invoked for an icpId, THE SYSTEM SHALL translate every icp_criteria row whose catalog source is apollo_search into the corresponding OrgSearchParams key and call searchOrganizations() (apollo-client.ts:237).
- [NEW] R4.2 WHERE icp_criteria include custom_property or signal sources (not expressible as Apollo params), THE SYSTEM SHALL apply them as a post-fetch filter on enriched results, not as Apollo request params.
- [NEW] R4.3 THE SYSTEM SHALL preserve the existing streaming per-company pipeline (runPerCompanyPipeline, per-company.ts) and its NDJSON event contract (tam-stream/events.ts) — the only change is that the source ICP is explicit, not the implicit tenant ICP.
- [DONE] R4.4 THE SYSTEM SHALL continue to dedup against existing tenant domains and skip the tenant own domain — already implemented api/tam/build/route.ts:222-231; no re-spec.
- [LOCKED] R4.5 THE SYSTEM SHALL NOT introduce a non-Apollo TAM source — per D4.

## R5. Matrix scoring (per company, per ICP)

- [NEW] R5.1 THE SYSTEM SHALL persist a `company_icp_fit` table with company_id, icp_id, fit_score (numeric, [0,1]), matched_criteria (jsonb), and computed_at, unique on (company_id, icp_id).
- [NEW] R5.2 WHEN scoring a (company, icp) pair, THE SYSTEM SHALL evaluate each active criterion via R3, compute fit_score = sum(weight * matched) / sum(weight) over non-required criteria, and clamp to [0,1].
- [NEW] R5.3 IF any is_required criterion is unmatched for a (company, icp) pair, THEN THE SYSTEM SHALL set fit_score = 0 for that pair and record the failing criterion in matched_criteria.
- [NEW] R5.4 THE SYSTEM SHALL recompute company_icp_fit incrementally — only for the (company, icp) pairs touched by a change (a company enriched/updated, or an ICP criteria edited) — and SHALL NOT full-recompute the entire N-ICP x M-company matrix on every change.
- [NEW] R5.5 WHEN an ICP icp_criteria are edited, THE SYSTEM SHALL enqueue recompute of company_icp_fit for that icp_id across the tenant companies (bounded job), via an Inngest function.
- [NEW] R5.6 THE SYSTEM SHALL retain companies.score as the tenant primary-ICP fit (the max-priority matching ICP per R8), so existing readers of companies.score (per-company.ts:184, dashboard, calculateContactFitScore at scoring.ts:234) keep working unchanged.
- [NEW] R5.7 THE SYSTEM SHALL expose, per company, the full vector of company_icp_fit rows so the UI can show which ICPs a company matches and at what score.

## R6. AI inference (ship in v1)

- [NEW] R6.1 WHEN a tenant requests AI ICP inference from a product description and best-customer example domains, THE SYSTEM SHALL propose one or more candidate ICPs, each with a name and a pre-filled set of criteria mapped onto the field catalog (R2).
- [NEW] R6.2 THE SYSTEM SHALL build on the existing icp-identification skill (skills/scoring/icp-identification/handler.ts:17-96) rather than a new LLM path, extending its output from one flat ICP to N catalog-mapped ICP candidates.
- [NEW] R6.3 WHERE the LLM proposes a field value, THE SYSTEM SHALL map it onto a catalog row (preferring a global apollo_search row) and SHALL drop any proposed field that maps to no catalog row, recording it as an unmapped suggestion.
- [NEW] R6.4 THE SYSTEM SHALL present every AI-proposed ICP as status draft requiring explicit user confirmation before it becomes active (consistent with the human-in-the-loop default in CLAUDE.md and agentApprovalMode review-each).
- [LOCKED] R6.5 THE SYSTEM SHALL route AI inference through the existing tracedGenerateObject provider (traced-ai.ts, Anthropic primary / OpenAI fallback) — per D4; no new model dependency.

## R7. Rule-builder UI (ship in v1)

- [NEW] R7.1 THE SYSTEM SHALL provide a UI to create, rename, archive, and set the priority of ICPs for the tenant.
- [NEW] R7.2 THE SYSTEM SHALL provide a UI to add/edit/remove criteria on an ICP: pick a field_key from the catalog (R2.5), pick an allowed operator (constrained by the catalog row operators), enter a value typed by value_type, set weight, and toggle is_required.
- [NEW] R7.3 WHEN the user selects a field, THE SYSTEM SHALL constrain the operator choices and the value input widget to those valid for the catalog row value_type (e.g. range -> two numeric inputs with between; multi_select -> chip picker with in).
- [NEW] R7.4 THE SYSTEM SHALL let the user trigger AI inference (R6) from inside the builder and load a proposed draft ICP into the editor for review before saving.
- [CFG] R7.5 THE SYSTEM SHALL render the ICP management UI under settings, replacing the single-form page at app/(dashboard)/settings/icp/page.tsx with a list + editor; the route stays /settings/icp.

## R8. Priority resolution

- [NEW] R8.1 WHERE a company matches more than one active ICP (has fit_score > 0 against multiple ICPs), THE SYSTEM SHALL designate the primary ICP as the matching ICP with the lowest priority integer (1 = highest priority); ties broken by highest fit_score, then most recent icps.created_at.
- [NEW] R8.2 WHEN enrolling a company into outbound, THE SYSTEM SHALL use the primary ICP (R8.1) to pick the sequence, so a company never lands in two ICPs conflicting sequences simultaneously.
- [NEW] R8.3 THE SYSTEM SHALL write the primary ICP fit_score to companies.score (R5.6) so the legacy scalar reflects the primary-ICP fit.

## R9. Sequence and signal ICP-binding

- [NEW] R9.1 THE SYSTEM SHALL add a nullable icp_id FK to sequences (outbound.ts:35), referencing icps(id) with ON DELETE SET NULL; NULL preserves today tenant-wide semantics.
- [NEW] R9.2 THE SYSTEM SHALL add a nullable icp_id FK to custom_signals (intelligence.ts:664), referencing icps(id) with ON DELETE SET NULL; NULL means the signal applies tenant-wide.
- [NEW] R9.3 WHERE a sequence.icp_id is set, THE SYSTEM SHALL only enroll companies whose primary ICP (R8.1) equals that icp_id.

## R10. Retro-compat migration + Pilae 4-vertical

- [NEW] R10.1 WHEN the migration runs for a tenant that has any of the 6 flat target* fields set, THE SYSTEM SHALL create exactly one icps row named "Default" (status active, priority 1) with icp_criteria equivalent to those flat fields (industries -> in on the industry catalog field, sizes -> between/in on employee range, etc.), so behavior is unchanged.
- [NEW] R10.2 THE SYSTEM SHALL make the retro-compat migration idempotent (guarded by a per-tenant marker, e.g. settings.multiIcpMigratedAt, mirroring ws1MigrationRanAt at tenant-settings.ts:226) so re-running creates no duplicate "Default" ICP.
- [NEW] R10.3 THE SYSTEM SHALL keep the 6 flat target* fields readable after migration (not dropped) so any un-migrated reader degrades gracefully; new writes go to icps.
- [NEW] R10.4 WHEN seeding the Pilae tenant, THE SYSTEM SHALL create 4 distinct icps rows — "SaaS / Tech", "Fintech", "Sante", "Agence" — each with criteria derived from the nested settings.icp block (scripts/seed-pilae-tenant.ts:39-60), superseding the inert nested shape.
- [NEW] R10.5 THE SYSTEM SHALL map the Pilae personas (decideur/influenceur/bloqueur, seed lines 42-46) onto each vertical ICP people-targeting criteria (person_seniorities/person_titles catalog fields), and the anti_icp list (line 47) onto is_required = true exclusion criteria (e.g. employee count gt 5).

## R11. Non-goals (SHALL NOT)

- R11.1 THE SYSTEM SHALL NOT introduce any TAM data source other than Apollo (D4).
- R11.2 THE SYSTEM SHALL NOT add a per-tenant ICP count limit (D1).
- R11.3 THE SYSTEM SHALL NOT drop or rename the 6 flat target* fields in this spec (kept for graceful degradation, R10.3).
- R11.4 THE SYSTEM SHALL NOT change contact-level scoring (calculateContactFitScore, scoring.ts:161-250) beyond letting it read the primary-ICP companies.score it already consumes.
- R11.5 THE SYSTEM SHALL NOT full-recompute the entire fit matrix on every change (R5.4) — incremental only.
- [HORS SCOPE] R11.6 THE SYSTEM SHALL NOT build per-ICP sequence authoring UI in this spec — only the icp_id binding (R9). Sequence-builder UX is tracked separately.
- [HORS SCOPE] R11.7 THE SYSTEM SHALL NOT migrate the learned scoring model (company-model-trainer) to be per-ICP in this spec — the model stays tenant-level and feeds the primary-ICP score.
