# F3.1: Company Enrichment — Design

## System Fit

Company enrichment is the foundation of M3 Prospecting. Every downstream feature (scoring, TAM builder, signal overlay, semantic search) depends on having firmographic data on companies. The enrichment API already exists (`/api/enrich`) using Claude structured output. This design adds: UI integration, background auto-enrichment via Inngest, and tests.

## Data Model

Uses existing `companies` table fields:
- `industry` (text) — Primary industry classification
- `size` (text) — Employee count range
- `revenue` (text) — Estimated annual revenue range
- `description` (text) — 1-2 sentence description
- `properties` (jsonb) — Extensible: tech_stack, funding, location, etc.
- `updatedAt` (timestamp) — Tracks when last enriched

No schema changes needed.

## API Contracts

### POST /api/enrich (existing, enhanced)
```typescript
// Request
{ companyIds: string[] }

// Response 200
{ success: true, enriched: number, failed: number }

// Response 401
{ error: "Unauthorized" }

// Response 500
{ error: "No LLM API key configured" }
```

### Inngest Event: company/enrich
Triggered automatically when a company is created or when user requests enrichment.
```typescript
{
  name: "company/enrich",
  data: { companyIds: string[], tenantId: string }
}
```

## Data Flow

1. **Manual trigger**: User clicks "Enrich" on accounts page → POST /api/enrich → LLM generates firmographics → DB update → re-embed
2. **Auto trigger**: Company created (CSV import, manual) → Inngest event → enrichment function → same pipeline
3. **Chat trigger**: User says "enrich X" → chat tool calls /api/enrich → same pipeline

## UI Changes

### Accounts page
- Add columns: Industry, Size, Score (for F3.4), Description (tooltip)
- Add "Enrich" button per row (for un-enriched companies)
- Add "Enrich All" button in header (batch mode)
- Show enrichment status: enriched (green dot), pending (gray), failed (red)
- Loading state during enrichment (skeleton/spinner per row)

## Failure Handling

- LLM timeout: 30s per company, skip and mark failed
- LLM hallucination: Accept best-effort (MVP, no verification)
- Rate limit: Process max 20 companies per batch (existing)
- No API key: Return clear error, show in UI

## Security

- Auth required on all endpoints (existing)
- Tenant isolation via session (existing)
- No PII sent to LLM (company names are public data)
