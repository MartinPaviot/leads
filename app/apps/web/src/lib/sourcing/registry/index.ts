// Registry sourcing (spec 06, _specs/06-sourcing-registry). Sources + identity-
// anchors FR/CH accounts from official registries (SIRENE/Pappers/Zefix) on the
// legal_id key, cache-first, metered. Reuses the existing registry clients +
// spec-01 normalizers; injects spec-00 upsert + spec-02 meter + the cache.
export { sourceFromRegistry, enrichFromRegistry } from "./source";
export { pappersToCanonical, sireneToCanonical, zefixToCanonical } from "./map";
export {
  REGISTRY_TTL_MS,
  type CanonicalRegistryAccount,
  type RegistryDeps,
  type RegistrySegment,
  type RegistryCache,
  type RegistryAddress,
  type MeterOp,
} from "./types";
export { nafToNaics, nogaToNaics, inseeEffectifToBand } from "@/lib/providers/normalizers/activity-codes";
