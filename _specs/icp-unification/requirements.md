# ICP Unification · Requirements (EARS)

> **Methodo:** Kiro (Spec → Plan → Execute). Ground truth verified against live code + prod DB 2026-06-11 (see `_audit/2026-06-11-icp-settings-redundancy.md` and `_audit/2026-06-11-icp-unification-mapping.md`).
> **Stack (LOCKED):** Next.js, Drizzle, Postgres, Inngest, Apollo. No new provider, no new table (uses `icps.metadata` jsonb).
> **Owner:** Martin Paviot.

## 0. Ground truth — verified, do NOT re-spec

- Two settings pages coexist: `/settings/icp` (18 flat keys on `tenants.settings`, written by PUT `api/settings/icp/route.ts:47-84`) and `/settings/icp-profiles` (rule-builder over `icps`/`icp_criteria`). No sync in either direction. [DONE — the thing being merged]
- `companies.score` readers expect 0-100: `GRADE_RANGES` (`lib/accounts/list-filters.ts:47-54`), `displayScore`/`formatScore`, `api/calls/campaign` (`score/100`). One reader assumes 0-1: `computePriorityScore` (`lib/scoring/priority-score.ts:11-12,34`). [VERIFIED]
- Writers in conflict: TAM insert 0-100 (`lib/tam-stream/per-company.ts:163-198`), matrix recompute 0-1 (`inngest/icp-fit-recompute.ts:152`), one-off `pilae-sic-heuristic` 0-1 (`scripts/apply-apollo-import.ts`, not a cron), `/api/score` 0-100 over flats (`app/api/score/route.ts:180`). Live prod (tenant 47dca783): 489/990 companies at score 0, max 0.85, all enriched rows display grade F. [VERIFIED]
- Recompute uses the penalizing `computeIcpFit` in a single Inngest step (~3k sequential writes, dies midway: `primaryIcpId` on 637/990 rows). The coverage-aware `computeIcpFitLevels` exists unused (`lib/icp/criteria-engine.ts:281-316`). `buildCompanyContext` never provides `person_titles`/`person_seniorities`/`hiring_job_titles` (`lib/icp/company-context.ts:80-165`). [VERIFIED]
- `icps.metadata` jsonb exists (`db/schema/icp.ts:47`). PATCH `/api/icps/[id]` replaces criteria wholesale in a transaction (`route.ts:75-94`). `/api/tam/build` already accepts `icpId` + `apolloOverrides` + `targetCount` together (`route.ts:163,262,344`). `sequences.icpId` shipped (`db/schema/outbound.ts:53`). `/api/icps/infer` is complete but has zero UI consumers. [VERIFIED]
- Flat-field writers (exhaustive): PUT `api/settings/icp`, `api/icp/apply` (`route.ts:32-45`), `api/onboarding/save` (3 sites), `api/onboarding/chat`. [VERIFIED]
- 96 ACTIVE "Default" ICPs with 0 criteria exist in prod (2026-06-01 migration shells); tenant 47dca783 has none. [VERIFIED]

### Locked product decisions (do not reopen)

- [LOCKED] D1. One ICP surface (the profiles), one separate "Product & Voice" surface. The legacy flat form dies.
- [LOCKED] D2. The flat `target*` keys survive as a **read-only mirror** written from the priority-0 profile — zero flat readers are modified in this spec.
- [LOCKED] D3. `companies.score` scale is 0-100 everywhere. The matrix `company_icp_fit.fit_score` stays 0-1.
- [LOCKED] D4. The guided editor is the default; the raw rule-builder survives behind "Advanced". `icps.metadata.uiState` is the editor's source of truth; criteria are derived from it at save.
- [LOCKED] D5. Phase 0 (scoring fix + backfill) ships before any UI change.

---

## R1. Scoring scale (Phase 0)

- R1.1 WHEN the recompute mirrors a company's primary-ICP fit into `companies.score`, THE SYSTEM SHALL write `round(100 × score01)` where `score01` is the blended fit defined in R2.4, and 0 when no ICP clears the threshold.
- R1.2 THE SYSTEM SHALL keep `company_icp_fit.fit_score` in [0,1] (the `fit_score >= 0.5` reads in `api/icps/route.ts:41` stay valid).
- R1.3 WHEN `signal-score-daily` computes `priority_score`, THE SYSTEM SHALL feed `computePriorityScore` with `companies.score / 100` (preserving the documented ~[0, 2.5] range).
- R1.4 THE SYSTEM SHALL provide a one-off backfill that (a) multiplies by 100 every `companies.score <= 1` with score > 0, (b) re-runs the recompute for every tenant owning ≥1 active ICP with criteria, (c) leaves 0-100 legacy scores untouched.
- R1.5 WHERE `/api/score` (manual rescore) computes the fit component, THE SYSTEM SHALL use the company's matrix-derived score (R1.1) instead of `calculateFitScore` over flat settings, keeping the engagement and signal components unchanged.
- R1.6 THE SYSTEM SHALL NOT leave any code path writing a 0-1 value into `companies.score` (regression test required).

