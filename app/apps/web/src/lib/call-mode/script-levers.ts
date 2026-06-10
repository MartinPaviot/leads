/**
 * Methodology guard for the EDITED call script — the engine's lever
 * validators (R4 of _specs/call-script-living) adapted to the live, editable
 * `ScriptFields`. A rep who edits their script can silently reintroduce the
 * patterns the methodology bans (the "mauvais moment ?" opener kills ~40% of
 * meetings per Gong; a deferred slot ask loses to a guided binary one). This
 * checks the script and returns soft, SAYABLE gaps the panel surfaces as
 * "Méthode" markers — never blocking, always explaining why.
 *
 * Pure + unit-tested; FR-first detectors (the prospect-facing language), the
 * same patterns the future transcript scorer reuses so coaching and scoring
 * cannot drift.
 */

import { splitGuidance, type ScriptFields } from "./call-scripts";
import { TOOL_PLACEHOLDER } from "./match-problem";

export type MethodGapId =
  | "opener_banned"
  | "opener_pitches"
  | "no_problems"
  | "ask_no_binary_slot"
  | "ask_no_derisk"
  | "ask_defers"
  | "no_response_missing";

export interface MethodGap {
  id: MethodGapId;
  /** Short label shown on the marker. */
  label: string;
  /** One-line why/fix, in the founder's voice — factual, no hype. */
  hint: string;
}

// The single worst opener (-40% on meetings, Gong) + small-talk openers.
export const BANNED_OPENER =
  /(mauvais moment|comment allez-vous|comment vous allez|je vous d[ée]range|how are you|bad time|caught you at a bad)/i;

// Deferring the slot instead of guiding it (JOLT: guidance > defer). The
// "quand" is required on the inverted spoken forms ("dites-moi quand vous
// seriez disponible") so a GUIDED binary ask ("Vous seriez disponible plutôt
// mardi ou jeudi ?") never false-positives.
export const DEFER =
  /(quand seriez-vous|quand seriez vous|quand (est-ce que )?vous (seriez|serez|êtes|etes) dispo|dites-moi quand|quelles sont vos dispo|vos disponibilit|envoyez-moi vos dispo|vous me direz vos dispo|[àa] quel moment vous arrange|when works for you|let me know your availability)/i;

// A concrete time anchor — needed for a guided binary slot ("mardi 14h ou jeudi ?").
export const TIME_WORD =
  /(lundi|mardi|mercredi|jeudi|vendredi|matin|apr[èe]s-?midi|d[ée]but de semaine|fin de semaine|semaine prochaine|\b\d{1,2}\s?h\b|\bnext week\b)/i;

// De-risk / reversibility markers (JOLT: take risk off the table).
export const DERISK =
  /(m[êe]me si|sans engagement|rien [àa] pr[ée]parer|vous saurez|c'est vous qui voyez|repartez avec|premi[èe]re lecture|[ée]cart de co[ûu]t|10\s?min|dix minutes|r[ée]versible|no strings)/i;

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();
}

/** Check the rep's script against the methodology levers. Empty = compliant. */
export function checkScriptMethod(fields: ScriptFields): MethodGap[] {
  const gaps: MethodGap[] = [];
  const opener = fields.opener ?? "";
  const problems = (fields.problems ?? []).map((p) => p.trim()).filter(Boolean);
  const ask = fields.bookingAsk ?? "";

  if (BANNED_OPENER.test(opener)) {
    gaps.push({
      id: "opener_banned",
      label: "Accroche à risque",
      hint: "« mauvais moment ? » / « je vous dérange ? » est le pire opener mesuré (~2% de RDV). Garder la permission simple : « vous avez deux minutes ? ».",
    });
  }

  // The opener must stay a permission gate — the enjeux come later, one at a
  // time. Compare normalized, with the {tool} placeholder stripped so a
  // template enjeu still matches if pasted into the opener.
  const o = norm(opener);
  const pitched = problems.some((p) => {
    const frag = norm(p.split(TOOL_PLACEHOLDER).join(" "));
    return frag.length >= 12 && o.includes(frag);
  });
  if (pitched) {
    gaps.push({
      id: "opener_pitches",
      label: "L'accroche pitche",
      hint: "Un enjeu est déjà dans l'accroche. L'accroche reste une porte (permission) ; les enjeux se posent ensuite, un par un.",
    });
  }

  if (problems.length === 0) {
    gaps.push({
      id: "no_problems",
      label: "Aucun enjeu",
      hint: "Sans enjeu à valider, l'appel n'a pas de cœur. Ajouter au moins un enjeu concret pour ce segment.",
    });
  }

  const hasBinary = TIME_WORD.test(ask) && /\bou\b|\bor\b/i.test(ask);
  if (!hasBinary) {
    gaps.push({
      id: "ask_no_binary_slot",
      label: "Pas de créneau guidé",
      hint: "Proposer un choix binaire (« mardi 14h ou jeudi matin ? ») convertit mieux qu'une demande ouverte.",
    });
  } else if (DEFER.test(ask)) {
    gaps.push({
      id: "ask_defers",
      label: "La demande défère",
      hint: "« quand seriez-vous disponible ? » rend le contrôle au prospect. Guider le créneau, lui laisser le choix entre deux.",
    });
  }

  if (!DERISK.test(ask)) {
    gaps.push({
      id: "ask_no_derisk",
      label: "RDV non dé-risqué",
      hint: "Ajouter une clause de réversibilité (« rien à préparer », « vous repartez avec… même sans suite ») : c'est ce qui fait dire oui.",
    });
  }

  if (!splitGuidance(fields.guidance ?? []).noResponse.trim()) {
    gaps.push({
      id: "no_response_missing",
      label: "Pas de réponse au « non »",
      hint: "Préparer la sortie élégante : accuser réception, une question calibrée, et laisser la porte ouverte.",
    });
  }

  return gaps;
}
