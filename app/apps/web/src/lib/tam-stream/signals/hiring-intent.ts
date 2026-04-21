import type { SignalDetector } from "./types";
import type { Source } from "@/lib/tam-stream/events";

/**
 * Fires when Apollo reports at least one active job posting at the
 * target company. The count itself is surfaced in the reason so
 * the founder can prioritize high-volume hirers.
 *
 * Confidence:
 *   - high : Apollo returned a numeric count (0 or more)
 *   - indeterminate : field missing on both search and enrich
 *     responses. Don't guess — hiring signals are actionable only
 *     when we're sure.
 *
 * Source is the company's own careers page when the domain is known,
 * falling back to the Apollo profile if the HEAD-check drops the
 * primary URL.
 */
export const detectHiringIntent: SignalDetector = async (
  { search, enriched },
  ctx,
) => {
  const now = ctx.now.toISOString();
  const count =
    enriched?.num_current_job_openings ?? search.num_current_job_openings;
  const domain = search.primary_domain;

  if (count === undefined || count === null) {
    return {
      value: false,
      reason: "Apollo has no job-posting data for this company",
      sources: [],
      confidence: "indeterminate",
      computedAt: now,
    };
  }

  if (count <= 0) {
    return {
      value: false,
      reason: "No active job postings",
      sources: [],
      confidence: "high",
      computedAt: now,
    };
  }

  const sources: Source[] = [];
  if (domain) {
    // Most SaaS companies expose /careers or /jobs — HEAD-check in
    // the stream handler picks the live one. We prefer /careers
    // because it's more common; /jobs second.
    sources.push({
      url: `https://${domain}/careers`,
      title: `${search.name} careers`,
      favicon: `https://www.google.com/s2/favicons?domain=${domain}`,
      fetchedAt: now,
      verified: false,
    });
    sources.push({
      url: `https://${domain}/jobs`,
      title: `${search.name} jobs`,
      favicon: `https://www.google.com/s2/favicons?domain=${domain}`,
      fetchedAt: now,
      verified: false,
    });
  }

  const reason =
    count === 1
      ? "1 active job posting"
      : `${count} active job postings`;

  return {
    value: true,
    reason,
    sources,
    confidence: "high",
    computedAt: now,
  };
};
