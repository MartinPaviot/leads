# FINDING-010: Design — Memory TTL and Conflict Resolution

## TTL Implementation

### Auto-extracted memories
In `inngest/memory-auto-extract.ts`, when inserting into `chatMemories`, set:
```typescript
expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
```

### User-provided memories
In `lib/chat/tools/memory.ts` `rememberContext`, leave `expiresAt` as null (already the default).

### Recall filtering
In `recallMemories` query, add: `or(isNull(chatMemories.expiresAt), gt(chatMemories.expiresAt, new Date()))`.

### Cleanup cron
Add an Inngest daily cron to hard-delete memories where `expiresAt < now() - 7 days` (grace period for debugging).

## Conflict Resolution

### Priority hierarchy
1. `user_preference` (explicit user instruction) — highest
2. `decision` (user-stated team decision)
3. `relationship_note` (user or auto)
4. `learned_context` (auto-extracted) — lowest

### Resolution logic
When `rememberContext` inserts a memory with a key that already exists:
- If new memory is higher priority: update the row, set old category to `superseded`
- If new memory is lower priority: skip insert, return `{ action: "skipped", reason: "higher_priority_exists" }`
- If same priority: update (most recent wins, existing behavior)

### Schema addition
Add `supersededBy` column (nullable text, FK to chatMemories.id) for audit trail.
