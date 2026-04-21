# Provider Abstraction — Design

## Normalized shape

`EnrichedCompany` is the single type every adapter emits and the registry merges:

```ts
interface EnrichedCompany {
  domain: string | null;
  name: string | null;
  industry: string | null;
  description: string | null;
  employeeCount: number | null;
  sizeRange: string | null;           // "11-50"
  annualRevenue: number | null;       // USD
  revenueRange: string | null;
  foundedYear: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  technologies: string[];             // never null — empty array
  keywords: string[];
  fundingStage: string | null;        // "series_a"
  totalFunding: number | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  raw: Record<string, unknown> | null;// forensic — provider's raw payload
}
```

Rationale: callers bind to a stable contract. Providers normalize into it. No per-provider shape leakage downstream.

## Provider interface

```ts
interface CompanyEnrichmentProvider {
  name: string;                  // "apollo", "llm-fallback"
  priority: number;              // lower = called first in waterfall
  isAvailable(): boolean;        // returns false when env missing
  costCentsPerCall: number;      // 0 for free providers
  enrich(input, ctx): Promise<EnrichResult>;
}

interface EnrichInput { domain?: string; name?: string; linkedinUrl?: string; }
interface ProviderContext { tenantId: string; }
interface EnrichResult {
  ok: boolean;
  data: Partial<EnrichedCompany> | null;
  error?: string;
  provider: string;
  durationMs: number;
  costCents: number;
}
```

Partial return is intentional — LLM fallback may only know industry + description, Apollo knows everything. The waterfall merges.

## Registry

`company-enrichment/registry.ts` holds the provider list:
- `registerProvider(p)` — module-load time, never at request time
- `listProviders()` — returns the sorted, available set
- Lazy: if no providers registered, first call to the registry triggers `registerDefaults()` — wires Apollo + LLM-fallback.

Tests can call `resetRegistryForTest()` to inject mocks.

## Waterfall

`enrichCompany(input, ctx)` pseudocode:

```
result = emptyCompany()
provenance = []
attempts = []
totalCents = 0

for provider in listProviders() sorted by priority ascending:
  if not provider.isAvailable(): continue
  attempt = await provider.enrich(input, ctx)
  attempts.push(attempt)
  totalCents += attempt.costCents
  if attempt.ok and attempt.data:
    for field in attempt.data keys:
      if result[field] is null/empty and attempt.data[field] is non-null/non-empty:
        result[field] = attempt.data[field]
        provenance.push({ provider: provider.name, field, at: now })
  if isSaturated(result): break   // has all high-value fields, stop
```

`isSaturated` policy: industry + description + (employeeCount or sizeRange) present. Fast exit saves LLM calls when Apollo already answered.

## Provenance persistence

Waterfall returns `{ data, provenance, attempts, totalCents }`. Caller writes:
- `companies.properties.enrichmentProvenance = provenance`
- `companies.properties.enrichmentCostCents = (existing + totalCents)`
- `companies.properties.enrichmentLastRun = now`

Caller never has to think about which provider ran.

## Failure modes

| Scenario | Behavior |
|---|---|
| No provider available | returns `{ ok:false, data: emptyCompany(), provenance: [], attempts: [] }` |
| All providers error | same as above with attempts populated for diagnosis |
| Primary throws | caught, logged, move to next provider |
| Primary returns empty (no match) | counted as ok:false, move to next |
| Primary returns partial | merge, continue to secondary for missing fields |

## Testing strategy

Unit tests are fully in-memory:
- `registerProvider()` mocks with configurable outcomes
- `resetRegistryForTest()` between cases
- No network calls, no DB — pure function behavior.

One integration test wires the real adapters and stubs network at the `fetch` layer.
