# F3.5: Signal Overlay — Design

## System Fit
Signals are Monaco's Step 2: overlay intent data on top of firmographic data. This turns a static list into a dynamic, timing-aware pipeline. Signals feed into scoring (F3.4) and outreach personalization (F4.2).

## Data Model
Store signals in `companies.properties.signals` as a JSON array:
```typescript
interface Signal {
  type: "hiring" | "funding" | "tech_change" | "news" | "expansion" | "leadership_change";
  title: string;
  description: string;
  relevance: "high" | "medium" | "low";
  detectedAt: string; // ISO timestamp
}
```

No schema changes needed — uses existing JSONB `properties` field.

## API Contracts

### POST /api/signals/detect
```typescript
// Request
{ companyIds: string[] }

// Response 200
{ success: true, detected: number, totalSignals: number }
```

## Data Flow
1. User clicks "Detect Signals" → POST /api/signals/detect → LLM analyzes company → stores signals in properties → returns summary
2. After TAM generation or enrichment, signals can be auto-detected

## UI Changes

### Accounts page
- Add Signals column showing colored badges (hiring=blue, funding=green, tech=purple, news=gray)
- Tooltip on hover shows signal description
- "Detect Signals" button in header

## Failure Handling
- LLM timeout: skip company
- No signals found: empty array, not an error