## R2. Coverage-aware fit engine (Phase 0)

- R2.1 WHEN computing a (company, ICP) cell, THE SYSTEM SHALL evaluate required criteria as hard gates exactly as today (any unmatched required criterion → fit 0, `excludedBy` recorded).
- R2.2 THE SYSTEM SHALL compute soft fit as `Σ(weight × matched) / Σ(weight over EVALUABLE criteria)`, where a criterion is evaluable iff its fieldKey is present in the company context — absent fields leave the denominator (semantics of `computeIcpFitLevels`, `criteria-engine.ts:294`).
- R2.3 THE SYSTEM SHALL compute `coverage = Σ(weight evaluable) / Σ(weight all soft)` and persist `{identityFit, signalFit, coverage}` inside `company_icp_fit.matched_criteria`.
- R2.4 THE SYSTEM SHALL define the blended cell score as `score01 = fitEvaluable × (0.6 + 0.4 × coverage)` (single exported constant pair; worked examples in design.md §4).
- R2.5 WHERE an ICP has zero evaluable soft criteria for a company and no required criteria matched-or-present, THE SYSTEM SHALL score the cell 0 (no fabricated confidence).
- R2.6 THE SYSTEM SHALL treat `person_titles`, `person_seniorities`, `hiring_job_titles` as never-evaluable for company fit (they are absent from `buildCompanyContext` by construction) and SHALL keep them as sourcing/people filters (`to-apollo-params.ts:168-177` unchanged).

## R3. Recompute robustness (Phase 0)

- R3.1 THE SYSTEM SHALL chunk the tenant recompute into Inngest `step.run` batches of at most 100 companies, so a step timeout cannot leave the tenant half-written.
- R3.2 THE SYSTEM SHALL batch-upsert fit cells per chunk (single multi-row `INSERT … ON CONFLICT`) instead of one round-trip per cell.
- R3.3 WHEN a recompute completes, THE SYSTEM SHALL write a summary to `tenants.settings.lastIcpRecompute = { at, companies, regradedUp, regradedDown, unowned }` computed against the pre-run scores.
- R3.4 THE SYSTEM SHALL keep the existing guard: a tenant whose active ICPs all have zero criteria is not recomputed (protects legacy scores from empty "Default" shells).

## R4. Unified ICP page (Phase 1)

- R4.1 THE SYSTEM SHALL serve the profile list + editor at `/settings/icp`; `/settings/icp-profiles` SHALL redirect (301) to it; the sidebar SHALL show exactly one "ICP" entry.
- R4.2 THE SYSTEM SHALL order the profile list by `priority` and let the user reorder by drag; persisted `priority` = list index; the numeric input disappears from the default UI.
- R4.3 THE SYSTEM SHALL render the editor as guided sections (Who they are / What they use & say / Who to talk to / Sourcing filters) using the legacy widgets (searchable Apollo multi-selects, size chips, free-chip inputs, min-max amount fields), per the widget→criteria mapping table in `_audit/2026-06-11-icp-unification-mapping.md` §B.
- R4.4 THE SYSTEM SHALL expose a per-section importance control mapping Nice-to-have → weight 1, Important → weight 3, Must-have → `isRequired: true`.
- R4.5 THE SYSTEM SHALL label every input that does not affect company fit ("Sourcing only", "Finds contacts, doesn't score companies") from static field metadata — no silent inert criteria.
- R4.6 THE SYSTEM SHALL keep the raw rule-builder available behind an "Advanced criteria" disclosure; advanced criteria are persisted as-is and survive guided-section saves.
- R4.7 WHEN a profile has no `metadata.uiState` (created via API/AI before this spec), THE SYSTEM SHALL render all its criteria in the Advanced section (graceful degradation, no data loss).
- R4.8 THE SYSTEM SHALL provide "Suggest with AI" wired to the existing `POST /api/icps/infer`, loading candidates as `draft` profiles into the editor for explicit review before save.
- R4.9 THE SYSTEM SHALL move `productDescription`, `salesMotion`, `primaryChallenge`, `aiTone` to a new `/settings/product` page ("Product & Voice"), same `tenants.settings` keys (zero consumer changes).
- R4.10 THE SYSTEM SHALL allow members (not just admins) to create/edit profiles, keeping DELETE admin-only; disabled controls SHALL explain why instead of failing silently.

