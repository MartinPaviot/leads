import type { SignalDetector } from "./types";
import type { Source } from "@/lib/tam-stream/events";

const RECENT_DAYS = 180;

function crunchbaseCompanyUrl(name: string, domain: string | null): string {
  // Prefer domain-based lookup when available — Crunchbase permalinks
  // are slug-based but the name slug is usually close enough for HEAD
  // to succeed on well-known companies. Fall back to name.
  const base = (domain?.split(".")[0] ?? name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `https://www.crunchbase.com/organization/${base}`;
}

/**
 * Fires when the target company raised capital within the last 180
 * days. Relies on Apollo's `latest_funding_raised_at` field which is
 * present on enriched orgs with known rounds.
 *
 * Confidence:
 *   - high : `latest_funding_raised_at` is present and ISO-parseable
 *   - indeterminate : Apollo has no round date. We could try to
 *     infer from `latest_funding_stage` alone but stage without date
 *     is worse than silent — we'd flag Series A companies funded
 *     years ago as "recent".
 *
 * The URL is a constructed Crunchbase permalink. The stream handler
 * will HEAD-check it before surfacing to the popover — verified
 * false-positives degrade to a "Search Crunchbase" fallback chip.
 */
export const detectFundingRecent: SignalDetector = async (
  { search, enriched },
  ctx,
) => {
  const now = ctx.now;
  const raisedAt = enriched?.latest_funding_raised_at ?? search.latest_funding_raised_at ?? null;
  const stage = enriched?.latest_funding_stage ?? search.latest_funding_stage ?? null;
  const amountPrinted =
    enriched?.total_funding_printed ?? search.total_funding_printed ?? null;

  if (!raisedAt) {
    return {
      value: false,
      reason: stage
        ? `Latest stage: ${stage} (no round date on file)`
        : "No funding history on file",
      sources: [],
      confidence: "indeterminate",
      computedAt: now.toISOString(),
    };
  }

  const raised = new Date(raisedAt);
  if (Number.isNaN(raised.getTime())) {
    return {
      value: false,
      reason: "Malformed funding date",
      sources: [],
      confidence: "indeterminate",
      computedAt: now.toISOString(),
    };
  }

  const daysSince = Math.floor((now.getTime() - raised.getTime()) / 86_400_000);
  const isRecent = daysSince >= 0 && daysSince <= RECENT_DAYS;

  if (!isRecent) {
    return {
      value: false,
      reason:
        daysSince > RECENT_DAYS
          ? `Last round ${stage ?? "unknown"} was ${daysSince} days ago`
          : "No recent funding",
      sources: [],
      confidence: "high",
      computedAt: now.toISOString(),
    };
  }

  const reasonBits = [
    stage ? `${stage}` : "Funding round",
    amountPrinted ? amountPrinted : null,
    `${daysSince}d ago`,
  ].filter(Boolean);

  const sources: Source[] = [
    {
      url: crunchbaseCompanyUrl(search.name, search.primary_domain),
      title: `${search.name} on Crunchbase`,
      favicon: `https://www.google.com/s2/favicons?domain=crunchbase.com`,
      fetchedAt: now.toISOString(),
      verified: false,
    },
  ];

  return {
    value: true,
    reason: `Raised ${reasonBits.join(" · ")}`,
    sources,
    confidence: "high",
    computedAt: now.toISOString(),
  };
};
