/**
 * P1-10 — firmographic/funding enrichment for the research agent. Wraps the
 * EXISTING company-enrichment waterfall (Apollo tier 10 → registries → LLM, with
 * per-field provenance) and exposes a clean FirmographicFacts (NO raw payload) as
 * the P1-9 agent's `enrichApollo` tool. The model folds funding/headcount/etc.
 * into the synthesized brief.
 *
 * Deploy-safe slice: feeds the agent only. Persisting firmographics + provenance
 * as brief columns (with [source: provider] citations in the prompt) is the
 * richer, migration-coupled path — deferred (see VERIFY).
 */

import { enrichCompany } from "@/lib/providers/company-enrichment/waterfall";
import type { EnrichedCompany } from "@/lib/providers/company-enrichment/types";
import type { FirmographicFacts, FieldProvenance } from "../types";

// Canonical home is `campaign-engine/types.ts` (avoids a prospect-context →
// providers import cycle). Re-exported here so existing imports keep working.
export type { FirmographicFacts, FieldProvenance } from "../types";

const FIRMOGRAPHIC_FIELDS: ReadonlySet<string> = new Set([
  "industry", "description", "employeeCount", "sizeRange", "annualRevenue", "revenueRange",
  "foundedYear", "city", "state", "country", "fundingStage", "totalFunding", "investors", "technologies",
]);

/** Project the enriched company to the firmographic subset — drops `raw` (R17). */
export function pickFirmographics(c: EnrichedCompany): FirmographicFacts {
  return {
    industry: c.industry,
    description: c.description,
    employeeCount: c.employeeCount,
    sizeRange: c.sizeRange,
    annualRevenue: c.annualRevenue,
    revenueRange: c.revenueRange,
    foundedYear: c.foundedYear,
    city: c.city,
    state: c.state,
    country: c.country,
    fundingStage: c.fundingStage,
    totalFunding: c.totalFunding,
    investors: c.investors ?? [],
    technologies: c.technologies ?? [],
  };
}

/**
 * The P1-9 `enrichApollo` tool impl. Null when there's no domain or no provider
 * enriched. Never throws (the waterfall doesn't); tenant-scoped via ctx.
 */
export async function enrichFirmographics(args: {
  domain: string | null;
  companyName: string;
  tenantId: string;
}): Promise<{ facts: FirmographicFacts; provenance: FieldProvenance[] } | null> {
  if (!args.domain) return null;
  const wf = await enrichCompany({ domain: args.domain, name: args.companyName }, { tenantId: args.tenantId });
  if (!wf.enriched) return null;
  const facts = pickFirmographics(wf.data);
  const provenance: FieldProvenance[] = wf.provenance
    .filter((p) => FIRMOGRAPHIC_FIELDS.has(p.field as string))
    .map((p) => ({ field: p.field as keyof FirmographicFacts, provider: p.provider, atIso: p.atIso }));
  return { facts, provenance };
}
