# Data Architecture for Autonomous GTM Sales Engine

**Last updated:** 2026-03-30
**Status:** Complete
**Scope:** Entity modeling, multi-tenancy, embeddings/RAG, vector storage, natural language queries with citations, activity event sourcing, signal time-series, full-text search

---

## Table of Contents

1. [Entity-Relationship Model](#1-entity-relationship-model)
2. [Multi-Tenancy Approach](#2-multi-tenancy-approach)
3. [Embedding Strategy](#3-embedding-strategy)
4. [Vector Database Choice](#4-vector-database-choice)
5. [Natural Language Queries with Citations](#5-natural-language-queries-with-citations)
6. [Activity Stream / Event Sourcing](#6-activity-stream--event-sourcing)
7. [Time-Series Data for Signals](#7-time-series-data-for-signals)
8. [Full-Text Search Integration](#8-full-text-search-integration)
9. [Schema-less Customer Data](#9-schema-less-customer-data)
10. [Recommended Stack Summary](#10-recommended-stack-summary)

---

## 1. Entity-Relationship Model

### Core Entities

The data model must support every concept from both Monaco (TAM building, signal-based scoring, sequences, deal coaching) and Lightfield (zero-entry CRM, schema-less memory, NL queries, auto-capture of all interactions).

```
┌─────────────────────────────────────────────────────────────┐
│                       TENANT (workspace)                     │
│  id, name, plan, settings_jsonb, created_at                  │
└─────────────┬───────────────────────────────────────────────┘
              │ 1:N
              ▼
┌──────────────────────┐       ┌──────────────────────┐
│       COMPANY        │       │        USER          │
│  id, tenant_id       │       │  id, tenant_id       │
│  name, domain        │       │  email, role         │
│  industry, size      │       │  settings_jsonb      │
│  properties (JSONB)  │       └──────────┬───────────┘
│  enrichment_data     │                  │
│  score, score_reasons│                  │ (owner_id FK)
│  tam_segment         │                  │
│  created_at          │                  ▼
└──────────┬───────────┘    ┌──────────────────────────┐
           │ 1:N            │          DEAL            │
           ▼                │  id, tenant_id           │
┌──────────────────────┐    │  company_id, contact_id  │
│      CONTACT         │    │  owner_id (user)         │
│  id, tenant_id       │    │  stage, value, currency  │
│  company_id (FK)     │    │  expected_close_date     │
│  email, phone        │    │  properties (JSONB)      │
│  name, title, role   │    │  score, score_reasons    │
│  linkedin_url        │    │  created_at, updated_at  │
│  properties (JSONB)  │    └──────────┬───────────────┘
│  score, score_reasons│               │
│  lifecycle_stage     │               │
│  created_at          │               │
└──────────┬───────────┘               │
           │                           │
           │ 1:N                       │ 1:N
           ▼                           ▼
┌──────────────────────────────────────────────────────┐
│                    ACTIVITY                           │
│  id, tenant_id                                       │
│  actor_type (contact | user | system)                │
│  actor_id                                            │
│  entity_type (contact | company | deal)              │
│  entity_id                                           │
│  activity_type (enum — see below)                    │
│  channel (email | meeting | call | web | system)     │
│  direction (inbound | outbound | internal)           │
│  occurred_at (timestamptz)                           │
│  metadata (JSONB)                                    │
│  raw_content_id (FK → interaction_content)           │
│  summary                                             │
│  sentiment (positive | neutral | negative)           │
│  created_at                                          │
└──────────────────────────────────────────────────────┘
           │ 1:1
           ▼
┌──────────────────────────────────────────────────────┐
│              INTERACTION_CONTENT                      │
│  id, tenant_id                                       │
│  content_type (email_body | transcript | notes)      │
│  raw_text (TEXT — full original content)              │
│  html_content (TEXT — for emails)                     │
│  structured_data (JSONB — parsed fields)             │
│  embedding_id (FK → embedding store)                 │
│  token_count (integer)                               │
│  created_at                                          │
└──────────────────────────────────────────────────────┘
```

### Activity Types (enum)

```
email_sent, email_received, email_opened, email_clicked, email_replied, email_bounced,
meeting_scheduled, meeting_completed, meeting_cancelled, meeting_no_show,
call_completed, call_missed, call_voicemail,
note_added, task_created, task_completed,
deal_stage_changed, deal_created, deal_won, deal_lost,
sequence_enrolled, sequence_step_executed, sequence_completed, sequence_replied, sequence_opted_out,
website_visit, page_view, form_submitted,
signal_detected, score_changed, enrichment_updated,
contact_created, contact_merged, company_created
```

### Signal Storage

```
┌──────────────────────────────────────────────────────┐
│                     SIGNAL                            │
│  id, tenant_id                                       │
│  entity_type (contact | company)                     │
│  entity_id                                           │
│  signal_type (enum — see below)                      │
│  source (provider name: builtwith, crunchbase, etc.) │
│  strength (0.0 - 1.0)                                │
│  payload (JSONB — raw signal data)                   │
│  detected_at (timestamptz)                           │
│  expires_at (timestamptz — signal decay)             │
│  processed (boolean)                                 │
│  created_at                                          │
└──────────────────────────────────────────────────────┘
```

**Signal types:**
```
funding_round, new_hire, leadership_change, job_posting, technology_adoption,
technology_removal, website_traffic_surge, content_published, social_engagement,
company_news, acquisition, ipo_filing, expansion, layoff, product_launch,
competitor_mention, intent_keyword, g2_review, email_engagement, web_visit
```

### Sequence Execution

```
┌──────────────────────────────────────────────────────┐
│               SEQUENCE                                │
│  id, tenant_id, owner_id (user)                      │
│  name, description                                   │
│  status (draft | active | paused | archived)         │
│  trigger_criteria (JSONB)                            │
│  settings (JSONB — send windows, timezone, etc.)     │
│  created_at, updated_at                              │
└──────────────┬───────────────────────────────────────┘
               │ 1:N
               ▼
┌──────────────────────────────────────────────────────┐
│            SEQUENCE_STEP                              │
│  id, sequence_id                                     │
│  step_order (integer)                                │
│  step_type (email | wait | condition | task)         │
│  template_subject, template_body                     │
│  wait_duration_hours (for wait steps)                │
│  condition (JSONB — for branching)                   │
│  settings (JSONB)                                    │
│  created_at                                          │
└──────────────┬───────────────────────────────────────┘
               │ 1:N
               ▼
┌──────────────────────────────────────────────────────┐
│          SEQUENCE_ENROLLMENT                          │
│  id, tenant_id                                       │
│  sequence_id, contact_id                             │
│  status (active | completed | replied | paused |     │
│          opted_out | bounced | errored)              │
│  current_step_order (integer)                        │
│  enrolled_at, completed_at                           │
│  enrolled_by (user_id | system)                      │
│  metadata (JSONB)                                    │
│  created_at, updated_at                              │
└──────────────┬───────────────────────────────────────┘
               │ 1:N
               ▼
┌──────────────────────────────────────────────────────┐
│        SEQUENCE_STEP_EXECUTION                        │
│  id, enrollment_id, step_id                          │
│  status (pending | scheduled | sent | delivered |    │
│          opened | clicked | replied | bounced |      │
│          skipped | failed)                           │
│  scheduled_at, executed_at                           │
│  activity_id (FK → activity, for the email sent)     │
│  error_message                                       │
│  metadata (JSONB — personalization vars used, etc.)  │
│  created_at                                          │
└──────────────────────────────────────────────────────┘
```

### Key Relationships Summary

| Relationship | Type | Notes |
|---|---|---|
| Tenant → Company | 1:N | All data scoped to tenant |
| Tenant → User | 1:N | Multiple users per workspace |
| Company → Contact | 1:N | Contacts belong to one company |
| Contact → Deal | 1:N | A contact can have multiple deals |
| Company → Deal | 1:N | Deals tied to companies |
| Contact → Activity | 1:N | Every interaction logged |
| Deal → Activity | 1:N | Deal-specific activities |
| Company → Signal | 1:N | Signals detected on companies |
| Contact → Signal | 1:N | Contact-level signals |
| Activity → Interaction_Content | 1:1 | Raw content stored separately for performance |
| Sequence → Sequence_Step | 1:N | Ordered steps in a sequence |
| Sequence → Sequence_Enrollment | 1:N | Contacts enrolled in sequences |
| Enrollment → Step_Execution | 1:N | Each step's execution status |

### Indexes (Critical for Performance)

```sql
-- Composite indexes for tenant-scoped queries (every query must be tenant-scoped)
CREATE INDEX idx_company_tenant ON company(tenant_id, id);
CREATE INDEX idx_contact_tenant_company ON contact(tenant_id, company_id);
CREATE INDEX idx_contact_tenant_email ON contact(tenant_id, email);
CREATE INDEX idx_deal_tenant_stage ON deal(tenant_id, stage);
CREATE INDEX idx_activity_tenant_entity ON activity(tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_activity_tenant_contact ON activity(tenant_id, actor_id) WHERE actor_type = 'contact';
CREATE INDEX idx_activity_tenant_type ON activity(tenant_id, activity_type, occurred_at DESC);
CREATE INDEX idx_signal_tenant_entity ON signal(tenant_id, entity_type, entity_id, detected_at DESC);
CREATE INDEX idx_signal_tenant_type ON signal(tenant_id, signal_type, detected_at DESC);
CREATE INDEX idx_enrollment_tenant_contact ON sequence_enrollment(tenant_id, contact_id);
CREATE INDEX idx_enrollment_sequence_status ON sequence_enrollment(sequence_id, status);
CREATE INDEX idx_step_execution_enrollment ON sequence_step_execution(enrollment_id, status);

-- GIN indexes for JSONB properties (schema-less fields)
CREATE INDEX idx_contact_properties ON contact USING GIN(properties);
CREATE INDEX idx_company_properties ON company USING GIN(properties);
CREATE INDEX idx_deal_properties ON deal USING GIN(properties);
CREATE INDEX idx_signal_payload ON signal USING GIN(payload);

-- Full-text search indexes
CREATE INDEX idx_interaction_content_fts ON interaction_content USING GIN(to_tsvector('english', raw_text));
CREATE INDEX idx_contact_name_fts ON contact USING GIN(to_tsvector('english', name));
CREATE INDEX idx_company_name_fts ON company USING GIN(to_tsvector('english', name));

-- Partial indexes for hot queries
CREATE INDEX idx_active_enrollments ON sequence_enrollment(sequence_id, current_step_order)
  WHERE status = 'active';
CREATE INDEX idx_pending_executions ON sequence_step_execution(scheduled_at)
  WHERE status = 'pending' OR status = 'scheduled';
CREATE INDEX idx_unexpired_signals ON signal(tenant_id, entity_type, entity_id)
  WHERE expires_at > NOW() OR expires_at IS NULL;
```

---

## 2. Multi-Tenancy Approach

### Options Evaluated

| Approach | Isolation | Complexity | Cost | Performance | Compliance |
|---|---|---|---|---|---|
| **Separate databases per tenant** | Strongest | High (migration hell) | Highest | Best (no contention) | Best |
| **Separate schemas per tenant** | Strong | Medium-High | Medium | Good | Good |
| **Shared tables with tenant_id** | Adequate | Lowest | Lowest | Good with RLS | Adequate |
| **Shared tables + RLS** | Strong | Low-Medium | Lowest | Good | Good |

### Recommendation: Shared Tables with Row-Level Security (RLS)

**Completeness: 9/10.** This is the right choice for an early-stage product targeting founder-led sales teams. The reasoning:

1. **Operational simplicity.** One database, one set of migrations, one connection pool. Adding a tenant is an INSERT, not a DDL operation. This matters enormously when you are a small team iterating fast.

2. **Cost efficiency.** A single Postgres instance (or Supabase/Neon) serves all tenants. No per-tenant infrastructure overhead.

3. **RLS provides genuine isolation.** PostgreSQL Row-Level Security is not a toy feature — it is enforced at the query planner level, below the application layer. Even a SQL injection cannot read another tenant's data if RLS is configured correctly.

4. **Scaling path.** When (if) a tenant becomes large enough to need isolation, you can shard that tenant to its own database at that point. Premature separation is waste.

5. **Supabase alignment.** Supabase (likely our hosting layer given Next.js + Postgres alignment) has first-class RLS support baked into its auth system.

### RLS Implementation

```sql
-- Enable RLS on every table
ALTER TABLE company ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_step_execution ENABLE ROW LEVEL SECURITY;

-- Policy pattern: tenant_id must match the authenticated user's tenant
-- Using Supabase's auth.jwt() -> 'tenant_id' claim
CREATE POLICY tenant_isolation ON company
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY tenant_isolation ON contact
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Repeat for every table...

-- For service-role operations (background jobs, embeddings pipeline):
-- Use a service role that bypasses RLS but ALWAYS includes tenant_id in WHERE clauses
-- Never use the service role from client-facing code
```

### Critical RLS Rules

1. **Every table must have `tenant_id` as the first column after `id`.** No exceptions.
2. **Every query must be tenant-scoped.** Even with RLS, application code should include `WHERE tenant_id = $1` as defense-in-depth.
3. **Background workers must set session variables.** Before any DB operation in a background job: `SET app.current_tenant_id = 'uuid'`. Create RLS policies that check `current_setting('app.current_tenant_id')` for service-role connections.
4. **Never use `SECURITY DEFINER` functions without explicit tenant_id parameters.** They bypass RLS.
5. **Test RLS with automated tests.** Every migration must include a test that attempts cross-tenant access and verifies it fails.

### Data Residency Extension (Future)

For GDPR compliance with EU customers who require data residency, the shared-table model can be extended with a region-aware routing layer:

- Add a `region` column to the `tenant` table (`us-east-1`, `eu-west-1`, etc.)
- Deploy separate Postgres instances per region
- Route connections at the application layer based on `tenant.region`
- This is a "flag the ocean" item — not needed at launch but the schema supports it

---

## 3. Embedding Strategy

### What to Embed

Not everything should be embedded. Embeddings are expensive to generate, store, and query. The strategy is: **embed content that users will ask natural language questions about.**

| Content Type | Embed? | Rationale |
|---|---|---|
| Email bodies (sent and received) | **Yes** | Core of "customer memory" — users will ask "what did we discuss with Acme about pricing?" |
| Meeting transcripts | **Yes** | Rich context for deal coaching and pipeline queries |
| Call transcripts | **Yes** | Same as meetings |
| Notes (manual and auto-generated) | **Yes** | Lightweight but often contain key decisions |
| Activity summaries (AI-generated) | **Yes** | Pre-summarized content is more useful for retrieval than raw transcripts in many cases |
| Contact/company profile fields | **No** | Use structured queries (SQL) for field-based lookups. Embedding "John Smith, VP Sales at Acme" adds noise. |
| Deal metadata (stage, value) | **No** | Structured data — query directly |
| Signal payloads | **Selective** | Embed the description/summary of signals (e.g., "Acme raised $20M Series B"), not the raw JSON payload |
| Sequence templates | **No** | Static content, not queried conversationally |
| Sequence execution events | **No** | Structured time-series — query directly |

### Embedding Model Choice

| Model | Dimensions | Cost (per 1M tokens) | Max Tokens | Quality | Notes |
|---|---|---|---|---|---|
| **OpenAI text-embedding-3-small** | 1536 | $0.02 | 8191 | Good | Best cost/quality ratio. Industry standard. |
| **OpenAI text-embedding-3-large** | 3072 | $0.13 | 8191 | Best | Overkill for most retrieval tasks |
| **Cohere embed-v4.0** | 1024 | $0.10 | 512 | Very Good | Strong multilingual. Short context is a limitation. |
| **Voyage AI voyage-3** | 1024 | $0.06 | 16000 | Very Good | Longer context, good for full emails |
| **Google text-embedding-005** | 768 | $0.00625 | 2048 | Good | Cheapest option with acceptable quality |
| **Local: nomic-embed-text** | 768 | Free (compute) | 8192 | Adequate | Open source, self-hostable |
| **Local: BGE-M3** | 1024 | Free (compute) | 8192 | Good | Multi-lingual, open source |

### Recommendation: OpenAI `text-embedding-3-small`

**Completeness: 8/10.**

- **$0.02 per 1M tokens** is cheap enough to embed everything liberally. At 1,000 active leads with ~500 tokens average per interaction and ~50 interactions/day, that is 25K tokens/day = $0.0005/day = $0.015/month. Effectively free.
- **1536 dimensions** is the sweet spot — enough for good retrieval quality, small enough for efficient storage and search.
- **8191 max tokens** handles virtually any single email or note. For long meeting transcripts, chunk at ~1500 tokens with overlap.
- **Maturity** — widest adoption, best documented failure modes, most tested in production RAG systems.
- **Fallback:** Google `text-embedding-005` at $0.00625/M if we need to cut costs. Quality is ~5% worse but acceptable for signal summaries and notes.

### Chunking Strategy

Different content types need different chunking approaches:

| Content Type | Chunk Strategy | Target Size | Overlap |
|---|---|---|---|
| **Short emails** (< 1500 tokens) | Whole document, no chunking | As-is | N/A |
| **Long emails / threads** | Split by message in thread, each message is one chunk | ~500-1500 tokens | Include subject + participants as prefix in each chunk |
| **Meeting transcripts** | Sliding window with topic detection | ~800-1200 tokens | 200 tokens (25%) |
| **Call transcripts** | Same as meetings | ~800-1200 tokens | 200 tokens (25%) |
| **Notes** | Whole document (notes are short) | As-is | N/A |
| **AI-generated summaries** | Whole document | As-is | N/A |
| **Signal descriptions** | Whole document | As-is | N/A |

### Metadata to Store Alongside Each Embedding

Every embedding vector must be stored with rich metadata for filtering and citation:

```json
{
  "tenant_id": "uuid",
  "source_type": "email | transcript | note | summary | signal",
  "source_id": "uuid (interaction_content.id or signal.id)",
  "entity_type": "contact | company | deal",
  "entity_id": "uuid",
  "entity_name": "John Smith at Acme Corp",
  "contact_id": "uuid (if applicable)",
  "company_id": "uuid (if applicable)",
  "deal_id": "uuid (if applicable)",
  "occurred_at": "2026-03-15T14:30:00Z",
  "direction": "inbound | outbound | internal",
  "channel": "email | meeting | call | note",
  "chunk_index": 0,
  "total_chunks": 1,
  "participants": ["john@acme.com", "martin@company.com"],
  "subject": "Re: Pricing discussion"
}
```

This metadata enables:
- Tenant isolation at the vector DB level (filter by tenant_id)
- Scoped search ("only search emails with Acme" → filter by company_id)
- Time-bounded search ("what did we discuss last month?" → filter by occurred_at)
- Citation generation (source_type + source_id + occurred_at → "From email on March 15")

### Embedding Pipeline Architecture

```
New interaction arrives (email, meeting transcript, etc.)
    │
    ▼
1. Store raw content in interaction_content table
    │
    ▼
2. Generate AI summary (Claude Haiku 4.5 or GPT-4.1 Mini)
   Store summary in activity.summary
    │
    ▼
3. Chunk content based on type-specific strategy
    │
    ▼
4. Generate embeddings (OpenAI text-embedding-3-small)
   Batch API for non-urgent (meetings processed after the fact)
   Sync API for urgent (email just received, user might query immediately)
    │
    ▼
5. Upsert embedding vectors + metadata into vector store
    │
    ▼
6. Update interaction_content.embedding_id with reference
```

**Latency consideration:** For emails arriving via IMAP/webhook, steps 2-6 should complete within 5-10 seconds to ensure the data is queryable almost immediately. Use a job queue (BullMQ or similar) with priority levels: emails and calls are high priority (user might ask about them right away), meeting transcripts are normal priority.

---

## 4. Vector Database Choice

### Options Evaluated

| Feature | **pgvector** | **Pinecone** | **Qdrant** | **Weaviate** |
|---|---|---|---|---|
| **Deployment** | Extension in Postgres | Fully managed SaaS | Self-hosted or cloud | Self-hosted or cloud |
| **Max dimensions** | Unlimited | 20,000 | Unlimited | Unlimited |
| **Index types** | IVFFlat, HNSW | Proprietary (PineconeDB) | HNSW | HNSW + flat |
| **Filtering** | SQL WHERE clauses | Metadata filters | Payload filters | GraphQL-like filters |
| **Multi-tenancy** | Native (tenant_id in WHERE + RLS) | Namespaces (up to 10K) | Collection or payload filter | Tenant classes or filters |
| **Hybrid search** | pgvector + tsvector in same query | Sparse-dense vectors | Sparse vectors + payload | BM25 + vector native |
| **Consistency** | ACID (same transaction as data) | Eventually consistent | Strongly consistent | Eventually consistent |
| **Cost (1M vectors, 1536d)** | ~$0/mo (included in Postgres) | ~$70/mo (s1 pod) | ~$25/mo (1GB cloud) | ~$25/mo (sandbox) |
| **Operational burden** | Zero (it's your existing DB) | Zero (managed) | Low-Medium | Low-Medium |
| **Latency (1M vectors, top-10)** | 5-20ms (HNSW) | 10-50ms | 5-15ms | 10-30ms |
| **Scale ceiling** | ~10M vectors per index before degradation | 1B+ vectors | 100M+ vectors | 100M+ vectors |

### Recommendation: pgvector (primary) with Qdrant as future scale-out

**Completeness: 9/10.**

The case for pgvector is overwhelming for our use case:

**1. Transactional consistency with core data.** This is the killer advantage. When a new email arrives, we can insert the `activity`, `interaction_content`, and embedding vector in a single Postgres transaction. There is zero risk of the embedding existing without its source data, or vice versa. With an external vector DB, you must handle distributed consistency yourself (and you will get it wrong at 3 AM).

**2. Tenant isolation via RLS applies to vectors too.** The exact same RLS policies that protect `contact` and `deal` tables protect embedding vectors. No separate ACL system to build and maintain.

**3. Hybrid search in a single query.** Combine vector similarity with full-text search and structured filters in one SQL statement:

```sql
-- "What did Acme say about pricing last quarter?"
-- Combines: vector similarity + company filter + date range + full-text boost
SELECT
  ic.raw_text,
  a.occurred_at,
  a.activity_type,
  1 - (e.embedding <=> $query_vector) AS vector_score,
  ts_rank(to_tsvector('english', ic.raw_text), plainto_tsquery('english', 'pricing')) AS text_score
FROM embedding e
JOIN interaction_content ic ON ic.id = e.source_id
JOIN activity a ON a.raw_content_id = ic.id
WHERE e.tenant_id = $tenant_id
  AND e.company_id = $acme_id
  AND a.occurred_at >= NOW() - INTERVAL '3 months'
ORDER BY (0.7 * (1 - (e.embedding <=> $query_vector)) + 0.3 * ts_rank(...)) DESC
LIMIT 10;
```

This query is impossible to express across two separate systems without application-level joins and result merging.

**4. Zero additional infrastructure.** No new service to deploy, monitor, backup, or pay for. The vectors live alongside the data they reference.

**5. Scale is sufficient.** For our target market (founder-led sales teams, typically 100-10,000 contacts), even aggressive embedding (every email, meeting, call) produces maybe 50K-500K vectors per tenant. At 100 tenants, that is 5M-50M vectors. pgvector with HNSW handles 10M vectors with sub-20ms latency. We will not hit this ceiling for years.

**When to add Qdrant:** If a single Postgres instance reaches 50M+ vectors and query latency degrades past 50ms, introduce Qdrant as a read replica for vector search only. Keep pgvector as the write-path and source of truth, replicate to Qdrant asynchronously. This is a "flag the ocean" item — likely 2+ years out.

### pgvector Schema

```sql
-- Enable the extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embedding storage table
CREATE TABLE embedding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id),

  -- Vector
  embedding vector(1536) NOT NULL,

  -- Source reference
  source_type TEXT NOT NULL, -- 'email', 'transcript', 'note', 'summary', 'signal'
  source_id UUID NOT NULL,  -- FK to interaction_content.id or signal.id

  -- Entity associations (denormalized for filter performance)
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  contact_id UUID,
  company_id UUID,
  deal_id UUID,

  -- Chunk info
  chunk_index INTEGER NOT NULL DEFAULT 0,
  total_chunks INTEGER NOT NULL DEFAULT 1,
  chunk_text TEXT NOT NULL, -- The actual text that was embedded (for citation display)

  -- Temporal
  occurred_at TIMESTAMPTZ NOT NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for fast approximate nearest neighbor search
-- m=16, ef_construction=64 are good defaults for our scale
CREATE INDEX idx_embedding_vector ON embedding
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Composite indexes for filtered vector search
CREATE INDEX idx_embedding_tenant ON embedding(tenant_id);
CREATE INDEX idx_embedding_tenant_company ON embedding(tenant_id, company_id);
CREATE INDEX idx_embedding_tenant_contact ON embedding(tenant_id, contact_id);
CREATE INDEX idx_embedding_tenant_deal ON embedding(tenant_id, deal_id);
CREATE INDEX idx_embedding_tenant_occurred ON embedding(tenant_id, occurred_at DESC);
CREATE INDEX idx_embedding_source ON embedding(source_type, source_id);

-- RLS
ALTER TABLE embedding ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON embedding
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### Tuning Notes

- **`ef_search` parameter:** Set to 100 for queries (default is 40). Higher values = better recall at slightly higher latency. `SET hnsw.ef_search = 100;`
- **Probes for IVFFlat:** If using IVFFlat instead of HNSW (for bulk loading), set `probes = sqrt(lists)`.
- **Vacuuming:** Schedule regular `VACUUM` on the embedding table. HNSW indexes can degrade with many deletes without vacuuming.
- **Dimensionality reduction:** If storage becomes a concern, OpenAI's `text-embedding-3-small` supports Matryoshka representation learning — you can truncate from 1536 to 512 dimensions with only ~5% recall loss, cutting storage by 67%.

---

## 5. Natural Language Queries with Citations

This is the core Lightfield-like capability: users ask "What's the status of the Acme deal?" or "When did Sarah mention she's going on vacation?" and get an answer with citations pointing to specific emails, meetings, or notes.

### Query Pipeline Architecture

```
User types natural language query
    │
    ▼
Step 1: QUERY UNDERSTANDING (Claude Haiku 4.5 — fast, cheap)
    │  Parse the query into:
    │  - intent: factual_lookup | summarize | timeline | comparison | aggregation
    │  - entities: company names, contact names, deal references
    │  - time_range: explicit or inferred
    │  - filters: channel, direction, activity type
    │
    ▼
Step 2: ENTITY RESOLUTION (SQL lookup)
    │  Resolve named entities to database IDs:
    │  - "Acme" → company_id = abc-123
    │  - "Sarah" → contact_id = def-456
    │  - Uses fuzzy matching (trigram similarity) for typos
    │
    ▼
Step 3: MULTI-PATH RETRIEVAL (parallel)
    │
    ├── Path A: VECTOR SEARCH (pgvector)
    │   Embed the query, search with filters from Step 1
    │   Return top 20 chunks with scores
    │
    ├── Path B: FULL-TEXT SEARCH (tsvector)
    │   Keyword search for specific terms, names, numbers
    │   Return top 20 matches with scores
    │
    ├── Path C: STRUCTURED QUERY (SQL)
    │   For aggregation/timeline queries, query activity table directly
    │   "How many emails did we send to Acme?" → COUNT query
    │   "Timeline of the Acme deal" → ordered activity query
    │
    ▼
Step 4: RESULT FUSION & RERANKING
    │  Combine results from all paths
    │  Reciprocal Rank Fusion (RRF) to merge ranked lists:
    │    score = Σ(1 / (k + rank_i)) for each result across paths
    │    where k = 60 (standard RRF constant)
    │  Deduplicate (same source appearing in vector + FTS results)
    │  Take top 10 results
    │
    ▼
Step 5: ANSWER GENERATION (Claude Haiku 4.5 or Sonnet 4.6)
    │  Construct prompt with:
    │  - User's original question
    │  - Top 10 retrieved chunks with metadata
    │  - Instruction to cite sources using [1], [2], etc.
    │  - Instruction to say "I don't have enough information" if results are insufficient
    │
    ▼
Step 6: CITATION FORMATTING
    │  Parse citation markers from the LLM response
    │  Map [1], [2] etc. to source records
    │  Format citations with:
    │  - Source type icon (email, meeting, call, note)
    │  - Date
    │  - Participants
    │  - Clickable link to original content
    │
    ▼
Return answer + structured citations to UI
```

### The Answer Generation Prompt

```
You are a sales intelligence assistant. Answer the user's question based ONLY
on the provided context. If the context does not contain enough information to
answer confidently, say so.

RULES:
1. Cite every factual claim using [N] notation where N is the source number.
2. Use multiple citations when a claim is supported by multiple sources.
3. If information conflicts between sources, note the conflict and cite both.
4. Never fabricate information not present in the sources.
5. For time-related questions, prefer the most recent information.
6. Include specific dates, numbers, and names from the sources.

USER QUESTION: {{question}}

CONTEXT SOURCES:
{{#each sources}}
[{{index}}] {{source_type}} — {{date}} — Participants: {{participants}}
{{chunk_text}}
---
{{/each}}

Provide your answer below, citing sources with [N] notation:
```

### Citation Data Structure

```typescript
interface QueryResult {
  answer: string;           // The LLM-generated answer with [N] markers
  citations: Citation[];    // Ordered list matching [1], [2], etc.
  confidence: number;       // 0.0-1.0, based on retrieval scores and source coverage
  query_metadata: {
    intent: string;
    entities_resolved: { name: string; type: string; id: string }[];
    retrieval_paths_used: string[];
    total_sources_found: number;
    latency_ms: number;
  };
}

interface Citation {
  index: number;              // [1], [2], etc.
  source_type: 'email' | 'transcript' | 'note' | 'summary' | 'signal';
  source_id: string;          // UUID for deep-linking
  activity_id: string;        // FK to activity table
  occurred_at: string;        // ISO timestamp
  participants: string[];     // Email addresses or names
  subject?: string;           // Email subject or meeting title
  excerpt: string;            // The relevant chunk text (for hover preview)
  relevance_score: number;    // Combined retrieval score
}
```

### Confidence Scoring

The system should indicate confidence to avoid misleading users:

| Condition | Confidence | UI Treatment |
|---|---|---|
| Top result vector score > 0.85 AND FTS match | 0.9+ | Show answer normally |
| Top result vector score > 0.75 OR FTS match | 0.7-0.9 | Show answer with "Based on available records..." |
| Top result vector score 0.6-0.75, no FTS match | 0.4-0.7 | Show answer with "I found some possibly relevant context..." |
| No results above 0.6 | 0.0-0.4 | "I don't have enough information to answer this confidently." |

### Query Examples and Expected Behavior

| User Query | Intent | Retrieval Strategy | Expected Result |
|---|---|---|---|
| "What's happening with the Acme deal?" | summarize | Vector search on Acme deal activities + structured query for deal stage/value | Deal summary with recent activity citations |
| "When did Sarah mention Q3 budget?" | factual_lookup | Vector search: "Q3 budget" filtered to Sarah's contact_id | Specific date + email/meeting citation |
| "How many emails have we sent to leads this week?" | aggregation | SQL COUNT on activity table, type=email_sent, this week | Number with breakdown, no vector search needed |
| "Show me everything about the pricing discussion with DataCorp" | timeline | Vector search: "pricing" + company filter + time-ordered activities | Chronological list of relevant interactions |
| "Who hasn't responded to our outreach in 2 weeks?" | aggregation | SQL query on sequence_enrollment + last activity date | List of contacts with stale outreach |
| "What did John say about their migration timeline?" | factual_lookup | Vector search: "migration timeline" filtered to John's contact_id | Specific quote with email/meeting citation |

### Latency Targets

| Step | Target | Notes |
|---|---|---|
| Query understanding | < 500ms | Haiku 4.5 or GPT-4.1 Nano |
| Entity resolution | < 50ms | Cached + indexed SQL |
| Vector search | < 100ms | pgvector HNSW |
| Full-text search | < 100ms | tsvector |
| Structured query | < 100ms | Indexed SQL |
| Result fusion | < 20ms | In-memory |
| Answer generation | < 2000ms | Haiku 4.5, streaming |
| **Total (non-streaming)** | **< 3000ms** | |
| **Time to first token (streaming)** | **< 1500ms** | Steps 1-4 complete, stream Step 5 |

### Handling "I Don't Know" Correctly

Lightfield claims 95%+ recall accuracy. This requires both finding the right information AND knowing when to say "I don't know." The system must:

1. **Never hallucinate.** The prompt strictly limits answers to provided context. This is enforced by the citation requirement — every claim needs a [N] marker.
2. **Distinguish "no data" from "data exists but not retrieved."** If entity resolution finds the company/contact but vector search returns no relevant results, say "I found records for Acme but nothing about pricing discussions." If entity resolution finds nothing, say "I don't have any records for a company called Acme."
3. **Track query failures.** Log queries where confidence < 0.4 to identify gaps in the embedding pipeline (content that should be embedded but isn't).

---

## 6. Activity Stream / Event Sourcing

### Pattern: Append-Only Activity Log with Materialized Views

The activity table is the heart of the system. Every interaction, every state change, every signal is recorded as an immutable event. Current state (deal stage, contact score, etc.) is derived from the event stream.

### Why Event Sourcing (Partial)

Full event sourcing (rebuilding all state from events) is overkill. But an append-only activity log with derived current state gives us:

1. **Complete audit trail.** Every change is recorded with who/when/why.
2. **Timeline reconstruction.** Show any entity's full history.
3. **Undo capability.** Can reconstruct prior state from events.
4. **Analytics without ETL.** The activity table is already in query-friendly form.
5. **Customer memory.** This IS the customer memory — Lightfield's core feature.

### Activity Table Design (Expanded)

```sql
CREATE TABLE activity (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id),

  -- What happened
  activity_type TEXT NOT NULL,  -- enum from the list above
  channel TEXT,                 -- email, meeting, call, web, system
  direction TEXT,               -- inbound, outbound, internal

  -- Who did it
  actor_type TEXT NOT NULL,     -- contact, user, system
  actor_id UUID NOT NULL,

  -- What it relates to (polymorphic — an activity can relate to multiple entities)
  -- Primary entity (required)
  entity_type TEXT NOT NULL,    -- contact, company, deal
  entity_id UUID NOT NULL,

  -- Secondary associations (optional, for cross-referencing)
  contact_id UUID REFERENCES contact(id),
  company_id UUID REFERENCES company(id),
  deal_id UUID REFERENCES deal(id),

  -- When
  occurred_at TIMESTAMPTZ NOT NULL,

  -- Content
  summary TEXT,                 -- AI-generated one-line summary
  sentiment TEXT,               -- positive, neutral, negative, mixed
  raw_content_id UUID REFERENCES interaction_content(id),

  -- State change tracking (for deal/contact state changes)
  previous_value JSONB,         -- e.g., {"stage": "discovery"}
  new_value JSONB,              -- e.g., {"stage": "proposal"}

  -- Metadata
  metadata JSONB DEFAULT '{}', -- Flexible additional data
  source TEXT,                  -- 'gmail', 'calendar', 'manual', 'sequence', 'webhook'
  idempotency_key TEXT UNIQUE, -- Prevent duplicate event insertion

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- This table is append-only. No UPDATE or DELETE in application code.
-- Corrections are modeled as new events (e.g., activity_type = 'correction').
```

### Materialized Current State

The `contact`, `company`, and `deal` tables hold current state, updated by triggers or application code when activities are inserted. This avoids expensive aggregations for common queries:

```sql
-- When a new activity is inserted for a contact, update the contact's last_activity_at
CREATE OR REPLACE FUNCTION update_contact_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE contact
    SET last_activity_at = NEW.occurred_at,
        updated_at = NOW()
    WHERE id = NEW.contact_id
      AND (last_activity_at IS NULL OR last_activity_at < NEW.occurred_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_contact_last_activity
  AFTER INSERT ON activity
  FOR EACH ROW EXECUTE FUNCTION update_contact_last_activity();

-- Similar triggers for company and deal last_activity_at
-- Similar trigger for deal stage changes (when activity_type = 'deal_stage_changed')
```

### Timeline Query Pattern

The activity table is designed for efficient timeline queries:

```sql
-- Full timeline for a contact (all interactions, chronological)
SELECT
  a.activity_type,
  a.channel,
  a.direction,
  a.occurred_at,
  a.summary,
  a.sentiment,
  a.metadata,
  ic.raw_text  -- Only fetch full content when user expands
FROM activity a
LEFT JOIN interaction_content ic ON ic.id = a.raw_content_id
WHERE a.tenant_id = $tenant_id
  AND a.contact_id = $contact_id
ORDER BY a.occurred_at DESC
LIMIT 50 OFFSET $offset;

-- Timeline for a deal (all activities across all contacts in the deal)
SELECT
  a.activity_type,
  a.channel,
  a.direction,
  a.occurred_at,
  a.summary,
  a.sentiment,
  c.name AS contact_name,
  a.metadata
FROM activity a
LEFT JOIN contact c ON c.id = a.contact_id
WHERE a.tenant_id = $tenant_id
  AND a.deal_id = $deal_id
ORDER BY a.occurred_at DESC
LIMIT 50 OFFSET $offset;
```

### Idempotency

Email syncing and webhook processing will inevitably deliver duplicate events. The `idempotency_key` column prevents this:

```sql
-- For emails: idempotency_key = 'email:' + message_id header
-- For calendar events: idempotency_key = 'cal:' + event_uid + ':' + updated_at
-- For webhooks: idempotency_key = provider + ':' + webhook_event_id

INSERT INTO activity (tenant_id, activity_type, ..., idempotency_key)
VALUES ($1, $2, ..., $idempotency_key)
ON CONFLICT (idempotency_key) DO NOTHING;
```

### Partitioning Strategy (Future)

When the activity table grows large (10M+ rows), partition by `occurred_at`:

```sql
-- Convert to partitioned table (PostgreSQL 12+)
CREATE TABLE activity (
  -- ... same columns ...
) PARTITION BY RANGE (occurred_at);

-- Monthly partitions
CREATE TABLE activity_2026_01 PARTITION OF activity
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE activity_2026_02 PARTITION OF activity
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- ... etc, auto-created by a cron job or pg_partman

-- Benefits:
-- 1. Queries with time ranges only scan relevant partitions
-- 2. Old data can be moved to cheaper storage (archive partitions to S3)
-- 3. VACUUM is faster on smaller partitions
-- 4. Index maintenance is distributed
```

This is a "flag the ocean" item — not needed at launch. The single activity table with proper indexes handles millions of rows efficiently. Implement partitioning when query latency on the activity table exceeds 100ms for typical timeline queries.

---

## 7. Time-Series Data for Signals

### Why Signals Need Special Treatment

Signals are fundamentally different from activities:

- **Volume:** Orders of magnitude higher. Website visits, email opens, page views can generate thousands of events per day per company.
- **Decay:** Signals have a shelf life. A job posting from 6 months ago is irrelevant. A funding round from yesterday is gold.
- **Aggregation:** Signals are most useful in aggregate. "3 website visits today" matters more than each individual visit.
- **Sources:** Signals come from external providers (intent data vendors, web scrapers, news APIs) with varying reliability and freshness.

### Signal Storage Design

```sql
CREATE TABLE signal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id),

  -- What entity this signal relates to
  entity_type TEXT NOT NULL,    -- 'contact' or 'company'
  entity_id UUID NOT NULL,

  -- Signal classification
  signal_type TEXT NOT NULL,    -- from the enum list
  signal_category TEXT NOT NULL, -- 'intent', 'firmographic_change', 'engagement', 'news'
  source TEXT NOT NULL,          -- provider name

  -- Signal value
  strength REAL NOT NULL CHECK (strength >= 0 AND strength <= 1),
  confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  payload JSONB NOT NULL DEFAULT '{}', -- Raw signal data from provider

  -- Temporal
  detected_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,       -- NULL = never expires
  valid_from TIMESTAMPTZ,       -- For signals with a known start time
  valid_to TIMESTAMPTZ,         -- For signals with a known end time

  -- Processing
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,

  -- Dedup
  external_id TEXT,              -- Provider's ID for this signal
  fingerprint TEXT,              -- Hash for dedup: hash(entity_id + signal_type + payload_key_fields)

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_signal_fingerprint UNIQUE (tenant_id, fingerprint)
);

-- Indexes optimized for signal queries
CREATE INDEX idx_signal_tenant_entity_time
  ON signal(tenant_id, entity_type, entity_id, detected_at DESC);
CREATE INDEX idx_signal_tenant_type_time
  ON signal(tenant_id, signal_type, detected_at DESC);
CREATE INDEX idx_signal_unprocessed
  ON signal(tenant_id, detected_at)
  WHERE processed = FALSE;
CREATE INDEX idx_signal_active
  ON signal(tenant_id, entity_type, entity_id, strength DESC)
  WHERE (expires_at IS NULL OR expires_at > NOW());

-- RLS
ALTER TABLE signal ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON signal
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### Signal Aggregation for Scoring

Raw signals are aggregated into scores. Instead of querying thousands of individual signals for each contact/company, maintain a materialized score:

```sql
-- Aggregate signal scores table, refreshed periodically or on signal insert
CREATE TABLE entity_signal_score (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,

  -- Aggregate scores by category
  intent_score REAL NOT NULL DEFAULT 0,      -- 0-100
  engagement_score REAL NOT NULL DEFAULT 0,   -- 0-100
  firmographic_score REAL NOT NULL DEFAULT 0, -- 0-100
  news_score REAL NOT NULL DEFAULT 0,         -- 0-100
  composite_score REAL NOT NULL DEFAULT 0,    -- Weighted combination

  -- Score components for explainability
  score_breakdown JSONB NOT NULL DEFAULT '{}',
  -- e.g., {"intent": {"website_visits": 3, "keyword_searches": 2}, ...}

  -- Top signals for display
  top_signals JSONB NOT NULL DEFAULT '[]',
  -- e.g., [{"type": "funding_round", "summary": "Raised $20M Series B", "detected_at": "..."}]

  -- Temporal
  last_signal_at TIMESTAMPTZ,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_entity_score UNIQUE (tenant_id, entity_type, entity_id)
);

CREATE INDEX idx_entity_score_composite
  ON entity_signal_score(tenant_id, entity_type, composite_score DESC);
```

### Signal Decay Function

Signals lose value over time. The scoring function applies exponential decay:

```sql
-- Signal decay: half-life varies by signal type
-- Engagement signals (website visit, email open): half-life = 7 days
-- Intent signals (keyword search, competitor visit): half-life = 14 days
-- Firmographic signals (funding, new hire): half-life = 30 days
-- News signals: half-life = 14 days

CREATE OR REPLACE FUNCTION decayed_strength(
  raw_strength REAL,
  detected_at TIMESTAMPTZ,
  half_life_days INTEGER
) RETURNS REAL AS $$
BEGIN
  RETURN raw_strength * POW(0.5, EXTRACT(EPOCH FROM (NOW() - detected_at)) / (half_life_days * 86400));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Example: score all active signals for a company with decay
SELECT
  signal_type,
  SUM(decayed_strength(strength, detected_at,
    CASE signal_category
      WHEN 'engagement' THEN 7
      WHEN 'intent' THEN 14
      WHEN 'firmographic_change' THEN 30
      WHEN 'news' THEN 14
    END
  )) AS total_decayed_strength
FROM signal
WHERE tenant_id = $tenant_id
  AND entity_type = 'company'
  AND entity_id = $company_id
  AND (expires_at IS NULL OR expires_at > NOW())
GROUP BY signal_type;
```

### High-Volume Signal Ingestion

For high-volume signals (website visits, email tracking pixels), use a two-tier approach:

**Tier 1: Hot buffer (in-memory or Redis).**
- Collect raw events in Redis sorted sets or streams
- Key: `signals:{tenant_id}:{entity_id}`
- Deduplicate in real-time (same visitor, same page, within 5 minutes = one visit)
- Aggregate counters in Redis: `signal_count:{tenant_id}:{entity_id}:{signal_type}:{date}`

**Tier 2: Periodic flush to Postgres.**
- Every 5 minutes (or on threshold), flush aggregated signals from Redis to the signal table
- Insert one row per entity per signal type per time bucket, not one row per raw event
- This reduces signal table volume by 10-100x compared to raw event logging

```
Raw events (1000s/hour)
    │
    ▼
Redis stream (dedup + aggregate)
    │ every 5 min
    ▼
Postgres signal table (aggregated: ~100s/hour)
    │ every 15 min
    ▼
entity_signal_score table (one row per entity)
```

### Retention Policy

Signals have limited long-term value. Implement automated cleanup:

```sql
-- Delete expired signals older than 90 days
-- Run daily via pg_cron or application cron
DELETE FROM signal
WHERE expires_at < NOW() - INTERVAL '90 days';

-- Archive old signals (older than 1 year) to cold storage
-- Move to a signal_archive table or export to S3/Parquet
-- Keep the entity_signal_score as the permanent summary
```

---

## 8. Full-Text Search Integration

### Approach: PostgreSQL tsvector (built-in) + Hybrid with Vector Search

We do not need Elasticsearch or Typesense. PostgreSQL's full-text search is sufficient and eliminates an entire service from the architecture. The justification:

1. **Query volume is low.** This is not a public search engine. Each tenant makes maybe 10-50 NL queries per day. Postgres handles this trivially.
2. **Hybrid search requires co-location.** As discussed in the vector DB section, combining FTS with vector search in a single SQL query is the key architectural advantage. An external search engine would require application-level result merging.
3. **Maintenance cost is near zero.** tsvector indexes are maintained automatically on INSERT/UPDATE. No separate indexing pipeline.
4. **Capabilities are sufficient.** Postgres FTS supports: stemming, stop words, language-specific dictionaries, phrase search, ranking, highlighting, prefix matching.

### Implementation

```sql
-- Add tsvector columns as generated columns (PostgreSQL 12+)
-- This avoids manual maintenance — the vector updates automatically on any change

ALTER TABLE interaction_content ADD COLUMN
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(raw_text, ''))
  ) STORED;

ALTER TABLE contact ADD COLUMN
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english',
      COALESCE(name, '') || ' ' ||
      COALESCE(email, '') || ' ' ||
      COALESCE(title, '') || ' ' ||
      COALESCE(properties->>'notes', '')
    )
  ) STORED;

ALTER TABLE company ADD COLUMN
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english',
      COALESCE(name, '') || ' ' ||
      COALESCE(domain, '') || ' ' ||
      COALESCE(industry, '') || ' ' ||
      COALESCE(properties->>'description', '')
    )
  ) STORED;

ALTER TABLE activity ADD COLUMN
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(summary, ''))
  ) STORED;

-- GIN indexes for fast text search
CREATE INDEX idx_ic_search ON interaction_content USING GIN(search_vector);
CREATE INDEX idx_contact_search ON contact USING GIN(search_vector);
CREATE INDEX idx_company_search ON company USING GIN(search_vector);
CREATE INDEX idx_activity_search ON activity USING GIN(search_vector);
```

### Search Query Patterns

```sql
-- Basic keyword search across all interactions for a contact
SELECT
  a.activity_type,
  a.occurred_at,
  a.summary,
  ts_headline('english', ic.raw_text, query, 'MaxFragments=3,MaxWords=30,MinWords=15') AS highlight
FROM interaction_content ic
JOIN activity a ON a.raw_content_id = ic.id,
  plainto_tsquery('english', $search_term) query
WHERE ic.tenant_id = $tenant_id
  AND ic.search_vector @@ query
  AND a.contact_id = $contact_id
ORDER BY ts_rank(ic.search_vector, query) DESC
LIMIT 20;

-- Phrase search (exact phrase matching)
SELECT ...
FROM interaction_content ic,
  phraseto_tsquery('english', 'pricing discussion') query
WHERE ic.search_vector @@ query;

-- Prefix search (autocomplete-style)
SELECT ...
FROM contact c,
  to_tsquery('english', 'john:*') query
WHERE c.search_vector @@ query;

-- Combined keyword + vector hybrid search (the power query)
WITH keyword_results AS (
  SELECT
    ic.id,
    ts_rank(ic.search_vector, plainto_tsquery('english', $search_term)) AS fts_score
  FROM interaction_content ic
  WHERE ic.tenant_id = $tenant_id
    AND ic.search_vector @@ plainto_tsquery('english', $search_term)
  ORDER BY fts_score DESC
  LIMIT 50
),
vector_results AS (
  SELECT
    e.source_id AS id,
    1 - (e.embedding <=> $query_embedding) AS vec_score
  FROM embedding e
  WHERE e.tenant_id = $tenant_id
  ORDER BY e.embedding <=> $query_embedding
  LIMIT 50
)
SELECT
  COALESCE(k.id, v.id) AS id,
  COALESCE(k.fts_score, 0) AS fts_score,
  COALESCE(v.vec_score, 0) AS vec_score,
  -- RRF fusion
  (1.0 / (60 + COALESCE(k_rank, 999))) + (1.0 / (60 + COALESCE(v_rank, 999))) AS rrf_score
FROM keyword_results k
FULL OUTER JOIN vector_results v ON k.id = v.id
ORDER BY rrf_score DESC
LIMIT 10;
```

### When You WOULD Need Elasticsearch/Typesense

Only add a dedicated search engine if:
- **Faceted search UI** — showing filter counts (e.g., "Email (23) | Meeting (8) | Call (3)") at interactive speed across millions of documents. Postgres can do this but it gets slow at scale.
- **Typo tolerance** — "did you mean 'Salesforce' instead of 'Salesfroce'?" Postgres trigram similarity (`pg_trgm`) handles basic fuzzy matching but dedicated search engines are better.
- **Multi-language** — if serving customers in many languages simultaneously. Postgres FTS dictionaries are per-column, not per-row.
- **Sub-50ms autocomplete** — on millions of records. Postgres can do this at our scale but dedicated engines are more optimized.

None of these are day-one requirements. If they become needed, Typesense is the recommendation (simpler than Elasticsearch, open source, fast, good typo tolerance).

---

## 9. Schema-less Customer Data

### The Lightfield Insight

Lightfield's core innovation is that it captures everything without requiring users to define fields upfront. There is no "add a custom field" flow. The system learns what data exists from the data itself. This is the opposite of traditional CRM design (Salesforce, HubSpot) where you must pre-define every field.

### Implementation: JSONB `properties` Column + Dynamic Schema Discovery

Every entity table (contact, company, deal) has a `properties JSONB` column that stores all non-standard fields:

```sql
-- Example contact record
INSERT INTO contact (tenant_id, name, email, title, properties) VALUES (
  'tenant-123',
  'Sarah Chen',
  'sarah@acme.com',
  'VP Engineering',
  '{
    "linkedin_url": "https://linkedin.com/in/sarachen",
    "twitter": "@sarachen",
    "preferred_contact_method": "email",
    "timezone": "America/Los_Angeles",
    "budget_authority": true,
    "team_size": 45,
    "tech_stack": ["React", "Python", "AWS"],
    "notes_from_intro_call": "Interested in automating their SDR workflow",
    "competitor_using": "Outreach",
    "contract_renewal_date": "2026-09-15",
    "custom_whatever_the_user_wants": "any value"
  }'
);
```

### Dynamic Schema Discovery

To make schema-less data usable (not just a black hole), the system must discover and catalog what properties exist:

```sql
-- Property registry: tracks all known properties per tenant per entity type
CREATE TABLE property_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  entity_type TEXT NOT NULL, -- 'contact', 'company', 'deal'
  property_key TEXT NOT NULL,
  inferred_type TEXT NOT NULL, -- 'string', 'number', 'boolean', 'date', 'array', 'object'
  sample_values JSONB DEFAULT '[]', -- Last 5 unique values seen
  occurrence_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_property UNIQUE (tenant_id, entity_type, property_key)
);

-- When any entity's properties are updated, upsert into property_registry
CREATE OR REPLACE FUNCTION register_properties()
RETURNS TRIGGER AS $$
DECLARE
  prop_key TEXT;
  prop_value JSONB;
  prop_type TEXT;
BEGIN
  IF NEW.properties IS NOT NULL THEN
    FOR prop_key, prop_value IN SELECT * FROM jsonb_each(NEW.properties)
    LOOP
      -- Infer type
      prop_type := CASE jsonb_typeof(prop_value)
        WHEN 'string' THEN
          CASE
            WHEN prop_value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}' THEN 'date'
            ELSE 'string'
          END
        WHEN 'number' THEN 'number'
        WHEN 'boolean' THEN 'boolean'
        WHEN 'array' THEN 'array'
        WHEN 'object' THEN 'object'
        ELSE 'string'
      END;

      INSERT INTO property_registry (tenant_id, entity_type, property_key, inferred_type, sample_values, occurrence_count)
      VALUES (
        NEW.tenant_id,
        TG_TABLE_NAME,
        prop_key,
        prop_type,
        jsonb_build_array(prop_value),
        1
      )
      ON CONFLICT (tenant_id, entity_type, property_key) DO UPDATE
      SET
        occurrence_count = property_registry.occurrence_count + 1,
        last_seen_at = NOW(),
        inferred_type = CASE
          WHEN property_registry.inferred_type != EXCLUDED.inferred_type
          THEN 'mixed' -- Flag inconsistent types
          ELSE property_registry.inferred_type
        END,
        sample_values = CASE
          WHEN jsonb_array_length(property_registry.sample_values) < 5
          THEN property_registry.sample_values || EXCLUDED.sample_values
          ELSE property_registry.sample_values
        END;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_register_contact_properties
  AFTER INSERT OR UPDATE OF properties ON contact
  FOR EACH ROW EXECUTE FUNCTION register_properties();

CREATE TRIGGER trg_register_company_properties
  AFTER INSERT OR UPDATE OF properties ON company
  FOR EACH ROW EXECUTE FUNCTION register_properties();

CREATE TRIGGER trg_register_deal_properties
  AFTER INSERT OR UPDATE OF properties ON deal
  FOR EACH ROW EXECUTE FUNCTION register_properties();
```

### Querying Schema-less Data

JSONB supports efficient querying even without predefined schemas:

```sql
-- Find contacts where budget_authority is true
SELECT * FROM contact
WHERE tenant_id = $tenant_id
  AND properties @> '{"budget_authority": true}';

-- Find contacts using a specific technology
SELECT * FROM contact
WHERE tenant_id = $tenant_id
  AND properties -> 'tech_stack' ? 'React';

-- Find contacts with team_size > 50
SELECT * FROM contact
WHERE tenant_id = $tenant_id
  AND (properties ->> 'team_size')::integer > 50;

-- Find contacts with contract renewal in next 90 days
SELECT * FROM contact
WHERE tenant_id = $tenant_id
  AND (properties ->> 'contract_renewal_date')::date BETWEEN NOW() AND NOW() + INTERVAL '90 days';

-- GIN index on properties enables all @>, ?, and ?| operators at index speed
```

### Human-in-the-Loop Data Approval (Lightfield Pattern)

When the system auto-captures data from emails/meetings, it should not silently modify records. Instead:

```sql
CREATE TABLE pending_property_update (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  property_key TEXT NOT NULL,
  proposed_value JSONB NOT NULL,
  current_value JSONB,           -- NULL if new property
  source_activity_id UUID,       -- Which email/meeting this was extracted from
  extraction_confidence REAL,    -- 0.0-1.0
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, auto_approved
  reviewed_by UUID,              -- user who approved/rejected
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-approve high-confidence extractions from trusted sources
-- Manual review for low-confidence or conflicting data
-- This implements Lightfield's "human-in-the-loop" pattern
```

### Auto-Approval Rules

| Condition | Action |
|---|---|
| Confidence > 0.95 AND property is new (no existing value) | Auto-approve |
| Confidence > 0.95 AND existing value is NULL | Auto-approve |
| Confidence > 0.90 AND source is direct email from contact | Auto-approve |
| Confidence > 0.80 AND value matches a previously approved pattern | Auto-approve |
| Any update that would change an existing non-NULL value | Require human review |
| Confidence < 0.70 | Require human review |
| Conflicting values from multiple sources | Require human review |

---

## 10. Recommended Stack Summary

### Database Layer

| Component | Technology | Rationale |
|---|---|---|
| **Primary database** | PostgreSQL 16+ (via Supabase or Neon) | Full-featured, RLS, JSONB, FTS, mature |
| **Vector search** | pgvector 0.7+ (extension) | Co-located with data, hybrid search, transactional consistency |
| **Full-text search** | PostgreSQL tsvector (built-in) | No additional infrastructure, hybrid with vector search |
| **Cache / hot buffer** | Redis (Upstash or self-hosted) | Signal aggregation, session state, rate limiting |
| **Job queue** | BullMQ (Redis-backed) or pg-boss (Postgres-backed) | Embedding pipeline, signal processing, email sync |
| **File storage** | S3-compatible (Supabase Storage or R2) | Email attachments, meeting recordings |

### Data Flow Architecture

```
                    ┌──────────────────────────┐
                    │     External Sources      │
                    │  Gmail, Calendar, Calls,  │
                    │  LinkedIn, Intent Data,   │
                    │  Web Tracking, Webhooks   │
                    └───────────┬──────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │      Ingestion Layer      │
                    │  IMAP sync, Webhooks,     │
                    │  API polling, Scrapers    │
                    └───────────┬──────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │       Job Queue           │
                    │  (BullMQ / pg-boss)       │
                    │  Priority: email > meeting│
                    │  > signals > enrichment   │
                    └───────────┬──────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
    ┌─────────▼──────┐ ┌───────▼────────┐ ┌──────▼───────┐
    │  Store Activity │ │ Generate       │ │ Process      │
    │  + Content      │ │ Summary (LLM)  │ │ Signals      │
    │  in Postgres    │ │ + Embeddings   │ │ (aggregate,  │
    │                 │ │ (OpenAI)       │ │  score)      │
    └─────────┬──────┘ └───────┬────────┘ └──────┬───────┘
              │                │                  │
              └─────────────────┼─────────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │     PostgreSQL            │
                    │  ┌──────────────────┐     │
                    │  │ Core tables      │     │
                    │  │ (contact, deal,  │     │
                    │  │  activity, etc.) │     │
                    │  └──────────────────┘     │
                    │  ┌──────────────────┐     │
                    │  │ pgvector         │     │
                    │  │ (embeddings)     │     │
                    │  └──────────────────┘     │
                    │  ┌──────────────────┐     │
                    │  │ tsvector         │     │
                    │  │ (full-text)      │     │
                    │  └──────────────────┘     │
                    │  ┌──────────────────┐     │
                    │  │ JSONB properties │     │
                    │  │ (schema-less)    │     │
                    │  └──────────────────┘     │
                    └───────────┬──────────────┘
                                │
                    ┌───────────▼──────────────┐
                    │     Application Layer     │
                    │  NL Query Pipeline       │
                    │  (understand → retrieve  │
                    │   → fuse → generate)     │
                    └──────────────────────────┘
```

### Sizing Estimates (Per Tenant, Moderate Usage)

| Data Type | Volume (monthly) | Storage | Notes |
|---|---|---|---|
| Contacts | 500 new/month | ~50KB | Small records |
| Companies | 100 new/month | ~20KB | Small records |
| Deals | 50 new/month | ~10KB | Small records |
| Activities | 5,000/month | ~5MB | Includes summaries |
| Interaction content | 3,000/month | ~30MB | Email bodies, transcripts |
| Embeddings (1536d) | 4,000 vectors/month | ~25MB | ~6KB per vector |
| Signals | 10,000/month | ~10MB | After aggregation |
| **Total per tenant per month** | | **~70MB** | |
| **100 tenants, 12 months** | | **~84GB** | Well within single Postgres |

### Migration Strategy

Start with the simplest possible setup and add complexity only when data or query patterns demand it:

1. **Day 1:** Single Postgres instance with pgvector. All tables in `public` schema. RLS enabled. Redis for job queue and signal buffering.
2. **1,000 tenants (6-12 months):** Evaluate if any query is slow. Likely fine — 84GB is small for Postgres. Add read replicas if read contention appears.
3. **10,000 tenants (12-24 months):** Consider partitioning the activity and signal tables by time. Consider Qdrant as a vector search read replica if pgvector latency degrades.
4. **100,000 tenants (24+ months):** Regional database sharding. Dedicated instances for largest tenants. This is the "ocean" — architect for it but do not build it now.

### Key Architectural Decisions Summary

| Decision | Choice | Confidence | Alternatives Rejected |
|---|---|---|---|
| Primary database | PostgreSQL | 10/10 | MongoDB (no ACID for financial data), DynamoDB (no joins) |
| Multi-tenancy | Shared tables + RLS | 9/10 | Schema-per-tenant (migration complexity), DB-per-tenant (cost) |
| Vector storage | pgvector | 9/10 | Pinecone (separate infra), Qdrant (premature), Weaviate (overkill) |
| Embedding model | OpenAI text-embedding-3-small | 8/10 | Cohere (short context), local models (operational overhead) |
| Full-text search | PostgreSQL tsvector | 8/10 | Elasticsearch (operational burden), Typesense (premature) |
| Schema-less data | JSONB + property registry | 9/10 | MongoDB (sacrifices joins), separate KV store (complexity) |
| Activity pattern | Append-only log + materialized state | 9/10 | Full event sourcing (complexity), CRUD-only (loses history) |
| Signal storage | Postgres + Redis buffer | 8/10 | TimescaleDB (premature), ClickHouse (separate system) |
| NL query pipeline | Understand → Retrieve (vector+FTS+SQL) → Fuse → Generate | 9/10 | Vector-only retrieval (misses structured queries) |
| Job queue | BullMQ or pg-boss | 7/10 | SQS (AWS lock-in), Temporal (overkill for day 1) |

---

## Appendix A: Complete SQL Schema (Condensed)

For the full CREATE TABLE statements with all columns, constraints, indexes, and RLS policies, generate from this document during Phase 4 (Spec) of the relevant feature. This report covers the architectural decisions; the exact DDL should live in migration files within the codebase.

## Appendix B: Embedding Cost Projections

| Scenario | Tokens/month | Cost/month (embedding-3-small) | Vectors stored/month |
|---|---|---|---|
| 10 tenants, light usage | 500K | $0.01 | 2,000 |
| 100 tenants, moderate usage | 10M | $0.20 | 40,000 |
| 1,000 tenants, heavy usage | 200M | $4.00 | 800,000 |
| 10,000 tenants, heavy usage | 2B | $40.00 | 8,000,000 |

Embedding costs are negligible even at scale. The real cost is LLM inference for summary generation and query answering, not embedding generation.

## Appendix C: References and Prior Art

- **Lightfield approach:** Schema-less customer memory with auto-capture and NL queries. Their 95%+ recall claim is achievable with hybrid search (vector + FTS + structured) and proper chunking.
- **Monaco approach:** TAM building with ML scoring and signal-based prioritization. Their signal architecture maps to our signal table + entity_signal_score + decay functions.
- **Industry patterns:** Attio (schema-less CRM on Postgres JSONB), Clay (waterfall enrichment on structured data), Apollo (signal-based sequences), Gong (conversation intelligence with embeddings).
- **Technical references:** pgvector HNSW benchmarks show sub-20ms for 1M vectors at 1536d. RRF (Reciprocal Rank Fusion) is the standard for combining multiple retrieval signals without tuning weights.
