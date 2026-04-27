# FINDING-011: Design — Embeddings Truncation Fix

## Approach
Replace the naive `content.slice(0, 6000)` with a recency-weighted chunking strategy that preserves the tail (most recent content) when truncation is necessary.

## Chunking Strategy
```
[Entity header: name, title, company — ~200 chars]
[Middle section: truncated from the front if needed]
[Recent section: last 4000 chars preserved intact]
```

### Token budget allocation
- Total budget: ~24000 chars (~6000 tokens, safe margin under 8191)
- Header: up to 1000 chars (entity metadata)
- Recent tail: up to 4000 chars (most recent activities)
- Remaining: up to 19000 chars for older content (truncated from front)

## Implementation in `embedEntity()`
```typescript
function prepareForEmbedding(content: string, maxChars = 24000): string {
  if (content.length <= maxChars) return content;
  
  const tailSize = Math.min(4000, content.length);
  const tail = content.slice(-tailSize);
  const headBudget = maxChars - tailSize;
  const head = content.slice(0, headBudget);
  
  return head + "\n...[truncated middle]...\n" + tail;
}
```

## Changes to `activityToText()`
Increase `rawContent` slice from 2000 to 4000 chars to reduce double-truncation.

## Re-embedding Script
Create `scripts/re-embed-all.ts` that iterates all entities and re-embeds with the new logic. Run as a one-time migration.

## Risk
Low. Embedding dimensions unchanged. Search queries use the same model. Only content coverage improves.
