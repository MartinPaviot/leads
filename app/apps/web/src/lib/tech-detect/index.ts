/**
 * Tech-stack detection — public entry. Fetches a prospect's homepage and runs
 * the deterministic matcher, returning the tools detected and the "replaceable"
 * subset (proprietary SaaS Pilae's offer could substitute — the grounded
 * "SaaS remplaçable" trigger). Keyless; fails to an empty result, never throws.
 *
 * This is OPT-IN by design: nothing here runs on its own. It is invoked only by
 * the à-la-carte "Tech stack" enrichment criterion / the techdetect provider,
 * so no tenant scans a prospect's site unless they asked for it.
 */

import { fetchSiteSignals, type FetchDeps } from "./fetch";
import { detectFromSignals, type DetectedTool } from "./detect";

export interface TechDetectResult {
  domain: string;
  ok: boolean;
  tools: DetectedTool[];
  /** Replaceable proprietary SaaS only — the trigger we care about. */
  replaceable: DetectedTool[];
}

export async function detectTechStack(domain: string, deps?: FetchDeps): Promise<TechDetectResult> {
  const signals = await fetchSiteSignals(domain, deps ?? {});
  if (!signals) return { domain, ok: false, tools: [], replaceable: [] };
  const tools = detectFromSignals(signals);
  return { domain, ok: true, tools, replaceable: tools.filter((t) => t.replaceable) };
}

export type { DetectedTool, PageSignals } from "./detect";
export type { FetchDeps } from "./fetch";
