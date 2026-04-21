/**
 * Extract initials for the generated company avatar.
 *
 * Rules (per `logo-rendering-fix-plan.md` Q1):
 *   — Always emit 2 characters for normal inputs.
 *   — If the raw name is ≤ 2 chars long, render the name verbatim
 *     (e.g. "X" → "X", "AI" → "AI"). This keeps short brands readable
 *     rather than duplicated ("XX") or padded.
 *   — Strip stopword prefixes (The, La, Le, …) and common legal suffixes
 *     (Inc, Corp, Ltd, …) before picking the first two significant tokens.
 *   — Fall back to "?" for empty/whitespace input.
 *
 * Exported corpora are used by the initials unit tests and may be
 * consumed elsewhere if we ever need the same filtering in another
 * display context.
 */

export const STOPWORDS: ReadonlySet<string> = new Set([
  "the",
  "la",
  "le",
  "les",
  "el",
  "a",
  "an",
  "&",
  "and",
  "et",
  "of",
]);

export const SUFFIX_WORDS: ReadonlySet<string> = new Set([
  "inc",
  "inc.",
  "corp",
  "corp.",
  "co",
  "co.",
  "ltd",
  "ltd.",
  "llc",
  "l.l.c",
  "l.l.c.",
  "gmbh",
  "s.a.",
  "s.a.s",
  "s.a.s.",
  "sa",
  "sas",
  "ag",
  "ab",
  "bv",
  "oy",
  "plc",
  "pty",
  "sarl",
  "srl",
  "spa",
  "group",
  "holdings",
  "company",
]);

function upper(s: string): string {
  return s.toLocaleUpperCase("en-US");
}

export function initialsFor(companyName: string): string {
  const raw = (companyName ?? "").trim();
  if (raw.length === 0) return "?";

  // Short names render verbatim — "X" or "AI" aren't worth expanding.
  if (raw.length <= 2) return upper(raw);

  const tokens = raw.split(/\s+/).filter(Boolean);
  const significant = tokens.filter((tok) => {
    const lower = tok.toLowerCase().replace(/[.,]+$/, "");
    return !STOPWORDS.has(lower) && !SUFFIX_WORDS.has(lower);
  });

  // Fall back to the original token list if filtering nuked everything
  // (e.g. a brand that literally consists of stopwords — unlikely, but
  // "The The" is a real band and we'd rather return "TT" than "?").
  const pool = significant.length > 0 ? significant : tokens;

  if (pool.length === 1) {
    const only = pool[0];
    if (only.length >= 2) return upper(only.slice(0, 2));
    return upper(only);
  }

  return upper(pool[0][0] + pool[1][0]);
}
