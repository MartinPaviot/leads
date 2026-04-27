# FINDING-010: Tasks

## Task 1: Add TTL to auto-extracted memories (~45min)
- In `inngest/memory-auto-extract.ts`, set `expiresAt` to 90 days on all inserted memories
- Add constant `MEMORY_AUTO_TTL_DAYS = 90` in a shared config
- **Verify:** Unit test confirms expiresAt is set for auto-extracted, null for user-provided

## Task 2: Filter expired memories in recall (~45min)
- In `lib/chat/tools/memory.ts` `recallMemories`, add WHERE clause: `expiresAt IS NULL OR expiresAt > now()`
- Ensure the filter applies to all scope combinations (user, workspace, all)
- **Verify:** Test with a memory that has expiresAt in the past — excluded from results

## Task 3: Implement conflict resolution in rememberContext (~1.5h)
- Define priority map: `{ user_preference: 4, decision: 3, relationship_note: 2, learned_context: 1 }`
- On key collision, compare priorities: higher wins, same-priority updates
- Add `supersededBy` column to `chatMemories` via migration
- When superseding, set old row's `supersededBy` to new row's id
- **Verify:** Test: user_preference insert supersedes existing learned_context with same key

## Task 4: Add cleanup cron (~30min)
- Create `inngest/memory-cleanup.ts` with daily cron
- Delete rows where `expiresAt < now() - 7 days`
- Register in `api/inngest/route.ts`
- **Verify:** Test confirms expired-and-past-grace rows are deleted, recent expired rows kept

## Task 5: Write integration tests (~1h)
- Test TTL lifecycle: create auto memory, fast-forward time, confirm excluded from recall
- Test conflict: auto-extract "company=consulting", user says "company=SaaS", confirm SaaS wins
- Test supersededBy audit trail populated
- **Verify:** All tests pass
