# TAM Lifecycle — Office Hours (investigation + architecture)

> Investigated 2026-06-07 on `feat/page-elevation`. Every claim below was read
> from source (file:line) or confirmed by grep, not from stale docs.
> Question driving this: how do we BUILD the TAM, how does it LIVE over the
> company's lifetime, how do we ADD / REMOVE targets, and how do we ENRICH them
> — from which sources (today: Apollo only for sourcing).

---

## 1. Problem statement (one sentence)

The TAM is a **one-shot Apollo snapshot**: discovery is single-source and
domain-keyed, enrichment provenance is shallow and contact-side absent, and once
built the list does not *live* (no re-sourcing on ICP change, no freshness
refresh, no first-class "not a fit" feedback) — so the founder's market view
silently drifts from reality.

---

## 2. How it works today (verified map)

### Data model — `src/db/schema/core.ts`, `icp.ts`
- `companies` (= accounts): firmographics + `properties jsonb` catch-all +
  `score`/`scoreReasons` + `excludedReason`/`excludedAt` (anti-ICP) +
  `priorityScore` + `deletedAt` (soft delete). Keyed in practice on `domain`
  (no unique constraint; app-level dedup). `core.ts:48-98`
- `contacts`: `email`/`phone`/`title`/`linkedinUrl` + `properties jsonb` +
  `score` + `deletedAt`. **No `source`, no `lastEnrichedAt`, no email/phone
  verification columns** — all provenance lives loosely in `properties`. `core.ts:100-125`
- Multi-ICP engine: `icps`, `icpCriteria` (fieldKey→catalog, operator, value,
  weight, isRequired), `icpFieldCatalog` (`source ∈ apollo_search | apollo_enrich
  | custom_property | signal`, literal `apolloParam`), `companyIcpFit` matrix.
  **The targeting vocabulary is Apollo's** — `icp.ts:15-26, 108-144`.

### Discovery / build the TAM — `src/app/api/tam/build/route.ts`
- **100% Apollo.** `searchOrganizations` is the only source. LLM planner emits
  Apollo `OrgSearchParams`; ICP mode → `icpToStrategy` → Apollo params;
  accounts-list facets → `apolloOverrides`. Streams NDJSON; fans out 6 concurrent
  `runPerCompanyPipeline`. `build/route.ts:142-147, 326-333, 410-500`
- `runPerCompanyPipeline` input is an **Apollo `OrgSearchOrganization`** and is
  **domain-mandatory** — `extractDomain(search)` returns null → skip. Dedup,
  enrichment, contact discovery all pivot on `domain`. `per-company.ts:39-57, 93-108`
- It already calls the company enrichment **waterfall** (`per-company.ts:129`)
  but only to gap-fill investor names; Apollo `enrichOrganization` is primary.

### Enrichment — two maturity levels
- **Provider abstraction exists and is clean** — `CompanyEnrichmentProvider`
  (`name`, `priority`, `isAvailable`, `costCentsPerCall`, `geoAffinity ∈
  US|EU|AU|OTHER`, `enrich`) + registry + waterfall with per-field
  `ProvenanceEntry{provider,field,atIso}`. `company-enrichment/types.ts:84-116`
- Company providers registered: apollo(10) → datagma(20,EU) → firmable(20,AU)
  → crunchbase(20) → hunter(30) → llm-fallback(100). `register-defaults.ts`
- Contact waterfall LIVE & geo-routed: apollo(10) → kaspr(20,FR) → lusha(30,
  FR/CH/EU), saturation on {mobile + email + verified}. Via `/api/enrich-contacts`.
- BUT: the Inngest `enrichCompany` event handler (`functions.ts:36`) still does
  **Apollo-only**, bypassing the company waterfall. Inconsistent two paths.

### Other source clients that EXIST but are NOT wired to sourcing
- **SIRENE** (`recherche-entreprises-client.ts`) — keyless, free, exhaustive FR;
  search by NAF / département / tranche d'effectif; returns SIREN + name + NAF +
  effectif + dirigeant names + finances. **No domain field** (`:13`). Unwired.
