/**
 * Fuzzy subsequence ranking for the command palette (INBOX-K01 core). Pure +
 * unit-tested.
 *
 * fuzzyScore returns null when the query isn't a subsequence of the label, else a
 * score that rewards contiguous runs and early matches; fuzzyRank filters
 * non-matches and orders the rest best-first. The palette surface + the command
 * registry it ranks are wiring on top (residual).
 */

export function fuzzyScore(label: string, query: string): number | null {
  const l = (label || "").toLowerCase();
  const q = (query || "").toLowerCase().trim();
  if (!q) return 0;

  let li = 0;
  let score = 0;
  let streak = 0;
  let firstIdx = -1;
  for (const ch of q) {
    const idx = l.indexOf(ch, li);
    if (idx === -1) return null; // not a subsequence
    if (firstIdx === -1) firstIdx = idx;
    streak = idx === li ? streak + 1 : 0; // contiguous with the previous match
    score += 1 + streak;
    li = idx + 1;
  }
  // Reward an early first match (prefix-ish hits feel more relevant).
  score += Math.max(0, 5 - firstIdx);
  return score;
}

export function fuzzyRank<T extends { label: string }>(items: T[], query: string): T[] {
  if (!query.trim()) return items;
  return items
    .map((it) => ({ it, s: fuzzyScore(it.label, query) }))
    .filter((x): x is { it: T; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.it);
}
