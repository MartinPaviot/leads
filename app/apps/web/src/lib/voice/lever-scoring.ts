/**
 * Deterministic post-call lever scoring — Étape C of the engine completion.
 *
 * Scores HOW the rep executed the methodology on a real transcript, using the
 * SAME regexes that guard the edited script (lib/call-mode/script-levers.ts)
 * so coaching and scoring cannot drift. Deterministic only — no LLM, no
 * inference: a lever is true because the words were said, false because they
 * weren't. The semantic levers (exactly-one-problem painted, objection
 * aikido quality) need a constrained judge and stay out of this pass.
 *
 * Closing the loop with #124: scriptContext says what the panel SHOWED at
 * dial; this says what the rep actually SAID; the disposition says what it
 * yielded. Pure + client-safe — the ended-call view computes it instantly
 * from the in-memory chunks, and the post-process worker persists the same
 * result to calls.lever_scores.
 */

import { BANNED_OPENER, DEFER, TIME_WORD, DERISK } from "@/lib/call-mode/script-levers";

export interface ScoredChunk {
  speaker?: "agent" | "prospect" | string;
  text: string;
}

export type LeverDrillId =
  | "banned_opener"
  | "opener_permission"
  | "reason_stated"
  | "ask_derisked"
  | "binary_slot"
  | "defer_used"
  | "talk_ratio";

export interface LeverScores {
  /** Agent share of spoken characters, 0-100 (proxy for talk time). */
  talkRatioPct: number;
  /** Banned opener pattern said early ("je vous dérange ?"…) — bad. */
  bannedOpener: boolean;
  /** A permission ask was voiced early ("vous avez deux minutes ?"). */
  openerPermission: boolean;
  /** The reason-to-call bridge was voiced early ("c'est pour ça que je vous appelle"). */
  reasonStated: boolean;
  /** A de-risk clause was voiced ("rien à préparer", "même si…"). */
  askDerisked: boolean;
  /** A guided binary slot was offered ("mardi 14h ou jeudi ?"). */
  binarySlot: boolean;
  /** A deferring ask was voiced ("quand seriez-vous disponible ?") — bad. */
  deferUsed: boolean;
  /** The ONE lever to work next (priority-ordered), or null when clean. */
  drill: LeverDrillId | null;
}

/** Voiced permission ask (the gate itself, not the template check). */
const PERMISSION_ASK =
  /(deux minutes|2 min|trente secondes|30 secondes|vous avez .{0,16}minutes?|deux petites minutes)/i;

/** Voiced reason-to-call bridge (the default REASON_BRIDGE wording + variants). */
const REASON_SAID =
  /(pour ça que je vous appelle|pour ça que j'appelle|la raison de mon appel|je vous appelle parce que)/i;

/** Methodology target band for the agent talk share on a COLD CALL (~55%). */
export const TALK_RATIO_BAND: [number, number] = [40, 70];

const EARLY_AGENT_CHUNKS = 4;

/**
 * Score a finished call's transcript. Returns null when the transcript is too
 * thin to judge (voicemail, instant hangup, agent-only) — thin data must not
 * produce a verdict.
 */
export function scoreTranscriptLevers(chunks: ScoredChunk[]): LeverScores | null {
  const agent = chunks.filter((c) => c.speaker === "agent" && c.text?.trim());
  const prospect = chunks.filter((c) => c.speaker === "prospect" && c.text?.trim());
  if (agent.length < 2 || prospect.length < 1) return null;

  const agentChars = agent.reduce((a, c) => a + c.text.length, 0);
  const prospectChars = prospect.reduce((a, c) => a + c.text.length, 0);
  const total = agentChars + prospectChars;
  if (total < 120) return null;

  const early = agent.slice(0, EARLY_AGENT_CHUNKS).map((c) => c.text).join(" ");
  const all = agent.map((c) => c.text).join(" ");

  const scores: Omit<LeverScores, "drill"> = {
    talkRatioPct: Math.round((agentChars / total) * 100),
    bannedOpener: BANNED_OPENER.test(early),
    openerPermission: PERMISSION_ASK.test(early),
    reasonStated: REASON_SAID.test(early),
    askDerisked: DERISK.test(all),
    binarySlot: TIME_WORD.test(all) && /\bou\b|\bor\b/i.test(all),
    deferUsed: DEFER.test(all),
  };

  return { ...scores, drill: pickDrill(scores) };
}

/** The single most damaging miss, in methodology priority order. */
function pickDrill(s: Omit<LeverScores, "drill">): LeverDrillId | null {
  if (s.bannedOpener) return "banned_opener";
  if (!s.openerPermission) return "opener_permission";
  if (!s.reasonStated) return "reason_stated";
  if (!s.askDerisked) return "ask_derisked";
  if (!s.binarySlot) return "binary_slot";
  if (s.deferUsed) return "defer_used";
  if (s.talkRatioPct < TALK_RATIO_BAND[0] || s.talkRatioPct > TALK_RATIO_BAND[1]) return "talk_ratio";
  return null;
}

/** FR labels + one-line drills for the ended-call strip. */
export const DRILL_COPY: Record<LeverDrillId, { label: string; hint: string }> = {
  banned_opener: {
    label: "Accroche à risque",
    hint: "« mauvais moment / je vous dérange » a été dit — c'est l'opener le moins performant mesuré. Garder la permission simple.",
  },
  opener_permission: {
    label: "Permission non posée",
    hint: "La porte d'entrée (« vous avez deux minutes ? ») n'a pas été entendue en début d'appel.",
  },
  reason_stated: {
    label: "Raison non énoncée",
    hint: "Dire la raison de l'appel juste après la permission (~x2 sur le RDV) — elle n'a pas été entendue.",
  },
  ask_derisked: {
    label: "RDV non dé-risqué",
    hint: "Aucune clause de réversibilité entendue (« rien à préparer », « même si on ne bosse jamais ensemble »).",
  },
  binary_slot: {
    label: "Pas de créneau guidé",
    hint: "Proposer deux créneaux précis (« mardi 14h ou jeudi matin ? ») plutôt qu'une demande ouverte.",
  },
  defer_used: {
    label: "Créneau déféré",
    hint: "« quand seriez-vous disponible ? » a été dit — guider le choix entre deux créneaux.",
  },
  talk_ratio: {
    label: "Équilibre de parole",
    hint: "Sur un cold call réussi le rep parle ~55%. Hors de la bande 40-70%, l'appel penche (monologue ou interrogatoire).",
  },
};
