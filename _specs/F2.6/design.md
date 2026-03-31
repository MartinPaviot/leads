# F2.6: Embedding + RAG Pipeline — Design

## System Fit
The embedding pipeline converts CRM data into vectors for semantic search. This enables F2.7 (NL queries with citations) — the core "customer memory" feature that differentiates us from traditional CRMs.

## Technology
- **OpenAI text-embedding-3-small** ($0.02/1M tokens, 1536 dimensions)
- **pgvector** extension in Supabase (already available)
- **Drizzle ORM** for database operations

## Data Model
New table: `embeddings`
```sql
CREATE TABLE embeddings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'contact', 'company', 'activity', 'note'
  entity_id TEXT NOT NULL,
  content TEXT NOT NULL, -- the text that was embedded
  embedding vector(1536), -- pgvector column
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops);
```

## Data Flow
1. On contact/account creation or update → generate text representation
2. Send text to OpenAI embedding API → get 1536-dim vector
3. Store vector in embeddings table linked to entity
4. On chat query → embed the query → cosine similarity search → return top-K results
5. Include retrieved results as context for LLM

## API Contracts
- `POST /api/embed` — embed a specific entity (internal use)
- `POST /api/search` — semantic search across embeddings
- Chat route enhanced to include RAG context

## Embedding Strategy
- **Contact**: "{name}, {title} at {company}. Email: {email}. Notes: {notes}"
- **Company**: "{name}. Domain: {domain}. Industry: {industry}. Revenue: {revenue}"
- **Activity**: "{type}: {summary}. From: {from}. To: {to}. Date: {date}"
- **Note**: "{title}: {content}"
