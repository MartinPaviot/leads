/**
 * Citation extraction for the send-time re-verification gate
 * (OUT-02, _specs/OUT-02-signal-integrity).
 *
 * A draft's `personalizationSources` carry `{ kind, label, href,
 * quote? }` entries. Any http(s) href the founder approved is a
 * claim the recipient can click — if the source died between
 * approval and send, the message becomes a detectable lie. The
 * dispatch bridge re-verifies these URLs at T-0 and recalls the
 * draft when any fail.
 *
 * Pure helpers — the Inngest bridge stays thin and the policy is
 * unit-tested without a queue.
 */

export interface CitationCheckResult {
  url: string;
  verified: boolean;
  reason: string;
}

/** Collect unique, well-formed http(s) URLs from a draft's
 * personalization sources. Non-URL sources (quotes from calls,
 * internal facts) carry no link to rot and are ignored. */
export function collectCitationUrls(
  sources: Array<Record<string, unknown>> | null | undefined,
): string[] {
  if (!Array.isArray(sources)) return [];
  const out = new Set<string>();
  for (const s of sources) {
    const href = s?.href;
    if (typeof href !== "string") continue;
    const trimmed = href.trim();
    if (!/^https?:\/\//i.test(trimmed)) continue;
    try {
      // Throwing URLs are malformed — they could never be verified,
      // so surfacing them as citations would always recall the
      // draft. They get dropped here; the generator should never
      // produce them in the first place.
      new URL(trimmed);
      out.add(trimmed);
    } catch {
      // skip malformed
    }
  }
  return Array.from(out);
}

/**
 * Decide whether the draft may dispatch given the verification
 * outcomes. Fail-closed: ANY unverified citation blocks the send —
 * a transient timeout sends the draft back to review rather than
 * risking a dead link under the founder's name. Re-approval re-runs
 * the (cached) check.
 */
export function decideCitationGate(
  results: CitationCheckResult[],
): { ok: true } | { ok: false; deadUrls: string[]; reviewReason: string } {
  const dead = results.filter((r) => !r.verified);
  if (dead.length === 0) return { ok: true };
  const deadUrls = dead.map((d) => d.url);
  const listed = deadUrls.slice(0, 3).join(", ");
  const suffix = deadUrls.length > 3 ? ` (+${deadUrls.length - 3} more)` : "";
  return {
    ok: false,
    deadUrls,
    reviewReason: `Citation source unreachable at send time: ${listed}${suffix}. The referenced page may have been removed — re-check the claim before sending.`,
  };
}
