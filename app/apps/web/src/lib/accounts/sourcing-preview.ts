/**
 * Contact-sourcing preview — pure partitioning for the "show me exactly what
 * will be sourced, by ICP, before I commit" confirmation step.
 *
 * Founder ask (2026-06-16): when sourcing contacts into selected accounts, see
 * (a) the ICP titles/seniorities that will be searched, and (b) which accounts
 * are in-ICP vs "entreprises sans intérêt", so nothing runs blind.
 *
 * This module is the pure half: given the selected accounts' primary ICP fit
 * (companies.score, 0-100) it classifies each as in-ICP / out-of-ICP /
 * unscored / no-domain and picks which accounts to pull a live Apollo sample
 * for. No DB, no Apollo — fully unit-testable. The route does the I/O.
 */

import { getGrade } from "@/lib/scoring/scoring";

/** Score floor (0-100) for "in your ICP". 40 = grade C ("Cool") and up — a
 *  company below it is a weak/registry match the user probably doesn't want to
 *  source people into. Mirrors the contact scorer's company-score tiers. */
export const IN_ICP_SCORE_THRESHOLD = 40;

export interface PreviewAccountInput {
  id: string;
  name: string;
  domain: string | null;
  /** companies.score — the primary-ICP fit (0-100), or null when never scored. */
  score: number | null;
}

export interface PreviewAccount {
  accountId: string;
  name: string;
  domain: string | null;
  score: number | null;
  /** A+/A/B/C/D/F, or null when unscored. */
  grade: string | null;
  inIcp: boolean;
  hasDomain: boolean;
}

export interface PreviewSummary {
  total: number;
  /** Scored at/above the ICP floor AND has a domain (sourceable). */
  inIcp: number;
  /** Scored below the ICP floor — flagged, removable. */
  outIcp: number;
  /** No domain → cannot source contacts, ignored. */
  noDomain: number;
  /** Never scored against the ICP — fit unknown, not flagged out. */
  unscored: number;
}

export interface PreviewPartition {
  accounts: PreviewAccount[];
  summary: PreviewSummary;
  /** Account ids (with a domain, in-ICP first) to pull a live Apollo sample
   *  for — capped so the preview stays cheap. */
  sampleAccountIds: string[];
}

/**
 * Classify the selected accounts for the preview. `sampleSize` caps how many
 * accounts get a live Apollo sample (default 3 — the hybrid mode).
 */
export function partitionAccountsForPreview(
  inputs: PreviewAccountInput[],
  opts: { threshold?: number; sampleSize?: number } = {},
): PreviewPartition {
  const threshold = opts.threshold ?? IN_ICP_SCORE_THRESHOLD;
  const sampleSize = opts.sampleSize ?? 3;

  const accounts: PreviewAccount[] = inputs.map((a) => {
    const scored = typeof a.score === "number" && Number.isFinite(a.score);
    const hasDomain = !!(a.domain && a.domain.trim());
    return {
      accountId: a.id,
      name: a.name,
      domain: a.domain ?? null,
      score: scored ? a.score : null,
      grade: scored ? getGrade(a.score as number).grade : null,
      inIcp: scored ? (a.score as number) >= threshold : false,
      hasDomain,
    };
  });

  const summary: PreviewSummary = {
    total: accounts.length,
    inIcp: accounts.filter((a) => a.inIcp && a.hasDomain).length,
    outIcp: accounts.filter((a) => a.score !== null && !a.inIcp).length,
    noDomain: accounts.filter((a) => !a.hasDomain).length,
    unscored: accounts.filter((a) => a.score === null).length,
  };

  // Sample the most relevant first: in-ICP with a domain, then any other with
  // a domain (so an all-unscored selection still shows something real).
  const withDomain = accounts.filter((a) => a.hasDomain);
  const ordered = [
    ...withDomain.filter((a) => a.inIcp),
    ...withDomain.filter((a) => !a.inIcp),
  ];
  const sampleAccountIds = ordered.slice(0, sampleSize).map((a) => a.accountId);

  return { accounts, summary, sampleAccountIds };
}
