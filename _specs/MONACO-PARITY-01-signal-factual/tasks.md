# MONACO-PARITY-01 — Tasks

Branch: `feat/MONACO-PARITY-01-signal-factual`. Each task ends with a verify step; no task is "done" until its verify passes.

1. **Schema migration**
   - Add `signal_url_cache` table.
   - Add `sourceUrl`, `verificationStatus`, `verifiedAt`, `confidence` to `signals`.
   - Backfill existing rows: `verificationStatus = 'uncertain'`.
   - Verify: `pnpm drizzle-kit generate` produces a clean diff; `pnpm drizzle-kit migrate` applies; `select count(*) from signals where verification_status = 'uncertain'` matches pre-migration row count.
   - Test: write `__tests__/signal-schema-migration.test.ts` asserting old rows are readable and default to `uncertain`.

2. **URL verifier helper**
   - Create `lib/signals/url-verifier.ts` with `verifySignalUrl`.
   - Implement: normalization, private-IP block, HEAD with 5s timeout, cache lookup, 10 rps host limiter (in-memory).
   - Verify: unit tests for each of the 4 outcomes (verified, unverified, blocked-but-200-ish, timeout).
   - Test: `__tests__/url-verifier.test.ts` with `nock` to stub HTTP responses; one test per scenario.

3. **Signal scanner integration**
   - Update `skills/signals/signal-scanner/schema.ts`: add `sourceUrl`, `confidence`, drop `strength` (or keep alias for back-compat).
   - Update `handler.ts`: after LLM generates candidates, batch-verify URLs via `verifySignalUrl`, set `verificationStatus`.
   - Verify: e2e fixture run produces 4 signals, one of each status.
   - Test: `__tests__/signal-scanner-factual.test.ts`.

4. **Default-view filter on TAM/account APIs**
   - `app/api/companies/route.ts` (or equivalent TAM endpoint): accept `signalStatus` query param.
   - Default: `verified,likely`. Pass-through to drizzle `where` clause.
   - Verify: hit endpoint with default → unverified signals absent. With `?signalStatus=all` → all present.
   - Test: API integration test.

5. **UI badges**
   - Update components rendering signals (account detail, contact detail) to show 4-state badge: green check / amber dot / grey dot / red warning.
   - Add tooltip with HEAD status + checkedAt.
   - "Show all signals" toggle wired to query param.
   - Verify: visual on dev server with seeded fixture.

6. **Cache eviction cron**
   - Inngest cron `signal-url-cache-evict` runs daily at 03:00 UTC.
   - `delete from signal_url_cache where expires_at < now()`.
   - Verify: run manually, assert row count drops.

7. **Doc update**
   - Update `_research/elevay-feature-inventory-2026-05-04.md` with new signal verification capability.
   - Update master `MONACO-PARITY-PLAN.md`: mark spec status as ✅.
