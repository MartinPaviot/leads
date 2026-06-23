/**
 * TAM estimate via count-only sourcing (spec 13, AC3). Uses the injected spec-05
 * countAccounts (credit-free: one per_page=1 call reading total_entries, no
 * enrichment) so addressable volume is sized BEFORE any enrichment spend.
 */
import type { CanonicalICPQuery } from "@/lib/sourcing/apollo";

export interface TamDeps {
  /** spec-05 countAccounts (count-only, credit-free), injected. */
  count(query: CanonicalICPQuery): Promise<{ total: number; capped: boolean }>;
}

export async function estimateTam(query: CanonicalICPQuery, deps: TamDeps): Promise<{ total: number; capped: boolean }> {
  return deps.count(query);
}
