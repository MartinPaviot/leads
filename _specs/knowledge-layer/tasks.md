# Knowledge Layer — Tasks

## Task 1: Database migration for knowledge_entries table
- Add `knowledge_entries` table to Drizzle schema
- Include pgvector embedding column (reuse existing vector setup)
- Create migration
- Write data migration script: move existing `settings.knowledge` entries to new table
- **Verify**: migration runs cleanly, old data preserved in new table
- **Test**: schema validation test

## Task 2: Knowledge CRUD API (replace existing)
- Rewrite `src/app/api/settings/knowledge/route.ts` to use new table
- Add `src/app/api/settings/knowledge/[id]/route.ts` for PUT/DELETE
- Maintain backward-compatible response shape for GET
- Generate embedding on POST/PUT (async, non-blocking)
- Content hash for change detection on updates
- **Verify**: create, read, update, delete knowledge entries
- **Test**: CRUD tests, permission tests, validation tests

## Task 3: Knowledge semantic search endpoint
- Create `src/app/api/knowledge/search/route.ts` (internal)
- Accept query string, optional category filter, limit
- Embed query → cosine similarity search against knowledge_entries
- Return ranked results with similarity scores
- Fallback to ILIKE keyword search if embeddings unavailable
- **Verify**: search for "ICP" returns ICP-related entries
- **Test**: search accuracy tests, fallback behavior tests

## Task 4: Inject knowledge into chat system prompt
- Modify `src/lib/prompts/chat-system-prompt.ts`
- Before building prompt, query top-5 relevant knowledge entries for the user's message
- Add "Business Knowledge" section to system prompt with retrieved entries
- Include knowledge source attribution in agent responses
- **Verify**: ask about ICP in chat, verify agent references knowledge entries
- **Test**: prompt construction test with/without knowledge

## Task 5: Inject knowledge into custom skill execution
- Modify custom skill executor (from skills-builder spec)
- For each skill step, retrieve relevant knowledge entries
- Inject as context before step instructions in the prompt
- **Verify**: run a skill that references "our ICP criteria" and verify it uses knowledge
- **Test**: skill execution test with knowledge injection

## Task 6: Knowledge settings page UI
- Update `src/app/(dashboard)/settings/knowledge/page.tsx`
- List entries grouped by category with scope badges
- Create/edit form with markdown editor, category selector, scope selector
- Stale indicator for entries not updated in 90+ days
- Entry count and limits display
- **Verify**: full CRUD flow through UI
- **Test**: component rendering tests

## Task 7: Freshness and limits
- Stale detection: flag entries where updatedAt < 90 days ago
- Enforce limits: 200 workspace, 50 per user
- Content size limit: 50KB per entry
- Chunked embedding for entries > 8KB
- **Verify**: create entry #201 and get rejection
- **Test**: limit enforcement tests, staleness calculation tests

## Task 8: Migration script for existing data
- One-time script to read `settings.knowledge` from all tenants
- Insert into `knowledge_entries` table with scope="workspace"
- Generate embeddings for migrated entries
- Remove `knowledge` key from tenant settings after successful migration
- **Verify**: run on test data, verify no data loss
- **Test**: migration idempotency test
