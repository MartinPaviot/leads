/**
 * Pick the sector enjeu most relevant to THIS prospect's trigger (detected
 * stack + live signal) by accent-insensitive token overlap. Extracted from the
 * script panel so it is unit-tested and shared (the engine's assembler uses
 * the same rule). Deliberately deterministic and conservative: -1 when nothing
 * overlaps — the caller keeps the normal order rather than faking relevance.
 *
 * Known limit (by design, not a bug): generic enjeux that never name a tool
 * can't match a stack of product names. The real upgrade is enjeu templates
 * that name the detected tool — tracked in the Living Script spec, not a
 * cleverness patch here.
 */

export function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

/** Index of the best-overlapping problem, or -1 when nothing overlaps. */
export function matchProblem(problems: string[], triggerText?: string | null): number {
  const t = (triggerText ?? "").trim();
  if (!t || problems.length === 0) return -1;
  const tw = tokenize(t);
  if (tw.size === 0) return -1;
  let best = -1;
  let bestScore = 0;
  problems.forEach((p, i) => {
    const pw = tokenize(p);
    let n = 0;
    for (const w of pw) if (tw.has(w)) n++;
    if (n > bestScore) {
      bestScore = n;
      best = i;
    }
  });
  return best;
}
