/**
 * Keyless website tech-detection as a company-enrichment provider. Fills the
 * `technologies` field from the prospect's REAL homepage (deterministic
 * fingerprinting, lib/tech-detect), where Apollo returns nothing.
 *
 * OPT-IN by construction: this provider is intentionally NOT registered in the
 * default waterfall (registerDefaults). It runs only when the à-la-carte
 * "Tech stack" criterion explicitly routes to it — so no tenant scans a
 * prospect's site unless they asked for it. Keyless and free.
 */

import type { CompanyEnrichmentProvider, EnrichInput, EnrichResult, ProviderContext } from "./types";
import { detectTechStack } from "@/lib/tech-detect";

export const techdetectCompanyEnrichmentProvider: CompanyEnrichmentProvider = {
  name: "techdetect",
  priority: 25,
  costCentsPerCall: 0,
  isAvailable: () => true,
  async enrich(input: EnrichInput, _ctx: ProviderContext): Promise<EnrichResult> {
    const start = Date.now();
    const base = { provider: "techdetect", costCents: 0 };
    if (!input.domain) {
      return { ok: false, data: null, error: "no domain", durationMs: Date.now() - start, ...base };
    }
    const res = await detectTechStack(input.domain);
    if (!res.ok || res.tools.length === 0) {
      return { ok: false, data: null, durationMs: Date.now() - start, ...base };
    }
    return {
      ok: true,
      data: { technologies: res.tools.map((t) => t.name) },
      durationMs: Date.now() - start,
      ...base,
    };
  },
};
