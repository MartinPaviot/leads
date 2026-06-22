// Field-level waterfall enrichment + cache (spec 08, _specs/08-waterfall-
// enrichment-and-cache). Fills each missing field by the cheapest acceptable
// provider, cache-first with per-field TTL, provenance-writing, budget-aware.
// Providers/cache/meter/persist injected (decoupled from parked spec-00/02).
export { enrichField, enrichAccount } from "./waterfall";
export { InMemoryFieldCache } from "./cache";
export { fieldTtlMs } from "./ttl";
export type {
  FieldResult,
  FieldProvider,
  FieldCache,
  FieldCacheEntry,
  FieldStatus,
  EnrichDeps,
  MeterOp,
} from "./types";
