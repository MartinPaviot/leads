# PR #5 architectural primitives — consolidated inventory

**Shipped in:** `9a1d937` (PR #5, "WS-0 PR 1"), 2026-04-21
**Document type:** Tier 2 — existence/dependency map, not full specs.
**Written:** 2026-04-22

---

## 1. Company-enrichment waterfall

**Files:** `lib/providers/company-enrichment/` (8 files: types, registry, waterfall, apollo-adapter, llm-fallback-adapter, register-defaults, index, README) + `_specs/PROVIDER-ABSTRACTION/` (3 files).

**What it does:** Domain-scoped provider registry + waterfall orchestrator for company enrichment. Callers request data (description, industry, size, technologies) and the waterfall tries providers in priority order. Apollo adapter runs first; LLM fallback fills remaining gaps. Merge rules: first non-null wins on scalars, arrays union+dedupe. Early-exit on saturation (industry + description + size all populated). Provenance stamp per contributed field + cumulative cost tracking.

**Depends on:** Apollo client, LLM fallback (tracedGenerateObject), Drizzle ORM.

**Depended on by:** `api/enrich/route.ts` (migrated off direct Apollo/LLM imports), `lib/tam-stream/per-company.ts` (per-company enrichment during TAM build).

**Test coverage:** 10 in-memory waterfall tests in `__tests__/providers/company-enrichment.test.ts` (313 LOC). Covers saturation, merge, fallback, unavailable-skip, all-fail, cumulative cost, provider replacement.

---

## 2. Relationship graph + KNOWS edges

**Files:** `lib/relationship-graph.ts` (361 LOC), `api/warm-paths/route.ts` (60 LOC), `inngest/relationship-graph-builder.ts` (77 LOC).

**What it does:** Adds a "KNOWS" relation type on the existing `context_graph_edges` table. `buildKnowsFromActivities()` aggregates outbound email frequency per (user, contact) pair and upserts edges with log-curve confidence (2 emails → 0.30, 20 → 0.72, 100+ → ~0.95). `findWarmPathsToCompany(s)()` resolves one-hop warm-intro paths (user → contact at company). No schema migration — reuses existing `relation_type` free-text column.

**Depends on:** DB tables (`activities`, `contacts`, `users`, `contextGraphNodes`, `contextGraphEdges`).

**Depended on by:** `inngest/relationship-graph-builder.ts` (nightly cron at 03:15 UTC + on-demand event), `lib/tam-stream/per-company.ts` (warm-path resolution during TAM build), `api/warm-paths/route.ts` (batched API for accounts page "Connected to" column), `lib/warm-leads.ts` (WS-3).

**Test coverage:** 9 pure-function tests in `__tests__/relationship-graph.test.ts` (70 LOC). Pins confidence curve + edge gate logic. No integration tests for SQL queries.

---

## 3. Sequence dispatch abstraction

**Files:** `lib/sequence-dispatch/` (7 files: types, registry, index, email-adapter, linkedin-adapter, register-defaults) + migration `0020_sequence_step_channels.sql`.

**What it does:** Channel-agnostic step dispatcher. Registry (`registerAdapter`, `getAdapter`, `dispatchStep`) routes sequence steps to channel adapters. Email adapter delegates to existing `sendSequenceStep` pipeline. LinkedIn adapter is a stub (`isAvailable: false`). Migration 0020 adds `sequence_steps.step_type` (default "email") + `channel_config` JSONB. Backward-compatible — existing rows become email steps.

**Depends on:** Existing `sendSequenceStep` pipeline (email adapter delegates to it).

**Depended on by:** Sequence orchestration code (imports `dispatchStep`). Currently only email channel is active.

**Test coverage:** 7 unit tests in `__tests__/sequence-dispatch.test.ts` (121 LOC). Covers missing/unavailable adapter, happy path, error capture, re-registration, email delegation, LinkedIn stub.

**Note:** LinkedIn adapter is dormant. Email adapter is a delegating shim. This primitive is infrastructure for future multi-channel sequences but has no new user-visible behavior today.

---

## 4. Signal outcomes + Bayesian multipliers

**Files:** `lib/signal-outcomes.ts` (193 LOC), `lib/signal-detectors.ts` (92 LOC), `lib/score-with-signals.ts` (73 LOC) + migration `0021_signal_outcomes.sql`.

**What it does:** Closes the scoring feedback loop. When a deal moves to won/lost, `recordDealOutcome()` detects which signals had fired on the company (funding, hiring, tech change, leadership change, investor overlap) and inserts rows to `signal_outcomes`. `getSignalMultipliers()` computes Bayesian-smoothed lift per signal type vs baseline win rate. Minimum 10 observations required. Clamp [0.5x, 2.5x]. `scoreSignals()` (pure function) applies multipliers to compute a 0-20 point scoring bonus.

**Depends on:** `signal_outcomes` table (migration 0021), `companies.properties` (signal presence), `deals` table.

**Depended on by:** `api/deals/[id]/route.ts` PUT (fire-and-forget `recordDealOutcome` on stage change), `api/score/route.ts` (reads multipliers, applies bonus via `scoreSignals`).

**Test coverage:** `__tests__/signal-outcomes.test.ts` (62 LOC, 8 tests) + `__tests__/score-with-signals.test.ts` (73 LOC, 6 tests). Covers lift math, sample-size gate, clamps, no-signal/unknown-multiplier paths.

---

## 5. Inbound visitor-ID pixel

**Files:** `lib/inbound/write-keys.ts` (100 LOC), `lib/inbound/record-visitor.ts` (83 LOC), `api/public/pixel/track/route.ts` (80 LOC), `public/leadsens-pixel.js` (83 LOC) + migration `0022_inbound_module.sql`.

**What it does:** Public tracking pixel for customer websites. `leadsens-pixel.js` (zero-deps, sendBeacon + fetch keepalive fallback) sends pageview pings to `/api/public/pixel/track`. The endpoint validates via SHA-256 write-key lookup (no session auth, CORS open), upserts visitor sessions (bump event count on repeated pings), and records raw IP + UA for future deanonymization. Write keys are issuable and revocable. No downstream enrichment providers wired yet — identification fields are null stubs.

**Depends on:** `inbound_write_keys` + `inbound_visitors` tables (migration 0022), crypto (SHA-256).

**Depended on by:** nothing active. The pixel endpoint exists but no UI manages write keys and no cron processes visitors. This primitive is dormant infrastructure.

**Test coverage:** `__tests__/inbound-write-keys.test.ts` (30 LOC, 4 tests). Covers SHA-256 determinism, no-collision, no-raw-leak, empty-string edge.

**Security note:** The endpoint accepts POST from any origin (CORS open). Write-key validation exists but the public surface should receive a focused security review before any production traffic. The `leadsens-pixel.js` file is served from the public directory and is designed to be embedded on customer websites.

---

## 6. Investor-overlap signal skill

**Files:** `skills/signals/investor-overlap/handler.ts` (162 LOC), `index.ts` (15 LOC), `schema.ts` (37 LOC).

**What it does:** Detects common investors between the tenant's cap table (from `TenantSettings.companyInvestors`) and target companies' Apollo funding rounds / user-entered investor lists. Normalizes investor names (lowercase, strip legal suffixes). Stamps results on `companies.properties.investorOverlap` with `scannedAt` to avoid rescanning. Strength score = overlap_count / tenant_investor_count. No external API cost — pure DB + settings join.

**Depends on:** `getTenantSettings()` (for `companyInvestors`), `companies` table (properties), skill registration infrastructure.

**Depended on by:** Registered in `skills/register-all.ts`. The `investor_overlap` detector in `signal-detectors.ts` reads results for outcome attribution and live scoring. Also called inline by `lib/tam-stream/signals/investor-overlap.ts` during TAM build.

**Test coverage:** no dedicated test file. Logic is covered indirectly by `tam-stream-signals.test.ts` (3 investor_overlap cases).

---

## Cross-cutting observations

1. **Migrations 0020-0023** were all shipped in PR #5. They add tables and columns to the production schema. Reversing any of them requires hand-written reverse migrations.
2. **3 primitives are dormant:** sequence dispatch (LinkedIn stub only), inbound pixel (no UI, no processing), investor overlap skill (registered but no standalone cron trigger — only runs inline during TAM build).
3. **3 primitives are actively load-bearing:** company-enrichment waterfall (every enrichment call), relationship graph (WS-3 warm-leads + TAM build), signal outcomes + scoring (every score computation).
