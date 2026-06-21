# Retroactive spec: TAM estimate (live addressable market count)

## Status
- Shipped in: `9a1d937` (PR #5, "WS-0 PR 1"), 2026-04-21. Bug fix in `d457f0a` (double-conversion fix), 2026-04-21.
- Spec written: 2026-04-22
- Reviewed by Martin: pending

## Purpose
Provides an instant "how big is my market" count during the onboarding wizard's ICP step. When the founder toggles industry, company size, or geography filters, a debounced call returns the approximate number of matching companies from Apollo. Renders as a chip ("Addressable market: 12,400 companies" or "100,000+ companies"). First visible proof that the agent has a real database to search — the second onboarding wow effect.

## Current behavior
- **Endpoint:** `POST /api/tam/estimate` with body `{ industries?: string[], companySizes?: string[], geographies?: string[] }`.
- **Auth:** `getAuthContext()` — any authenticated user.
- **Rate limit:** `checkRateLimit("llm", authCtx.userId)` — shares the LLM bucket despite no LLM call, because the wizard debounce-fires on every toggle.
- **Apollo check:** `isApolloAvailable()` — returns 500 if Apollo is not configured.
- **Size format handling:** detects whether `companySizes` are already in Apollo format (`"1,10"`) or UI format (`"1-10"`). Apollo format passes through; UI format runs through `sizesToApolloRanges()`. Bug fixed in `d457f0a` — previously always ran the converter, mangling `"1,10"` into `"110"`.
- **Query:** calls `searchOrganizations` with `per_page: 1, page: 1` and reads `pagination.total_entries`. No actual company data is fetched — only the count.
- **Response:** `{ total: number, capped: boolean, filtersApplied: { industries, companySizes, geographies } }`. `capped: true` when Apollo returns exactly 100,000 (their ceiling).
- **Apollo plan detection:** catches "API_INACCESSIBLE" or "free plan" errors and returns 402 with a clear message.
- **Client-side:** `onboarding-wizard.tsx` calls this with 400ms debounce on filter toggles. The chip updates in-place. Renders "100,000+" when capped.

## Dependencies

### Upstream (what calls this)
- `onboarding-wizard.tsx` — debounced effect on ICP filter changes.

### Downstream (what this calls)
- `lib/apollo-client.ts:searchOrganizations()` — Apollo org-search API.
- `lib/apollo-client.ts:isApolloAvailable()` — env var check.
- `lib/icp-constants.ts:sizesToApolloRanges()` — UI-to-Apollo size conversion.
- `lib/auth-utils.ts:getAuthContext()` — session auth.
- `lib/rate-limit.ts:checkRateLimit()` — per-user rate bucket.

### Data read/written
- Reads: nothing from DB. Stateless Apollo API call.
- Writes: nothing.

## Edge cases handled
- Apollo not configured — 500 with clear error.
- Apollo free plan — 402 with actionable message.
- Apollo query failure — 500 with error message, `total: null`.
- Both Apollo and UI size formats accepted — auto-detection via regex `/^\d+,\d*$/`.
- Apollo 100k cap — `capped: true` flag so UI renders "100,000+".
- No filters provided — returns total Apollo universe count (valid but large).
- Empty arrays — treated as "no filter on this dimension" (correct Apollo behavior).

## Edge cases NOT handled (known gaps)
- **No caching.** Every filter toggle fires a fresh Apollo API call. A user toggling 10 filters rapidly sends 10 API calls (debounce mitigates to ~3-4). Apollo rate limits are lenient, but there's no client-side or server-side cache of recent results.
- **No Apollo credit tracking.** Each `searchOrganizations` call consumes an Apollo API credit. No per-tenant Apollo budget enforcement exists (the LLM budget doesn't cover Apollo).
- **Industries mapped as keywords, not IDs.** Apollo's industry filter requires industry IDs. The code passes them as `q_organization_keyword_tags` instead — a fuzzy approximation. Estimate accuracy depends on keyword-to-industry correlation. The code comments acknowledge this: "close enough for an estimate and degrades gracefully."
- **Geography is free-text.** Apollo accepts free-text location strings. User inputs like "US" vs "United States" vs "America" may produce different counts.
- **No input validation beyond Zod.** The body is cast with `as { industries?, companySizes?, geographies? }` — no Zod schema validation. Malformed inputs (e.g., `companySizes: [123]` as numbers instead of strings) will silently fail or produce unexpected Apollo queries.

## Test coverage
- **Unit tests:** none. No test file exists for this endpoint.
- **Integration tests:** none.
- **What's not tested:** format detection logic, Apollo error handling, debounce behavior, capped response.

## Review flags
1. **No input validation.** The endpoint casts the body with `as` and trusts the shape. A Zod schema would prevent malformed inputs from reaching Apollo. Low risk since the only caller is the onboarding wizard, but defense-in-depth says validate.
2. **Industry-as-keyword approximation should be documented in the UI.** If the estimate says "12,400 companies" but the TAM build (which may use different filters) finds 8,000, the founder will feel misled. Consider adding "approximate" language to the chip or documenting the estimation methodology.
3. **The rate bucket is "llm" but there's no LLM call.** This is intentional (per the code comment) but semantically confusing. A dedicated "apollo" or "estimate" bucket would be cleaner and wouldn't compete with actual LLM rate limits.
