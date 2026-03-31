# F3.6: AI Semantic Search — Design

## System Fit
Semantic search is Monaco's Step 2 power feature: describe what you want in plain English, get matching accounts. Uses the pgvector embeddings created by F2.6, F3.1, and F3.2 to find relevant entities.

## Data Model
Uses existing `embeddings` table with pgvector. No schema changes.

## API Contracts

### POST /api/search (enhanced, existing)
Already returns { results: Array<{ entityType, entityId, content, similarity }> }

### POST /api/search/tam
```typescript
// Request
{ query: string, entityType?: "company" | "contact" | "deal", limit?: number }

// Response 200
{
  results: Array<{
    entityType: string;
    entityId: string;
    content: string;
    similarity: number;
    entity: { name: string; industry?: string; score?: number; ... } | null;
  }>
}
```

## Data Flow
1. User types query → POST /api/search/tam → embed query → pgvector cosine similarity → hydrate with entity data → return ranked results
2. Search bar on accounts page → client-side filter for instant results + API search for semantic results

## UI Changes

### Accounts page
- Search input above table
- Dual mode: instant text filter (name/domain) + semantic search (API-backed)
- Search results replace table rows, sorted by relevance

### Global search (future)
- Command palette (Cmd+K) — deferred to later milestone

## Failure Handling
- No OPENAI_API_KEY: fall back to text search
- Empty embeddings: return empty results with message
