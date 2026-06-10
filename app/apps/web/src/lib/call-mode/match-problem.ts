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

/**
 * Placeholder convention for tenant enjeux: an enjeu containing `{tool}` is
 * interpolated with the detected replaceable tool at display time — and HIDDEN
 * when no tool is detected (a raw placeholder must never be read aloud).
 */
export const TOOL_PLACEHOLDER = "{tool}";

export interface DisplayProblem {
  /** Index into the ORIGINAL problems array (stable for checkboxes/edit). */
  idx: number;
  /** The text to show/say (interpolated when the enjeu carried {tool}). */
  text: string;
  /** True when this enjeu was grounded by interpolating the detected tool. */
  viaTool: boolean;
}

/**
 * Plan the read-mode problem list for THIS prospect: interpolate or hide
 * `{tool}` enjeux, then pick the most relevant one — a tool-grounded enjeu
 * wins outright (it literally names what they run); otherwise fall back to
 * token overlap with the trigger text. matchedIdx is an ORIGINAL index, or -1.
 */
export function planProblems(
  problems: string[],
  triggerText?: string | null,
  tool?: string | null,
): { display: DisplayProblem[]; matchedIdx: number } {
  const t = (tool ?? "").trim();
  const display: DisplayProblem[] = [];
  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    if (p.includes(TOOL_PLACEHOLDER)) {
      if (!t) continue; // no detected tool → never show a raw placeholder
      display.push({ idx: i, text: p.split(TOOL_PLACEHOLDER).join(t), viaTool: true });
    } else {
      display.push({ idx: i, text: p, viaTool: false });
    }
  }
  const toolHit = display.find((d) => d.viaTool);
  if (toolHit) return { display, matchedIdx: toolHit.idx };
  const overlapPos = matchProblem(display.map((d) => d.text), triggerText);
  return { display, matchedIdx: overlapPos < 0 ? -1 : display[overlapPos].idx };
}
