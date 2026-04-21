# Company Enrichment Provider Waterfall

Callers ask for company data by domain/name; the waterfall decides which providers to hit, merges their partial results into one normalized shape, and returns it with provenance + cost.

## Using it

```ts
import { enrichCompany } from "@/lib/providers/company-enrichment";

const result = await enrichCompany(
  { domain: "acme.com", name: "Acme Inc" },
  { tenantId: "t_123" },
);

// result.data is the merged EnrichedCompany
// result.provenance  is [{ provider, field, atIso }, ...]
// result.attempts    is every provider call + outcome
// result.totalCostCents  is the sum (US cents)
// result.enriched    true if at least one field was populated
```

The waterfall stops early when the result is **saturated** (`industry` + `description` + `employeeCount` or `sizeRange`) — no LLM call once Apollo has already answered.

## Current providers

| Name | Priority | Cost/call | Requires |
|---|---|---|---|
| `apollo` | 10 | 0¢ (flat plan) | `APOLLO_API_KEY` |
| `llm-fallback` | 100 | ~2¢ | `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` |

Providers with no env key quietly report `isAvailable() === false` and the waterfall skips them.

## Adding a new provider

Three files, ~50 LOC each:

1. `lib/providers/company-enrichment/myvendor-adapter.ts`
   ```ts
   import type { CompanyEnrichmentProvider } from "./types";
   export const myvendorProvider: CompanyEnrichmentProvider = {
     name: "myvendor",
     priority: 50,                      // between apollo (10) and llm (100)
     costCentsPerCall: 5,
     isAvailable: () => Boolean(process.env.MYVENDOR_API_KEY),
     async enrich(input, ctx) {
       // call myvendor, map payload → Partial<EnrichedCompany>, return EnrichResult
     },
   };
   ```
2. Add the import + `registerProvider(myvendorProvider)` in `register-defaults.ts`.
3. Add a case to `__tests__/providers/company-enrichment.test.ts` that covers the new provider's happy + failure paths.

No changes to callers. No changes to the registry. No changes to the waterfall.

## Writing back to `companies`

The waterfall returns data — persistence is the caller's job. `/api/enrich/route.ts` is the reference: it maps normalized fields to schema columns (industry/description/size/revenue) and dumps provenance + cost into `companies.properties`. Reuse `persistEnrichment` there as a template for new call sites (tam-builder, Inngest enrichment workers) when migrating them off direct Apollo/LLM imports.

## Tests

`__tests__/providers/company-enrichment.test.ts` covers: empty registry, single-provider success, saturation early-exit, merge across providers (first non-null wins, arrays union), primary throws → fallback, `isAvailable` skip, all-fail, cumulative cost, provider replacement by name.

All tests are in-memory — no network, no DB. Use `resetRegistryForTest()` between cases and inject mocks via `registerProvider`.
