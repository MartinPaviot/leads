# F3.3: TAM Builder — Design

## System Fit
TAM Builder is Monaco's Day 1 magic moment: "founder logs in, sees entire market scored and ranked." It combines ICP input + LLM company generation + enrichment (F3.1) + scoring (F3.4). This is what differentiates from manual CRM setup.

## Data Model
New field on `tenants` table (via settings jsonb):
- `settings.icp` (string) — Natural language ICP description
- `settings.tamGeneratedAt` (ISO timestamp) — When TAM was last generated

Uses existing `companies` table — generated companies are stored as regular accounts with TAM metadata in `properties.source: "tam"`.

No schema changes needed.

## API Contracts

### POST /api/tam/generate
```typescript
// Request
{ icp: string }

// Response 200
{ success: true, companiesCreated: number, companiesEnriched: number }

// Response 400
{ error: "ICP description required" }
```

### GET /api/tam/status
```typescript
// Response 200
{ icp: string | null, tamGeneratedAt: string | null, totalCompanies: number }
```

### POST /api/tam/rebuild
```typescript
// Regenerates TAM from stored ICP
// Response 200
{ success: true, companiesCreated: number }
```

## Data Flow
1. User enters ICP → stored in tenant settings
2. LLM generates list of 30 companies matching ICP (name, domain, industry, size, revenue, description, whyItFits)
3. Each company is inserted into `companies` table with `properties.source: "tam"`
4. Enrichment (F3.1) runs on each to fill gaps
5. Scoring (F3.4) runs to assign fit scores
6. Accounts page shows TAM sorted by score

## LLM Prompt Strategy
Use Claude structured output to generate an array of companies:
- Input: ICP description + existing company names (to avoid duplicates)
- Output: Array of {name, domain, industry, size, revenue, description, whyItFits}
- Generate in batches of 10 to stay within token limits

## UI Changes

### Settings page (ICP section)
- Textarea for ICP description
- "Generate TAM" button
- Status: last generated date, company count
- "Rebuild TAM" button (visible after first generation)

### Accounts page
- TAM-sourced companies show a "TAM" badge
- Sort by score by default
- Filter: All / TAM / Manual

## Failure Handling
- LLM timeout: 60s for generation
- Duplicate companies: skip if name+domain already exists
- Empty results: show message, suggest broadening ICP

## Security
- Auth required
- ICP stored per-tenant
- Generated companies scoped to tenant