- **Pappers** (`pappers-client.ts` + `to-pappers-params.ts`) — FR registry,
  **has website/domain**; ICP→params translator written but unused.
- **Zefix** (`zefix-client.ts`) — CH national; search by NAME only, verification
  not discovery; no sector/effectif filter.
- Zeliq (async webhook, on-demand), Clearbit (visitor IP), Datagma/Firmable/
  Hunter (enrichment), Crunchbase (funding signal).

### Add / remove targets (mostly EXISTS)
- Add: `POST /api/accounts`, `POST /api/contacts`, `POST /api/accounts/extract-
  contacts` (Apollo people for selected accounts), CSV `/api/import/smart/commit`.
- Remove: `DELETE /api/accounts/[id]` + `/api/accounts/batch` (soft, `deletedAt`),
  `DELETE /api/contacts/[id]` (soft, blocks if active sequence). No hard delete.
- `excludedReason` is read by enrollment gating only (`enrollment-eligibility.ts`,
  `signal-to-sequence.ts`, `signal-score-daily.ts`) — **no user "not a fit"
  action** writes it from the list.
- Lists are server-fetched, soft-delete filtered, smart-search (LLM industry
  match) + column filters + tabs (All / Prospects / Manual via `properties.source`).

### Lifecycle loops today
- `icpFitRecomputeDaily` (cron `0 5 * * *`) + `icp/recompute-tenant` event —
  **re-scores** the fit matrix; never **re-sources**.
- `signal-score-daily` — refreshes `priorityScore`.
- `call-campaign-source` (`sourceProspectsFromIcp`) — event-driven Apollo
  sourcing for the call queue, off the **flat** tenant settings (second ICP path).
- **No enrichment-freshness cron** anywhere in ~40 Inngest functions.

---

## 3. The six gaps (the elegant solution must close)

- **G1 — Discovery monoculture.** Sourcing is Apollo-only; no source abstraction;
  the ICP catalog is Apollo-shaped. SIRENE/Pappers/Zefix sit unused.
- **G2 — Domain-keying blocks francophone sourcing.** The pipeline demands a
  domain; SIRENE (the authoritative FR source) has none → needs a domain-
  resolution bridge. This is the literal reason "on a juste Apollo".
- **G3 — Provenance is shallow & asymmetric.** Companies get per-run provenance
  only via `/api/enrich`; contacts have no provenance columns at all. No per-field
  source, no freshness → no selective re-enrichment, no "how stale is this", no audit.
- **G4 — The TAM doesn't live.** ICP change re-scores but never re-sources;
  enrichment is one-shot at creation; membership is a manual snapshot.
- **G5 — Removal is delete-only.** No first-class "not a fit / exclude" that
  feeds the anti-ICP filter forward into discovery and teaches the scorer.
- **G6 — Two ICP sources of truth.** Flat `tenants.settings` vs the multi-ICP
  entity; discovery reads both inconsistently → drift.

---

## 4. Premise challenge

- *"Just add SIRENE to the build route."* — Rejected: bolts a second hardcoded
  source onto a domain-keyed Apollo path; doesn't solve G2/G3/G4 and ages badly.
- *"Greenfield a new TAM service."* — Rejected (ocean): the enrichment provider
  pattern is already the right shape; rebuilding throws away working code and the
  live contact waterfall. The elegant move is to **mirror** it for discovery.
- *"Provenance as a join table."* — Rejected for v1: adds N+1 + migration weight;
  a `fieldProvenance jsonb` map on the row matches the existing `properties`
  ethos with zero join cost. Promote to a table only if audit/query needs grow.

---

## 5. Elegant target architecture

**One sentence:** the TAM lifecycle = three source-agnostic registries
(**Discover · Enrich · Signal**) over one normalized entity with first-class
**provenance + freshness**, driven by **one ICP**, kept alive by **event + cron loops**.

