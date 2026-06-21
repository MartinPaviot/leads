# Retroactive spec: TAM streaming infrastructure

## Status
- Shipped in: `9a1d937` (PR #5, "WS-0 PR 1"), 2026-04-21. Tests + runtime fixes in `550e342` (PR #10, "WS-1 PR A"), 2026-04-21.
- Spec written: 2026-04-22
- Reviewed by Martin: pending

## Purpose
Builds a Total Addressable Market in real-time, visible on the accounts page. The founder clicks "Find more accounts", the server fans out per-company enrichment pipelines, and rows stream into the table as they complete — fully populated with score, signal chips, and warm-intro badges. Replaces the previous batch-and-wait TAM flow with a live streaming experience matching Monaco's "TAM builds in front of you" pattern.

## Current behavior

### Build endpoint (`api/tam/build/route.ts`)
- **Protocol:** NDJSON streaming over HTTP (Node runtime, `maxDuration: 300`).
- **Auth:** `getAuthContext()` — any authenticated user.
- **Rate limit:** `checkRateLimit("llm", userId)`.
- **Hello event:** emits `{ type: "hello" }` immediately before any DB/LLM work so the client knows the stream opened.
- **Strategy phase:** LLM generates a TAM search strategy (2-6 Apollo queries) via `tracedGenerateObject` with agentId `build-tam`.
- **Execution phase:** for each strategy query, calls Apollo org-search, then for each company runs a per-company pipeline (enrichment → scoring → signal detection → warm-path lookup) with 6-way concurrency limiter.
- **Per-company pipeline** (`lib/tam-stream/per-company.ts`): enrichment via waterfall providers, score computation, 4 built-in signals (investor overlap, funding recent, hiring intent, YC company) + custom signals, warm-path resolution, contact discovery.
- **Events emitted:** `row` (fully populated company), `progress` (counters), `error` (per-company failures), `done` (completion summary).
- **Ordering:** rows arrive ordered by completion time, not score. Client-side reducer re-sorts by score DESC + lit-signal-count DESC.

### 4 built-in signal detectors (`lib/tam-stream/signals/`)
- **investor_overlap:** intersects tenant's cap-table investors with Apollo funding_rounds. Produces a `{ value, reason, sources, confidence }` result.
- **funding_recent:** checks if latest funding round is within 180 days.
- **hiring_intent:** checks Apollo `num_current_job_openings > 0`.
- **yc_company:** heuristic detection via name patterns + YC batch codes.
- Each detector verifies sources via 800ms HEAD-check before emission.

### Client-side hook (`hooks/use-tam-stream.ts`)
- Reducer-based React hook that merges streamed rows with DB-backed accounts list.
- Actions: `row`, `progress`, `error`, `done`, `stream_closed` (fallback when stream ends without `done`).
- `stream_closed` action (added in `0ea5751` runtime fixes): fires from the reader's natural exit, sets `isRunning: false` and picks `terminated: "error"` when the errors array isn't empty.
- Exports `initialTamStreamState` for test access.

### Accounts page integration
- Merged accounts = DB-loaded + streamed rows (deduplicated by company ID).
- Empty state guard uses `mergedAccounts.length` (fixed in `0ea5751` — previously used `accounts.length` which only counted DB rows, hiding streamed rows behind "No accounts").
- Signal chips render per-company with popover details.
- TAM build progress bar shows company count + elapsed time.

## Dependencies

### Upstream (what calls this)
- `accounts/page.tsx` — "Find more accounts" button triggers the stream.

### Downstream (what this calls)
- `lib/traced-ai.ts:tracedGenerateObject` — strategy generation (agentId `build-tam`).
- `lib/apollo-client.ts:searchOrganizations` — per-strategy-query org search.
- `lib/providers/company-enrichment/waterfall.ts` — multi-provider enrichment.
- `lib/tam-stream/signals/*` — 4 built-in signal detectors.
- `lib/custom-signals/detector.ts` — per-company custom signal evaluation.
- `lib/relationship-graph.ts:findWarmPathsToCompanies` — warm-intro resolution.
- `lib/apollo-client.ts:searchPeople` — contact discovery per company.
- `lib/scoring.ts` — ICP fit score computation.
- `lib/tam-stream/verify-source.ts` — HEAD-checks on signal source URLs.

### Data read/written
- Reads: `companies` (existing TAM), `tenants.settings` (ICP filters, investors), `custom_signals` (active signals).
- Writes: `companies` (new rows via enrichment), `agent_traces` (via traced LLM calls).

## Edge cases handled
- Stream close without `done` — `stream_closed` reducer action handles unexpected termination.
- Empty state during streaming — guard checks `mergedAccounts.length`.
- Anthropic structured-output rejection of `minItems > 1` — dropped `.min(2)` on strategy array.
- Apollo deprecated endpoint — switched `searchPeople` from `/v1/mixed_people/search` to `/v1/mixed_people/api_search`.
- Warm-paths SQL blow-up under load — replaced correlated subquery with 4 focused IN-list queries.
- Activity schema mismatch — fixed `buildKnowsFromActivities` to use polymorphic `actorId`/`entityId` instead of non-existent `userId`/`contactId`.
- TypeScript strict-mode cast — `waterfall.ts` bumped through `unknown`.
- 6-way concurrency limiter — prevents overwhelming Apollo/provider APIs.
- Per-company errors are non-fatal — emitted as `error` events, other companies continue.

## Edge cases NOT handled (known gaps)
- **No resume/retry for interrupted builds.** If the user closes the tab mid-stream, all progress is lost. Partially streamed rows that were persisted to DB survive, but the build doesn't resume.
- **No deduplication between builds.** Running "Find more accounts" twice with similar ICP filters may produce overlapping companies. The DB-level upsert handles this, but the UI shows duplicate enrichment work.
- **No cost preview before build.** A TAM build can trigger 50-500+ LLM calls (strategy + per-company enrichment + signals). No pre-build cost estimate is shown. The LLM budget enforcement catches over-cap but doesn't warn beforehand.
- **Signal source HEAD-check is fire-and-forget.** If the source URL is temporarily down (e.g., a company's status page has a blip), the signal still fires with `verified: false`, but the source is labeled as verified if the HEAD returns 2xx.
- **No pagination/windowing.** Large TAM builds (1000+ companies) stream all rows into the client-side reducer. Memory usage scales linearly with company count.

## Test coverage
- **Unit tests:** 52 tests across 3 files (shipped in PR #10, `550e342`):
  - `tam-stream-reducer.test.ts` (387 LOC, 20 cases) — reducer actions, idempotency, cancellation, `stream_closed`, score re-sort.
  - `tam-stream-signals.test.ts` (396 LOC, 23 cases) — all 4 built-in signal detectors including edge cases.
  - `tam-stream-verify-source.test.ts` (110 LOC, 9 cases) — HEAD-check timeout, status codes, abort.
- **Integration tests:** none. The streaming endpoint is not tested end-to-end.
- **What's not tested:** strategy generation, per-company pipeline, Apollo integration, warm-path resolution, custom signal integration, accounts page rendering.

## Review flags
1. **52 unit tests is solid coverage for the pure modules** (reducer, detectors, source-verify). The gap is the orchestration layer — `per-company.ts` and `tam/build/route.ts` have zero tests. These are the highest-risk files (network calls, DB writes, error propagation).
2. **No cost preview before build.** This is a product decision more than a code gap — should a "Build TAM" action that may cost $5-20 in LLM credits have a confirmation dialog? The `estimate-cost` endpoint exists but isn't wired to the TAM build trigger.
3. **Memory pressure on large TAMs.** The client-side reducer holds all streamed rows in React state. For a 5,000-company build, this is ~2-5MB of JSON in memory. Not a problem today (few tenants, small TAMs) but worth noting for scale.
