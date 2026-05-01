# Agentic Import — Tasks

## Task 1: Database migration for import_jobs table
- Add `import_jobs` table to Drizzle schema
- Create migration
- **Verify**: table exists with all columns
- **Test**: schema validation test

## Task 2: Agentic analyze endpoint
- Create `src/app/api/import/agentic/analyze/route.ts`
- Reuse existing LLM mapping logic from smart import (extract to shared module)
- Add dedup scanning: count existing records that match by email/domain
- Create import_jobs entry with status "awaiting_confirmation"
- Return mapping proposal + dedup preview
- **Verify**: upload CSV, get back mapping with dedup count
- **Test**: mapping accuracy tests, dedup scan tests

## Task 3: Agentic confirm + Inngest background executor
- Create `src/app/api/import/agentic/confirm/route.ts`
- Create `src/inngest/agentic-import-executor.ts`
- Process rows in batches of 100
- Per-row: hash → dedup check → create/merge → wire relationships → update progress
- Retry-safe: skip already-processed row hashes
- **Verify**: confirm import, watch progress increment, verify records created
- **Test**: batch processing test, dedup test, relationship wiring test, retry-safety test

## Task 4: Import progress polling
- Create `src/app/api/import/agentic/[jobId]/status/route.ts`
- Return current progress, counts, errors
- **Verify**: poll during active import, see progress
- **Test**: status endpoint test

## Task 5: Deduplication engine
- Create `src/lib/import/dedup.ts`
- Contact matching: email exact → name+domain fuzzy
- Account matching: domain exact → name normalized
- Merge logic: update nulls only, never overwrite
- Return match result with confidence score
- **Verify**: import CSV with known duplicates, verify merge behavior
- **Test**: matching accuracy tests for all strategies

## Task 6: Relationship wiring engine
- Create `src/lib/import/relationship-wirer.ts`
- Contact import: extract company → find or create → associate
- Deal import: find contact → find company → associate both
- Multi-file: detect related files, enforce dependency order
- **Verify**: import contacts CSV with company column, verify company associations
- **Test**: relationship wiring tests, multi-file ordering test

## Task 7: Chat tool integration
- Add `agenticImport` tool to chat tools registry
- Handle file attachments in chat (detect CSV uploads)
- Tool actions: analyze, confirm, status, cancel
- Stream progress updates to chat thread
- Post-import: suggest enrichment
- **Verify**: upload CSV in chat, go through full flow, see results in chat
- **Test**: chat tool integration test

## Task 8: Import history and cleanup
- Update `src/app/api/import/history/route.ts` to include agentic imports
- Add import history view to settings or data management page
- Auto-cleanup: delete import_jobs older than 90 days (Inngest cron)
- **Verify**: view import history after completing an import
- **Test**: history API test, cleanup cron test
