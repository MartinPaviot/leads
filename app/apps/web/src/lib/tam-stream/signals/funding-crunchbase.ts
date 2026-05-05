import type { SignalDetector } from "./types";
import type { Source } from "@/lib/tam-stream/events";
import {
  enrichOrganization,
  isCrunchbaseAvailable,
  crunchbaseProfileUrl,
  crunchbaseInvestorUrl,
} from "@/lib/integrations/crunchbase-client";

const RECENT_DAYS = 180;

/**
 * Crunchbase-sourced funding signal. Queries Crunchbase directly for
 * funding data with real investor names and Crunchbase URLs as sources.
 *
 * Fires when:
 *   - Company has a last_funding_at within the last 180 days
 *   - OR Crunchbase enrichment yields recent funding data
 *
 * Each source has a verified Crunchbase URL (company profile, investor
 * profiles). These populate the signal popover's "Sources" tab with
 * real clickable links.
 *
 * Falls back to a no-op when CRUNCHBASE_API_KEY is not configured —
 * the existing funding_recent signal (Apollo-sourced) continues to
 * work independently.
 */
export const detectFundingCrunchbase: SignalDetector = async (
  { search, enriched },
  ctx,
) => {
  const now = ctx.now.toISOString();

  if (!isCrunchbaseAvailable()) {
    return {
      value: false,
      reason: "Crunchbase API not configured",
      sources: [],
      confidence: "indeterminate",
      computedAt: now,
    };
  }

  const domain = search.primary_domain;
  if (!domain) {
    return {
      value: false,
      reason: "No domain to look up on Crunchbase",
      sources: [],
      confidence: "indeterminate",
      computedAt: now,
    };
  }

  let cbOrg: Awaited<ReturnType<typeof enrichOrganization>> = null;
  try {
    cbOrg = await enrichOrganization(domain);
  } catch {
    return {
      value: false,
      reason: "Crunchbase lookup failed",
      sources: [],
      confidence: "indeterminate",
      computedAt: now,
    };
  }

  if (!cbOrg) {
    return {
      value: false,
      reason: "Company not found on Crunchbase",
      sources: [],
      confidence: "high",
      computedAt: now,
    };
  }

  const lastFundingAt = cbOrg.last_funding_at;
  if (!lastFundingAt) {
    return {
      value: false,
      reason: cbOrg.last_funding_type
        ? `Last round: ${cbOrg.last_funding_type} (no date on Crunchbase)`
        : "No funding history on Crunchbase",
      sources: [
        {
          url: crunchbaseProfileUrl(cbOrg.permalink),
          title: `${search.name} on Crunchbase`,
          favicon: "https://www.google.com/s2/favicons?domain=crunchbase.com",
          fetchedAt: now,
          verified: false,
        },
      ],
      confidence: "high",
      computedAt: now,
    };
  }

  const fundingDate = new Date(lastFundingAt);
  if (Number.isNaN(fundingDate.getTime())) {
    return {
      value: false,
      reason: "Malformed funding date on Crunchbase",
      sources: [],
      confidence: "indeterminate",
      computedAt: now,
    };
  }

  const daysSince = Math.floor((ctx.now.getTime() - fundingDate.getTime()) / 86_400_000);
  const isRecent = daysSince >= 0 && daysSince <= RECENT_DAYS;

  if (!isRecent) {
    return {
      value: false,
      reason: `Last round ${cbOrg.last_funding_type ?? "unknown"} was ${daysSince}d ago (Crunchbase)`,
      sources: [
        {
          url: crunchbaseProfileUrl(cbOrg.permalink),
          title: `${search.name} on Crunchbase`,
          favicon: "https://www.google.com/s2/favicons?domain=crunchbase.com",
          fetchedAt: now,
          verified: false,
        },
      ],
      confidence: "high",
      computedAt: now,
    };
  }

  const amountStr = cbOrg.funding_total
    ? `$${(cbOrg.funding_total.value / 1_000_000).toFixed(1)}M`
    : null;

  const investorNames = cbOrg.investor_identifiers.map((i) => i.value);

  const reasonBits = [
    cbOrg.last_funding_type ?? "Funding round",
    amountStr,
    `${daysSince}d ago`,
    investorNames.length > 0
      ? `via ${investorNames.slice(0, 3).join(", ")}${investorNames.length > 3 ? "..." : ""}`
      : null,
  ].filter(Boolean);

  const sources: Source[] = [
    {
      url: crunchbaseProfileUrl(cbOrg.permalink),
      title: `${search.name} on Crunchbase`,
      favicon: "https://www.google.com/s2/favicons?domain=crunchbase.com",
      fetchedAt: now,
      verified: false,
    },
    ...cbOrg.investor_identifiers.slice(0, 3).map((inv) => ({
      url: crunchbaseInvestorUrl(inv.permalink),
      title: inv.value,
      favicon: "https://www.google.com/s2/favicons?domain=crunchbase.com",
      fetchedAt: now,
      verified: false,
    })),
  ];

  return {
    value: true,
    reason: `Raised ${reasonBits.join(" · ")} (Crunchbase)`,
    sources,
    confidence: "high",
    computedAt: now,
  };
};