## R5. Save semantics: uiState → criteria → mirror (Phase 1)

- R5.1 WHEN the editor saves, THE SYSTEM SHALL persist in ONE transaction: `icps.metadata.uiState` (exact widget values), `icps.metadata.sourcingFilters` (`excludeGeographies`, `fundingRecencyDays`), and the criteria set regenerated deterministically from uiState plus the untouched advanced criteria.
- R5.2 WHERE the saved profile has the lowest priority value (rank 1), THE SYSTEM SHALL write-through the flat mirror keys (`targetIndustries`, `targetCompanySizes`, `targetGeographies`, `targetSeniorities`, `targetRoles` from person titles, `targetKeywords`, `targetTechnologies`, `targetRevenueMin/Max`, `totalFundingMin/Max`, `minJobOpenings`, `hiringTitles`, `excludeGeographies`, `fundingRecencyDays`) from uiState in the same request.
- R5.3 THE SYSTEM SHALL remove PUT `/api/settings/icp` (page gone); `api/icp/apply` SHALL upsert the priority-0 profile (uiState + criteria) instead of writing flats directly, inheriting R5.2's mirror.
- R5.4 WHEN onboarding saves ICP data, THE SYSTEM SHALL additionally create the tenant's first profile (name "Default", active, priority 0) with criteria via `legacySettingsToCriteria` and a matching uiState — every new tenant owns ≥1 real profile from day 1.
- R5.5 THE SYSTEM SHALL validate `metadata.uiState`/`sourcingFilters` shapes in `validateIcpInput` (additive; unknown keys rejected).

## R6. Sourcing unification (Phase 1)

- R6.1 WHEN building TAM from the Accounts page, THE SYSTEM SHALL offer a profile picker (default: priority-0 profile) and pass `icpId` to the existing `/api/tam/build`; the legacy no-icpId planner remains only as fallback for tenants with zero profiles.
- R6.2 WHERE a profile carries `sourcingFilters`, THE SYSTEM SHALL apply them to the Apollo search (`organization_not_locations`, `latest_funding_date_range` computed live) in the icpId path.
- R6.3 WHERE uiState carries exact size labels, THE SYSTEM SHALL source with `sizesToApolloRanges(labels)` instead of the between-envelope.

## R7. Feedback loops (Phase 1 for R7.1-7.2, Phase 2 for R7.3)

- R7.1 WHEN a profile save triggers a recompute, THE SYSTEM SHALL surface the `lastIcpRecompute` summary in the editor within 30 s (3 s polling, existing pattern) as "N companies regraded (X up, Y down), Z unowned".
- R7.2 THE SYSTEM SHALL show per-profile `fitCount` (matrix, ≥0.5) and an Apollo TAM estimate in the editor.
- R7.3 [Phase 2] THE SYSTEM SHALL show a per-profile outcome funnel (sourced → contacted → replied → meetings → won) aggregated via `properties.primaryIcpId`, plus false-negative (won deals scoring <50 on every profile) and false-positive (high-fit, zero replies in 45 d) alerts.

## R8. Cleanup & integrity (Phase 0/1)

- R8.1 THE SYSTEM SHALL delete (or populate from real flats, where flats exist) the 96 empty active "Default" ICPs; an active ICP with zero criteria SHALL no longer be creatable (validation).
- R8.2 THE SYSTEM SHALL keep GET `/api/settings/icp` responding (read-only, derived from mirror) until the last in-app consumer is confirmed gone, then remove it.
- R8.3 Every regression listed here SHALL get a test: scale invariance of `companies.score`, mirror write-through, uiState round-trip, chunked recompute resumability, redirect, R3.4 guard.

## R9. Non-goals (SHALL NOT)

- R9.1 No migration of the 25+ flat readers to direct criteria reads (Option C — separate effort).
- R9.2 No negation operator in the scoring engine (exclusions stay sourcing-only).
- R9.3 No per-ICP learned model; no new TAM source; no new tables.
- R9.4 No change to contact-level scoring beyond R1.5's fit source.
