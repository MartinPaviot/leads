# Agentic Import — Design

## System Fit

Extends the existing smart import system (`/api/import/smart/`) with chat integration, dedup, relationship wiring, and background processing via Inngest. The chat agent gets a new `importCsvData` tool that orchestrates the entire flow.

## Data Model

### New table: `import_jobs`

```sql
CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_by UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'awaiting_confirmation', 'running', 'completed', 'failed', 'cancelled')),
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  entity_type TEXT,
  field_map JSONB,
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]',
  csv_hash TEXT NOT NULL,
  processed_row_hashes JSONB DEFAULT '[]',
  chat_thread_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_jobs_tenant ON import_jobs(tenant_id);
CREATE INDEX idx_import_jobs_status ON import_jobs(tenant_id, status);
CREATE INDEX idx_import_jobs_hash ON import_jobs(tenant_id, csv_hash);
```

## API Contracts

### `POST /api/import/agentic/analyze`
Analyze uploaded CSV, return proposed mapping.

Body: `{ csvText: string, fileName: string }`
Response:
```json
{
  "jobId": "uuid",
  "entityType": "contact",
  "fieldMap": { "First Name": "firstName", ... },
  "confidence": 0.92,
  "totalRows": 1523,
  "samplePreview": [...],
  "existingMatches": 45,
  "suggestedActions": ["45 contacts already exist — will merge/update"]
}
```

### `POST /api/import/agentic/confirm`
User confirms or modifies mapping, starts import.

Body:
```json
{
  "jobId": "uuid",
  "fieldMap": { ... },
  "entityType": "contact",
  "deduplicationStrategy": "merge",
  "createRelationships": true
}
```

### `GET /api/import/agentic/[jobId]/status`
Poll import progress.

Response: `{ status, processedRows, totalRows, created, updated, skipped, errors }`

## Data Flow

```
User uploads CSV in chat
  → Chat agent receives file attachment
  → Calls importCsvData tool
  → POST /api/import/agentic/analyze
    → Parse CSV, run LLM mapping
    → Check for existing records (dedup scan)
    → Create import_jobs entry (status: analyzing → awaiting_confirmation)
    → Return proposed mapping to chat
  → Agent presents mapping to user in chat
  → User confirms (or modifies) in natural language
  → Agent calls POST /api/import/agentic/confirm
    → Trigger Inngest function: import/execute
    → Status: running

Inngest import/execute function:
  → Process rows in batches of 100
  → For each row:
    → Hash row content for retry-safety
    → Check if hash already processed (skip if so)
    → Dedup check: look up by email/domain
    → If exists: merge (update non-null fields)
    → If new: create record
    → Wire relationships (contact → company, deal → contact + company)
    → Update import_jobs progress
  → On completion: notify via chat thread
  → Status: completed

Multi-file flow:
  → User uploads multiple files in sequence
  → Agent detects related files by analyzing column overlap
  → Proposes import order (companies → contacts → deals)
  → Links import_jobs via parent_job_id
  → Executes in dependency order
```

## Deduplication Strategy

### Contact matching
1. Exact email match (primary)
2. First name + last name + company domain (secondary)

### Account matching
1. Exact domain match (primary)
2. Normalized company name match (secondary)

### Merge behavior
- Update NULL fields with imported values
- Never overwrite existing non-null fields unless user explicitly confirms
- Log all merge decisions in import_jobs.errors as "merge" events

## Relationship Wiring

When importing contacts:
1. Extract company name/domain from CSV
2. Look up existing companies by domain or name
3. If found: associate contact with company
4. If not found and enough data: create company, then associate

When importing deals:
1. Match by contact email → find contact → find company
2. Associate deal with both contact and company

## Chat Integration

### New chat tool: `agenticImport`

```typescript
{
  name: "agenticImport",
  description: "Import CSV data into the CRM with AI-powered mapping, deduplication, and relationship wiring",
  parameters: {
    action: "analyze" | "confirm" | "status",
    csvText?: string,
    fileName?: string,
    jobId?: string,
    fieldMapOverrides?: Record<string, string>,
    deduplicationStrategy?: "merge" | "skip" | "create_new"
  }
}
```

## Failure Handling

- Row-level errors: log and continue (don't fail entire import)
- Network interruption: Inngest handles retry automatically
- Duplicate import detection: csv_hash prevents re-processing
- Partial import resume: processed_row_hashes tracks completed rows
- Import cancellation: user can say "cancel import" in chat → status: cancelled

## Security

- File size limit: 10MB per CSV
- Row limit: 100,000 per import
- Rate limit: 5 concurrent imports per tenant
- CSV content is not stored permanently (processed and discarded)
- Import history retained for 90 days
