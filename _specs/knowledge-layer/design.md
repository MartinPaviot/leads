# Knowledge Layer — Design

## System Fit

Replaces the current flat `settings.knowledge` JSON array with a dedicated table. Integrates with the embedding system (`src/lib/embeddings.ts`) for semantic retrieval. The chat system prompt and skill executor both query knowledge at execution time.

## Data Model

### New table: `knowledge_entries`

```sql
CREATE TABLE knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_by UUID NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL DEFAULT 'workspace' CHECK (scope IN ('user', 'workspace')),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding vector(1536),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_tenant ON knowledge_entries(tenant_id);
CREATE INDEX idx_knowledge_scope ON knowledge_entries(tenant_id, scope);
CREATE INDEX idx_knowledge_category ON knowledge_entries(tenant_id, category);
CREATE INDEX idx_knowledge_embedding ON knowledge_entries
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### Categories enum

```typescript
type KnowledgeCategory =
  | "icp"           // Ideal Customer Profile
  | "competitors"   // Competitive intelligence
  | "objections"    // Objection handling playbooks
  | "product"       // Product messaging and positioning
  | "process"       // Sales process and discovery frameworks
  | "context"       // Company context (history, culture, values)
  | "custom";       // User-defined
```

## API Contracts

### `GET /api/settings/knowledge`
Migrated: returns from database instead of tenant settings JSON. Backward-compatible response shape.

Response:
```json
{
  "knowledge": [
    {
      "id": "uuid",
      "title": "ICP Definition",
      "category": "icp",
      "content": "Series A-B SaaS...",
      "scope": "workspace",
      "isEditable": true,
      "updatedAt": "2026-05-01T...",
      "isStale": false
    }
  ]
}
```

### `POST /api/settings/knowledge`
Create entry. Generates embedding on save.

### `PUT /api/settings/knowledge/[id]`
Update entry. Re-generates embedding if content changed (content_hash comparison).

### `DELETE /api/settings/knowledge/[id]`
Soft delete (is_active = false).

### `POST /api/knowledge/search` (internal, used by agent)
Semantic search for relevant knowledge given a query.

Body: `{ "query": "ICP criteria for qualifying leads", "category"?: "icp", "limit"?: 5 }`
Response: `{ "entries": [{ "id", "title", "content", "similarity" }] }`

## Data Flow

```
Knowledge Creation:
  User writes in Settings UI
    → POST /api/settings/knowledge
    → Insert into knowledge_entries
    → Generate embedding via OpenAI
    → Store embedding in pgvector column

Knowledge Retrieval (chat):
  User asks question in chat
    → Chat system prompt builder queries knowledge_entries
    → Semantic search: embed the user question, cosine similarity against entries
    → Top-K entries injected into system prompt as "Business Context" section
    → Agent uses knowledge to ground responses

Knowledge Retrieval (skills):
  Custom skill executor builds prompt
    → For each step, search knowledge_entries by step text + skill description
    → Relevant entries injected as context before step instructions
    → Agent follows knowledge-informed steps
```

## Integration Points

### Chat System Prompt (`chat-system-prompt.ts`)
Add a "Business Knowledge" section that includes top-5 relevant knowledge entries based on the user's message. Injected after the system prompt but before conversation history.

### Custom Skill Executor
Before executing each step, retrieve knowledge entries relevant to that step's instruction text. Inject as context.

### Migration from tenant settings
One-time migration: read existing `settings.knowledge` array entries and insert them into the new table. Remove from settings JSON after migration.

## Failure Handling

- Embedding generation failure → save entry without embedding, flag for retry, still available via keyword search
- Very long content → chunk into 8KB segments for embedding, store full content in `content` column
- OpenAI API unavailable → queue embedding generation for later, entry is immediately usable via keyword match

## Security

- Knowledge entries respect tenant isolation (tenant_id filter on every query)
- User-scoped entries visible only to creator
- Content is not included in MCP API responses (internal knowledge only)
- No PII validation enforced (user responsibility), but warn if email/phone patterns detected
