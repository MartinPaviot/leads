# FINDING-011: Tasks

## Task 1: Implement recency-weighted chunking (~1h)
- Add `prepareForEmbedding(content: string, maxChars?: number)` to `lib/embeddings.ts`
- Strategy: preserve last 4000 chars as "recent tail", fill remaining budget from the front
- Replace `content.slice(0, 6000)` in `embedEntity()` with `prepareForEmbedding(content)`
- Increase default maxChars to 24000 (~6000 tokens)
- **Verify:** Unit test: 30K char input preserves last 4000 chars and first ~20K chars

## Task 2: Increase activityToText rawContent limit (~20min)
- In `activityToText()`, change `rawContent.slice(0, 2000)` to `rawContent.slice(0, 4000)`
- **Verify:** Unit test confirms longer content preserved

## Task 3: Write re-embedding script (~1h)
- Create `app/apps/web/scripts/re-embed-all.ts`
- Iterates all entities in batches of 50, re-calls `embedEntity()` with new logic
- Logs progress and skips entities that fail
- **Verify:** Script runs successfully on dev database; spot-check confirms new embeddings have longer content

## Task 4: Update tests and verify search quality (~1h)
- Update existing embedding tests for new truncation behavior
- Add test: entity with 30K chars embeds both header and recent tail
- Manual test: search for a term that only appears in recent activity (previously truncated)
- **Verify:** All tests pass; search returns expected results
