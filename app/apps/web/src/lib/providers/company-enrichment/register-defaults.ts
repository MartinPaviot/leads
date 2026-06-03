import { registerProvider } from "./registry";
import { apolloCompanyEnrichmentProvider } from "./apollo-adapter";
import { datagmaCompanyEnrichmentProvider } from "./datagma-adapter";
import { firmableCompanyEnrichmentProvider } from "./firmable-adapter";
import { hunterCompanyEnrichmentProvider } from "./hunter-adapter";
import { crunchbaseCompanyEnrichmentProvider } from "./crunchbase-adapter";
import { llmFallbackCompanyEnrichmentProvider } from "./llm-fallback-adapter";

/**
 * Wire the providers we ship by default. Called lazily from the
 * waterfall on first invocation when the registry is empty.
 *
 * Priority order (before geo-routing):
 *   10  Apollo     — cheapest, broadest US firmographics
 *   20  Datagma    — EU gap-fill (geoAffinity: EU → boosted to -30 for .fr/.de/.uk)
 *   20  Firmable   — AU/NZ specialist (geoAffinity: AU → boosted to -30 for .com.au)
 *   20  Crunchbase — funding stage/total + investor names (feeds the
 *                    funding + investor-overlap signals); global, no geo
 *   30  Hunter     — email finding + verification, global
 *  100  LLM        — last resort when no API keys or all miss
 *
 * With geo-routing active:
 *   EU domain (.fr/.de/.uk)  → Datagma(-30) → Apollo(10) → Hunter(30) → LLM(100)
 *   AU domain (.com.au/.nz)  → Firmable(-30) → Apollo(10) → Hunter(30) → LLM(100)
 *   US/other (.com/.io)      → Apollo(10) → Datagma(20) → Hunter(30) → LLM(100)
 */
export function registerDefaults(): void {
  registerProvider(apolloCompanyEnrichmentProvider);
  registerProvider(datagmaCompanyEnrichmentProvider);
  registerProvider(firmableCompanyEnrichmentProvider);
  registerProvider(crunchbaseCompanyEnrichmentProvider);
  registerProvider(hunterCompanyEnrichmentProvider);
  registerProvider(llmFallbackCompanyEnrichmentProvider);
}
