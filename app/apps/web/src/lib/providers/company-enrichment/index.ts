/**
 * Company-enrichment provider entry-point.
 *
 * Callers should only import `enrichCompany` (waterfall) + the types.
 * Adapters + registry internals are not part of the public surface.
 */
export { enrichCompany } from "./waterfall";
export {
  registerProvider,
  listProviders,
  listAvailableProviders,
  resetRegistryForTest,
} from "./registry";
export type {
  EnrichedCompany,
  EnrichInput,
  EnrichResult,
  ProviderContext,
  ProvenanceEntry,
  WaterfallResult,
  CompanyEnrichmentProvider,
} from "./types";
export { emptyCompany } from "./types";
