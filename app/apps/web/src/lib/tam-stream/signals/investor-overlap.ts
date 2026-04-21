import type { SignalDetector } from "./types";
import type { Source } from "@/lib/tam-stream/events";

/** Converts a company/investor name into a Crunchbase slug. Not
 * guaranteed to exist — the HEAD-check in the stream handler drops
 * sources that 404. Kept deterministic (no API call) for cost zero. */
function crunchbaseInvestorUrl(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `https://www.crunchbase.com/organization/${slug}`;
}

/**
 * Detects whether any investor of the target company also invests
 * in the user's own company (i.e. "you share a board, ask for a
 * warm intro"). Case-insensitive set intersection with the tenant's
 * `companyInvestors` list stored in tenant settings.
 *
 * Confidence:
 *   - high : ≥1 name overlap AND we have investor data from Apollo
 *   - indeterminate : we have no investor data for the company OR
 *     the tenant hasn't configured its cap table. Chip shows grey.
 *
 * Deliberately does not retry or call external sources — the signal
 * is a pure in-memory intersection. If Apollo doesn't tag investors
 * for a company, we mark indeterminate rather than guess false.
 */
export const detectInvestorOverlap: SignalDetector = async (
  { search, enriched },
  ctx,
) => {
  const now = ctx.now.toISOString();
  const targetInvestors =
    (enriched?.investor_names ?? search.investor_names ?? []).filter(
      (s): s is string => typeof s === "string" && s.trim().length > 0,
    );

  // No data on the target's investors — we can't say yes or no.
  if (targetInvestors.length === 0) {
    return {
      value: false,
      reason: "No investor data on file for this company",
      sources: [],
      confidence: "indeterminate",
      computedAt: now,
    };
  }

  // Tenant hasn't filled its cap table — we could technically return
  // false, but that would misleadingly light up zero chips for every
  // row. Mark indeterminate so the user is prompted to add investors
  // rather than seeing a row of grey "no overlap" chips.
  if (ctx.tenantInvestors.size === 0) {
    return {
      value: false,
      reason: "Your investor list is empty — add it under Settings › Company to surface warm-intro leads",
      sources: [],
      confidence: "indeterminate",
      computedAt: now,
    };
  }

  const matches: string[] = [];
  for (const raw of targetInvestors) {
    const norm = raw.toLowerCase().trim();
    if (ctx.tenantInvestors.has(norm)) matches.push(raw);
  }

  if (matches.length === 0) {
    return {
      value: false,
      reason: "No common investors",
      sources: [],
      confidence: "high",
      computedAt: now,
    };
  }

  const sources: Source[] = matches.slice(0, 3).map((name) => ({
    url: crunchbaseInvestorUrl(name),
    title: name,
    favicon: `https://www.google.com/s2/favicons?domain=crunchbase.com`,
    fetchedAt: now,
    verified: false, // HEAD-check happens in the stream handler
  }));

  const reason =
    matches.length === 1
      ? `Shares investor: ${matches[0]}`
      : `Shares ${matches.length} investors: ${matches.slice(0, 3).join(", ")}${matches.length > 3 ? "…" : ""}`;

  return {
    value: true,
    reason,
    sources,
    confidence: "high",
    computedAt: now,
  };
};