1. **`DiscoverySource` registry** mirroring `CompanyEnrichmentProvider`:
   `name · priority · isAvailable · costCentsPerCall · geoAffinity · supports(criteria)
   · search(query, ctx): AsyncIterable<DiscoveredCandidate>`.
   `DiscoveredCandidate = { sourceName, nativeId, name, domain|null, geo,
   firmographics…, rawRef }`. Adapters: apollo (wrap `searchOrganizations`),
   pappers (FR, has domain), sirene (FR, no domain), zefix (CH). Each ships its
   own ICP→params translator (reuse `to-apollo-params`, `to-pappers-params`).
2. **ICP → source routing.** TAM build fans out across the sources whose
   `geoAffinity`/`supports` match the ICP's geo + criteria, merging one candidate
   stream. FR ICP → SIRENE/Pappers first; CH → Zefix; else Apollo.
3. **Domain-resolution bridge** (the SIRENE unlock): a normalize step that, for a
   domain-less candidate (name + SIREN/UID + locality), resolves a domain via the
   enrichment waterfall before it enters the pipeline. Generalize
   `runPerCompanyPipeline` to accept `DiscoveredCandidate`; dedup by
   `domain ?? sourceName+nativeId`.
4. **First-class provenance + freshness.** Add to companies & contacts:
   `fieldProvenance jsonb` (`{field → {source, atIso, confidence}}`),
   `sourceSystem text`, `lastEnrichedAt timestamptz`, `nativeIds jsonb`
   (`{apollo, siren, zefix_uid, …}`); promote `emailStatus`/`phoneStatus` on
   contacts. Both waterfalls write provenance per field.
5. **The TAM lives.** ICP activate → `icp/source-tenant` (discovery fan-out for
   net-new) + existing recompute. New `tam.refresh.daily` cron re-enriches the
   stalest `lastEnrichedAt` slice within budget + re-validates emails/phones.
   `signal-score-daily` keeps priority fresh. "Not a fit" action → `excludedReason`
   → drops from queues, filters future discovery, teaches the scorer.
6. **Unify the ICP.** Multi-ICP entity becomes the single source of truth; flat
   settings become a projected read-model; discovery/scoring/enrichment read one place.

---

## 6. Phased plan (each phase independently shippable + tested)

- **P0 — Provenance & identity foundation (schema).** Add `fieldProvenance`,
  `sourceSystem`, `lastEnrichedAt`, `nativeIds` to companies+contacts; promote
  `emailStatus`/`phoneStatus`. Backfill from `properties`. Wire both waterfalls
  to write per-field provenance. Migration mindful of the live-DB drift footgun.
  *Low-regret; unlocks P2–P3.* Completeness target 9/10.
- **P1 — DiscoverySource abstraction + Apollo adapter (pure refactor).** Extract
  registry/interface; wrap the current Apollo path as source #1; generalize
  `runPerCompanyPipeline` to `DiscoveredCandidate`. No behavior change. 9/10.
- **P2 — Francophone sources.** Pappers (direct, has domain) + SIRENE (via
  domain-resolution bridge) + Zefix (CH). NAF crosswalk for SIRENE params (reuse
  Pilae NAICS crosswalk). Geo-routing. Provenance records the finder. 8/10.
- **P3 — The TAM lives.** `icp/source-tenant` on activate; `tam.refresh.daily`
  staleness cron; "not a fit" exclude action + anti-ICP feedback; surface source
  + freshness + "re-enrich" in accounts/contacts UI. 8/10.
- **P4 — Unify ICP + add/remove polish.** Multi-ICP as source of truth; bulk
  exclude; "why in my TAM / why excluded" explainability from provenance +
  `companyIcpFit.matchedCriteria`. 8/10.

---

## 7. Layer check (Three layers of knowledge)
- L1 (tried & true): provider/registry/waterfall pattern — already in-repo, reuse.
- L2 (new & popular): keyless gov registries (SIRENE/recherche-entreprises,
  Zefix/LINDAS) as authoritative EU firmographics — scrutinized, already
  client-wrapped & memory-noted.
