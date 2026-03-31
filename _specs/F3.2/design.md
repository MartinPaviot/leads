# F3.2: Contact Enrichment — Design

## System Fit
Contact enrichment complements company enrichment (F3.1). Enriched contacts feed into scoring (F3.4), TAM builder (F3.3), and outreach personalization (F4.2). Same pattern: Claude structured output for data, Inngest for background processing.

## Data Model
Uses existing `contacts` table fields:
- `title` (text) — Job title
- `email` (text) — Already exists
- `phone` (text) — Phone number
- `linkedinUrl` (text) — LinkedIn profile URL
- `companyId` (text) — FK to companies
- `properties` (jsonb) — Extensible: seniority, department, etc.
- `score` (real) — Contact fit score
- `scoreReasons` (jsonb) — Why this score

No schema changes needed.

## API Contracts

### POST /api/enrich-contacts
```typescript
// Request
{ contactIds: string[] }

// Response 200
{ success: true, enriched: number, failed: number }

// Response 401
{ error: "Unauthorized" }
```

### Inngest Event: contact/created
Triggered on contact creation for background enrichment.

## Data Flow
1. User clicks "Enrich" → POST /api/enrich-contacts → LLM generates professional data → DB update → re-embed
2. Contact created → Inngest event → enrichment function → same pipeline
3. Chat: "enrich Sarah Chen" → chat tool calls API → same pipeline

## UI Changes

### Contacts page
- Add columns: Status (enrichment indicator), Title, Company, Score
- Add "Enrich" button per row for un-enriched contacts
- Add "Enrich All" button in header
- Show enrichment status: enriched (green), pending (gray), failed (red)
- Loading state during enrichment

## Failure Handling
- LLM timeout: 30s per contact, skip and mark failed
- No API key: Return clear error
- Rate limit: Max 20 contacts per batch

## Security
- Auth required on all endpoints
- Tenant isolation via session
- No sensitive PII beyond what's already in the DB
