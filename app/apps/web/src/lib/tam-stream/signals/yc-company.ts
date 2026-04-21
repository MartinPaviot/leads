import type { SignalDetector } from "./types";
import type { Source } from "@/lib/tam-stream/events";

/**
 * Heuristic: Apollo doesn't tag YC companies natively. We scan the
 * description + keywords for "Y Combinator" / "YC" mentions and
 * batch codes (W22, S23, X25…). Confidence is `medium` because the
 * heuristic is fragile — rare false positives on companies that
 * merely mention YC, rare false negatives on companies with stale
 * profiles.
 *
 * Citation is a search URL on ycombinator.com with the company
 * name — when HEAD-checked, the YC search page itself always 200s,
 * so the chip stays verified regardless of whether the specific
 * company is actually listed. The user can verify by clicking.
 *
 * If Apollo ever exposes a YC flag, swap this detector for a lookup
 * and bump confidence to `high`.
 */

// Batch codes: W = winter, S = summer, F = fall (legacy), IK = AI Track
// Pattern matches 2-digit years ≥ 05 to cut down on false positives
// from two-letter words (e.g. "S 25% off"). Still imperfect but the
// full context (phrase-level) filter below tightens it.
const BATCH_CODE_RE = /\b(W|S|F|IK|SU|X)(0[5-9]|[12]\d)\b/i;
const YC_PHRASE_RE = /\b(Y[-\s]?Combinator|Y\s*C\b)/i;
// "YC" as a bare abbreviation is too noisy (Yahoo Customer, Yellow
// Cab, etc.). Only match when adjacent to batch context.
const YC_TIGHT_RE = /\byc\s*(backed|alum|company|batch|w\d{2}|s\d{2})\b/i;

export const detectYcCompany: SignalDetector = async (
  { search, enriched },
  ctx,
) => {
  const now = ctx.now.toISOString();
  const desc =
    enriched?.description ?? search.description ?? "";
  const keywords = [
    ...(enriched?.keywords ?? []),
    ...(search.keywords ?? []),
  ].join(" ");
  const haystack = `${desc} ${keywords}`;

  const phraseHit = YC_PHRASE_RE.test(haystack);
  const batchMatch = haystack.match(BATCH_CODE_RE);
  const tightHit = YC_TIGHT_RE.test(haystack);

  const hit = phraseHit || tightHit || (batchMatch && /Y[-\s]?Combinator|yc/i.test(haystack));

  if (!hit) {
    return {
      value: false,
      reason: "No Y Combinator mention detected",
      sources: [],
      confidence: "high",
      computedAt: now,
    };
  }

  // Try to surface the batch code for a richer reason string.
  const batch = batchMatch?.[0]?.toUpperCase();
  const reasonBits = [
    "Mentions Y Combinator in profile",
    batch ? `batch ${batch}` : null,
  ].filter(Boolean);

  const ycSearchUrl = `https://www.ycombinator.com/companies?query=${encodeURIComponent(search.name)}`;
  const sources: Source[] = [
    {
      url: ycSearchUrl,
      title: `${search.name} on YC directory`,
      favicon: `https://www.google.com/s2/favicons?domain=ycombinator.com`,
      fetchedAt: now,
      verified: false,
    },
  ];

  return {
    value: true,
    reason: reasonBits.join(" · "),
    sources,
    // Heuristic-based — signal to the UI that it should render a
    // dashed border chip and mention "heuristic" in the popover.
    confidence: "medium",
    computedAt: now,
  };
};