- L3 (first principles): the domain-resolution bridge + per-field provenance is
  the genuinely novel, prized piece — it's what lets a domain-less authoritative
  source feed a domain-keyed engine and lets the TAM *live*.

---

## 8. Shipped — vivant phase (2026-06-07, branch feat/tam-lifecycle)

Order chosen with Martin: **lifecycle before new sources**, **approval-queue
posture** (the loops propose; the founder approves; nothing spends enrichment
credits without an OK).

- **Exclude "not a fit"** (`dd3a0efe`). `POST /api/accounts/exclude`
  `{ids|all, action: exclude|include, reason?, note?}` (reversible, audited).
  Excluded rows are hidden from the default accounts list (`?excluded=true|all`
  to review), stay in the row set so the TAM-build dedup never re-sources them,
  and were already gated out of enrollment. Bulk + per-row UI + header toggle.
- **Freshness + origin primitive** (`679a5dff`). `last_enriched_at` +
  `source_system` on companies & contacts (migration 0062, backfilled), stamped
  at every enrichment completion point + creation. `isEnrichmentStale()` predicate.
- **Proposal queue** (`3ad37845`). `tam_proposals` table (migration 0063) +
  `lib/tam/proposals.ts` (propose/apply/decide/list) + `GET /api/tam/proposals`
  + `POST /api/tam/proposals/decide` + `/tam/review` surface + a "Proposals (N)"
  entry point in the accounts header.
- **Living loops** (this commit). `tam.refresh.daily` cron proposes the stalest
  companies for re-enrichment (bounded per tenant); `icp/source-tenant` (fired
  when an ICP is activated) sources a bounded Apollo page and proposes the
  net-new domains. Both feed the approval queue; `lib/tam/candidate.ts` is the
  pure, source-agnostic candidate→add-proposal mapping (ready for SIRENE/Pappers
  to normalise into in the multi-source phase).

Tests: exclude API, list-filter, freshness, proposals, candidate mapping.

## 9. Shipped — multi-source discovery (2026-06-07)

Stops the TAM being Apollo-only for sourcing, the second half of the brief.

- **`DiscoverySource` registry** (`lib/discovery/`) mirroring the enrichment
  registry: `DiscoverySource` interface + `DiscoveredCandidate` (domain may be
  null) + source-agnostic `candidateToAddPayload`; lazy defaults, priority
  order, availability filter.
- **Adapters** wrapping the existing clients + ICP→params translators:
  - apollo (priority 10, global) — wraps `searchOrganizations`.
  - pappers (20, FR, key-gated) — `criteriaToPappersParams` (industry→NAF,
    geo→FR regions, effectif→tranches); carries a real domain → no bridge.
  - sirene (30, FR, **keyless**) — new `criteriaToSireneParams` (NAF + tranche,
    FR-gated, sector-driven); **domainless** candidates.
- **Domain-resolution bridge** (`lib/discovery/resolve-domain.ts`): the seam
  that lets a domainless registry (SIRENE) feed the domain-keyed flow. Resolves
  at **approval time** (lazy, only for approved adds): existing domain →
  Pappers fiche-by-SIREN (`companyDomainBySirenPappers`, key-gated) → null
  (then inserted identity-only with its SIREN). Extensible (name→domain next).
- **`icp/source-tenant` fans out** across every available source, dedups by
  domain (or SIREN for domainless), queues `add` proposals tagged by source.
- Tests: registry ordering/availability, payload mapping, SIRENE/Pappers param
  translation + non-FR skip, resolve-domain. 37 tests green across the feature.

### Still remaining (next)
- Wire SIRENE/Pappers into the **streaming** `/api/tam/build` too (today only
  the ICP-activation loop is multi-source; the live build is still Apollo-only).
- Zefix (CH) adapter. Full per-field provenance (`fieldProvenance`/`nativeIds`
  as columns). Unify the two ICP sources of truth (flat settings vs entity).
- A name→domain resolver so SIRENE candidates resolve without a Pappers key.
