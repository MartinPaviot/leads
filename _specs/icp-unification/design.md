# ICP Unification · Design

> Companion to `requirements.md`. All paths relative to `app/apps/web/src/`. No new tables; one jsonb convention + one settings key.

## 1. Data model

### 1.1 `icps.metadata` conventions (existing jsonb column, `db/schema/icp.ts:47`)

```ts
type IcpMetadata = {
  uiState?: {
    industries: string[];          // Apollo taxonomy labels
    companySizes: string[];        // exact size labels ("51-200")
    geographies: string[];
    revenueMin: number | null;
    revenueMax: number | null;
    technologies: string[];
    keywords: string[];
    totalFundingMin: number | null;
    totalFundingMax: number | null;
    minJobOpenings: number | null;
    hiringTitles: string[];
    seniorities: string[];         // apollo person_seniorities values
    personTitles: string[];
    importance: Partial<Record<SectionKey, "nice" | "important" | "must">>;
  };
  sourcingFilters?: {
    excludeGeographies: string[];
    fundingRecencyDays: number | null;
  };
  // existing free-form keys (AI provenance, colour) untouched
};
```

- `uiState` is the editor's source of truth. **Criteria are derived from it at save** (pure function `uiStateToCriteria()` colocated with `flat-to-criteria.ts`); advanced criteria — those NOT regenerable from uiState — are tagged by listing their criterion ids under `metadata.advancedCriteriaIds` and are preserved verbatim across saves.
- Profiles without `uiState` (AI- or API-created pre-spec) render fully in the Advanced section (R4.7). No backfill required.

### 1.2 Importance mapping

| UI value | weight | isRequired |
|---|---|---|
| Nice-to-have | 1 | false |
| Important | 3 | false |
| Must-have | (weight kept) | true |

