import { registerContactProvider } from "./registry";
import { apolloContactEnrichmentProvider } from "./apollo-adapter";
import { kasprContactEnrichmentProvider } from "./kaspr-adapter";
import { lushaContactEnrichmentProvider } from "./lusha-adapter";

/**
 * Default contact-enrichment providers. Lazy-loaded by the waterfall.
 *
 * Priority (before geo-routing):
 *   10  Apollo  — broad, cheap; also the source of the LinkedIn URL Kaspr needs
 *   20  Kaspr   — FR mobile leader (geoAffinity FR → boosted ahead of Apollo for +33)
 *   30  Lusha   — FR/CH/EU fallback (geoAffinity FR/CH/EU)
 *
 * With geo-routing:
 *   FR prospect → Kaspr(-80) → Lusha(-70) → Apollo(10)
 *   CH prospect → Lusha(-70) → Apollo(10) → Kaspr(20)   (Kaspr is FR-only)
 *   US/other    → Apollo(10) → Kaspr(20) → Lusha(30)
 *
 * Every provider is gated by its env key, so with only APOLLO_API_KEY set
 * the chain is Apollo-only (today's behaviour) and lights up FR/CH mobile
 * fill the moment KASPR_API_KEY / LUSHA_API_KEY are added.
 */
export function registerContactDefaults(): void {
  registerContactProvider(apolloContactEnrichmentProvider);
  registerContactProvider(kasprContactEnrichmentProvider);
  registerContactProvider(lushaContactEnrichmentProvider);
}
