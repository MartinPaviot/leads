/**
 * Bounded body excerpt for a brain activity.
 *
 * The brains historically surfaced only an activity's `summary` into the LLM —
 * and for an email `summary` IS the subject line (email-capture.ts), so the body
 * (rawContent), where the client's actual "go" / objection / next step lives,
 * never reached the model. The deal read reasoned on subject lines.
 *
 * This exposes a hard-capped head of that body. The cap is the prompt-budget
 * guard: the chat brain tool targets ~3K tokens (see lib/chat/tools/brain.ts),
 * so a body excerpt has to stay small — 160 chars carries the decision signal
 * ("Yes, we're good to go, send the contract by Friday") without ballooning the
 * activity list. Callers fetch only `left(rawContent, 300)` from Postgres so a
 * 500k body is never pulled into memory just to be trimmed here.
 *
 * Returns null for bodyless activities (stage changes, meeting rows, …) so the
 * consumer can omit the key entirely and spend zero tokens on them.
 */
export const ACTIVITY_EXCERPT_MAX = 160;

/** Head-only cap — the baseline. Kept as the comparison point the deal-signal
 *  eval measures `decisionAwareExcerpt` against (see lib/evals/deal-signal). */
export function activityExcerpt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > ACTIVITY_EXCERPT_MAX
    ? collapsed.slice(0, ACTIVITY_EXCERPT_MAX) + "…"
    : collapsed;
}

/**
 * Decision cues a deal read must not miss — the buyer's "go", objection,
 * next-step, or churn signal, EN + FR (the two product languages). Deliberately
 * broad: this is the deterministic FLOOR that centres the excerpt window; the
 * LLM judge tier (deal-signal-recall-gate) catches the paraphrases it misses.
 *
 * Boundary note: JS `\b` uses the ASCII word definition, so a TRAILING `\b`
 * right after an accented char never matches ("validé " ends é→space = two
 * non-word chars, no boundary) — the exact trap generate-message.ts documents.
 * The 2026-07-02 audit found every FR cue ending in an accent was dead. Both
 * edges now use unicode-aware lookarounds instead of `\b`.
 */
export const DECISION_CUE_RE =
  /(?<![\p{L}\p{N}])(good to go|let'?s proceed|ready to (?:sign|move|go)|send (?:the|over) (?:the )?(?:contract|paperwork|agreement|order form|msa)|go ahead|we'?re in|sign(?:ed|-?off)?|approv(?:e|ed|al)|move forward|green ?light|kick ?off|too expensive|out of budget|over budget|no budget|blocker|concern|need (?:sign-?off|approval|buy-?in)|security review|legal review|procurement|not (?:sure|moving forward|a fit)|going with|chose (?:another|someone)|by (?:mon|tues|wednes|thurs|fri)day|next (?:week|month|steps?|quarter)|circle back|follow up|schedule (?:a )?(?:call|demo)|pilot|proof of concept|poc|board meeting|q[1-4]|on signe|c'est bon|on y va|feu vert|valid(?:é|ée|és|ées|er)|je valide|(?:je|on|nous) (?:doi[st]|devons) (?:valider|en (?:parler|discuter))|trop ch(?:er|ère)|hors budget|pas (?:pour nous|le bon moment)|on passe|on abandonne|prochaine étape|on se recale|la semaine prochaine)(?![\p{L}\p{N}])/iu;

/**
 * Excerpt that WINDOWS on the buyer's decision instead of blindly taking the
 * head. `activityExcerpt` (head-only) silently loses a "go" / objection buried
 * after a paragraph of pleasantries — the exact 30%-of-context gap Claap's pitch
 * names. This finds the earliest decision cue and centres the capped window on
 * it; with no cue (or a cue already inside the head window) it degrades to the
 * plain head, so the common case is byte-identical to `activityExcerpt`.
 *
 * Callers fetch a larger `left(rawContent, N)` (N≈2000) so a mid-thread cue is
 * actually in range; a cue past N is still out of reach (bounded, documented).
 */
export function decisionAwareExcerpt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return null;

  // m.index, NOT s.indexOf(m[0]): an EARLIER word can contain the matched text
  // as a substring ("concerning" ⊃ "concern") and indexOf would anchor the
  // window there, off the actual cue (2026-07-02 audit finding).
  const m = s.match(DECISION_CUE_RE);
  const idx = m?.index ?? -1;

  // No cue, or the cue already sits inside the head window → plain head cap
  // (identical to activityExcerpt, so head-positioned signals are unchanged).
  if (idx < 0 || idx <= ACTIVITY_EXCERPT_MAX - 24) {
    return s.length > ACTIVITY_EXCERPT_MAX
      ? s.slice(0, ACTIVITY_EXCERPT_MAX) + "…"
      : s;
  }

  // Buried cue → centre the window on it, with a little lead-in context.
  const start = Math.max(0, idx - 24);
  const end = Math.min(s.length, start + ACTIVITY_EXCERPT_MAX);
  const body = s.slice(start, end);
  return `${start > 0 ? "…" : ""}${body}${end < s.length ? "…" : ""}`;
}