Default per section: geography Must-have, industries/size Important, the rest Nice-to-have (mirrors today's hand-authored Pilae profiles).

### 1.3 `tenants.settings.lastIcpRecompute`

```ts
{ at: string; companies: number; regradedUp: number; regradedDown: number; unowned: number }
```

Written by the recompute (last step), read by `GET /api/icps/recompute-status`, polled by the editor (3 s, same pattern as `components/TAMRevealNotification.tsx:15-22`).

## 2. Score formula (R2) — locked constants + worked examples

```
required unmatched        → cell = 0 (excludedBy recorded)         [unchanged]
fitEvaluable = Σ(w·matched) / Σ(w over criteria whose fieldKey ∈ context)
coverage     = Σ(w evaluable) / Σ(w all soft)
score01      = fitEvaluable × (COVERAGE_FLOOR + COVERAGE_SPAN × coverage)   // 0.6 + 0.4·c
companies.score = round(100 × score01 of primary ICP), 0 if unowned
```

Worked examples (the prod "Scale-up Tech / SaaS B2B" profile: geo required; soft = emp w3, industry w2, keywords w1, funding w1, tech w3 — person_* excluded by R2.6):

| Company | Evaluable | fitEvaluable | coverage | score |
|---|---|---|---|---|
| Registry-sourced (SIRENE), sector+size match | emp, industry (5/10) | 5/5 = 1.0 | 0.5 | **80 (A)** — was 0.42→score 0 before |
| Fully enriched, tech mismatch | all 10 | 7/10 | 1.0 | **70 (B)** |
| Fully enriched, all match | all 10 | 1.0 | 1.0 | **100 (A+)** — was capped 0.83 before |
| Wrong canton (required geo fails) | — | — | — | **0** |

Sanity properties: never zero for lack of enrichment; perfect+complete = 100; un-enriched can reach at most 100×(0.6+0.4·cov) — confidence is priced in, not fatal.

## 3. Save flow (R5)

```
PATCH /api/icps/[id]   body: { name, status, priority, description, criteria(advanced-only ok), metadata: { uiState, sourcingFilters } }
  validateIcpInput (+ metadata shapes)                    lib/icp/validation.ts
  tx:
    update icps (name/status/priority/description/metadata)
    delete icp_criteria where icp_id                       [existing wholesale pattern, route.ts:81]
    insert uiStateToCriteria(uiState) ++ advanced criteria
    if priority == min(tenant priorities):                 // rank 1 → mirror
      updateTenantSettings(tenantId, mirrorFromUiState(uiState, sourcingFilters))
  send icp/recompute-tenant
```

- `mirrorFromUiState` writes exactly the flat keys listed in R5.2. `targetRoles` mirror = `personTitles.join(", ")` (keeps `deriveTargetRoles`' fallback consistent); `targetSeniorities` = `seniorities`.
- `POST /api/icps` (create) takes the same body; onboarding (R5.4) and `api/icp/apply` (R5.3) construct `uiState` server-side and call the same helpers — one code path for criteria generation and mirroring.
- Drag-reorder = `POST /api/icps/reorder { orderedIds }` → sets priority = index in one tx → recompute (primary resolution depends on priority).

## 4. Recompute redesign (R3) — `inngest/icp-fit-recompute.ts`

```
step "load"        → active ICPs + criteria (skip if none has criteria — guard kept)
step "snapshot"    → SELECT id, score FROM companies WHERE tenant … (grade buckets only)
for each batch of 100 companies:                  // ceil(990/100) = 10 steps for Pilae
  step "score-{i}" → build contexts, computeIcpFitLevels per ICP,
                     ONE multi-row INSERT…ON CONFLICT for ≤200 cells,
                     ONE bulk UPDATE companies (unnest VALUES join) for score+primaryIcpId
step "summary"     → diff vs snapshot → tenants.settings.lastIcpRecompute
```

- Engine change: replace `computeIcpFit` with `computeIcpFitLevels` + blend (§2); persist `{identityFit, signalFit, coverage}` into `matched_criteria`.
- R2.6 exclusion is structural (those keys never appear in `buildCompanyContext`); add a static `SOURCING_ONLY_FIELD_KEYS` set in `lib/icp/field-catalog.ts` used ONLY for UI labels and for excluding the keys from the `coverage` denominator (so a People-only profile doesn't read as "0% covered").
- Idempotent: each batch recomputes absolute values; a retried step rewrites the same rows.

## 5. Sourcing path changes (R6)

- `icpToStrategy` (`lib/icp/icp-to-tam.ts`): accept the icp row (not just criteria); when `metadata.uiState.companySizes` present → `sizesToApolloRanges(labels)` (exact), else keep envelope. Merge `sourcingFilters` → `organization_not_locations`, `latest_funding_date_range` (computed from `fundingRecencyDays` at build time — never frozen).
- Accounts page: profile picker beside "Build TAM" (default = rank-1 profile, fetched from `GET /api/icps`); passes `icpId` through the existing `useTamStream.start(opts)` body — server already accepts it with overrides (`api/tam/build/route.ts:262,344`).

## 6. Pages & navigation (R4)

- `/settings/icp` → the unified page (list + editor as described in `_audit/2026-06-11-icp-unification-mapping.md` §B and the UX sketch in the conversation of 2026-06-11). `/settings/icp-profiles/page.tsx` → `redirect("/settings/icp")`.
- `/settings/product` ("Product & Voice"): the 4 product fields, `SettingsHeader` convention, same settings keys, PUT via a slim `api/settings/product` route (clone of the surviving half of `api/settings/icp`).
- Sidebar (`settings-sidebar.tsx:65-66`): one "ICP" entry (Target icon) + "Product & Voice". CTA links updated: `accounts/page.tsx:824`, `TAMRevealNotification.tsx:121`.

## 7. Backfill & cleanup (R1.4, R8.1) — one script, idempotent, read-then-write with dry-run flag

1. `UPDATE companies SET score = round(score*100) WHERE score > 0 AND score <= 1` (per tenant, logged counts).
2. Delete empty active "Default" ICPs (criteria count 0) — except where the tenant's flats are non-empty: there, populate via `legacySettingsToCriteria` + synthesized uiState instead.
3. Fire `icp/recompute-tenant` for every tenant with ≥1 active criteria-bearing ICP.
4. Verify: assert no `companies.score` in (0,1] remains; print per-tenant grade distribution before/after.

## 8. Failure handling

- Recompute step failure → Inngest retries that batch only; summary step compares against the pre-run snapshot regardless.
- Mirror write fails mid-tx → whole PATCH rolls back (criteria and mirror never diverge).
- Poll endpoint: stale `lastIcpRecompute` (< save timestamp) → editor shows "Rescoring…" until fresh or 60 s cap (then "still running — check back").
- AI inference: candidates failing `validateIcpInput` are shown disabled with the validation error (existing `valid`/`validationError` fields of `/api/icps/infer`).

## 9. Security & permissions

- All reads/writes tenant-scoped as today (`loadOwnedIcp`, RLS). Mirror writes go through `updateTenantSettings` (tenant-scoped).
- POST/PATCH/reorder: members allowed (drop `requireAdmin`, matching the documented legacy decision `api/settings/icp/route.ts:51-54`); DELETE stays admin. Viewer: read-only, controls disabled with explanation (R4.10).

## 10. Test plan (maps to R8.3)

| Test | Asserts |
|---|---|
| `score-scale.test` | recompute mirror ∈ {0} ∪ [1,100]; no writer produces (0,1) |
| `ui-state-roundtrip.test` | uiState → criteria → save → reload → identical uiState; advanced criteria survive |
| `mirror-write-through.test` | rank-1 save updates all R5.2 flat keys; rank-2 save does not |
| `fit-levels.test` | §2 worked examples exact; person_* never in coverage denominator |
| `recompute-chunk.test` | 250-company fixture → 3 batches; killing batch 2 leaves batches 1 intact + retry completes |
| `icp-apply-reroute.test` | `api/icp/apply` upserts rank-1 profile and flats match |
| `redirect+sidebar.test` | `-profiles` 301s; single sidebar entry |
| `empty-active-icp.test` | active ICP with 0 criteria rejected at validation |
