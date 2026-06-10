/**
 * Permission-based call scripts, keyed by sector. Martin's methodology
 * (locked 2026-06-08): the cold call is short (2-3 min) and its only job is
 * to earn a YES to a ~45-min deep-dive. Flow:
 *   1. Opener = a real permission gate: "Bonjour {name}, [rep], co-fondateur
 *      de Pilae. Vous avez 2 min ?" — no pitch, no listed problems.
 *   2. On "oui", present ONE sector enjeu at a time as a hypothesis and let
 *      the prospect validate it ("est-ce un sujet chez vous ?"). Iterate up
 *      to 3 until one lands; stop at the first that lands and react to it.
 *   3. Validate 2-3 qualifying points (light, in `guidance`).
 *   4. Propose the meeting with day/time options.
 * Talk to decision-makers first; being redirected to the métier/IT teams is
 * a win (ask for the intro), not a failure.
 *
 * Content is prospect-facing → French (Suisse romande; English for the
 * international Geneva federations). These are EDITABLE defaults — the rep
 * name in the opener and the per-sector wording are the founder's to refine,
 * and the tenant layer (`tenant-script.ts`) regenerates them from the
 * tenant's product + ICP via LLM. Kept pure so it unit-tests + renders
 * without I/O.
 */

export interface CallScript {
  /** Catalog key this script matched (or "generic"). */
  key: string;
  /** 1-3 sector enjeux the prospect validates ONE AT A TIME. */
  problems: string[];
  /** 2-3 quick points to validate (light qualification, not discovery). */
  qualifiers: string[];
  /** Optional sector-specific reminder appended to in-call guidance. */
  note?: string;
  /** The ~45-min deep-dive ask, fired once an enjeu lands. */
  bookingAsk: string;
}

export interface ResolvedScript extends CallScript {
  sectorLabel: string;
  geoLabel: string;
  /** The permission-based opener, {name} interpolated. */
  opener: string;
  /** The validation question asked after each enjeu. */
  permissionCheck: string;
  /** In-call guidance (not read aloud): principles + qualifiers + "non" branch. */
  guidance: string[];
}

/**
 * Editable default opener template. Permission gate only — no listed problems.
 * {name} is interpolated at render; the rep name ("Martin Paviot") is editable.
 */
export const DEFAULT_OPENER =
  "Bonjour {name}, Martin Paviot, co-fondateur de Pilae. Est-ce que vous avez deux minutes ?";

/** Asked after EACH enjeu hypothesis (one at a time), not after a list. */
export const PERMISSION_CHECK =
  "Est-ce que c'est un sujet chez vous en ce moment ?";

export const BOOKING_ASK =
  "Très bien. Honnêtement, dans ce cas je pense qu'on a intérêt à se rencontrer : je viendrais avec une première lecture de ce que vous pourriez remplacer et l'écart de coût, et on aurait le temps d'approfondir — comptez 45 minutes. Vous seriez disponible plutôt en début ou en fin de semaine prochaine ? Rien à préparer de votre côté.";

/** Read-aloud response when the prospect says no — natural, autonomy-first
 * (acknowledge, one calibrated question, graceful exit), never a pushy rebuttal.
 * Persisted inside `guidance` (tagged) so it survives without a schema change. */
export const DEFAULT_NO_RESPONSE =
  "Aucun souci, c'est vous qui voyez. Juste pour comprendre — c'est le timing, ou le sujet ne vous parle pas du tout ? Si c'est le timing, je vous recontacte dans quelques mois ; sinon je ne vous embête pas, et merci d'avoir pris l'appel.";

/** Marker prefixing the "no" response inside the guidance array. */
export const NO_RESPONSE_TAG = "[NON]";

/** Global, permission-based in-call principles (per-sector qualifiers + the
 * "non" branch are composed in on top — see composeGuidance). */
export const GUIDANCE = [
  "Appel court (2-3 min) : le seul objectif est un OUI pour un rendez-vous d'approfondissement (~45 min).",
  "Permission-based : « vous avez 2 min ? », puis un enjeu à la fois — on ne pitche pas, on ne liste pas les problèmes.",
  "Présenter les enjeux UN PAR UN comme une hypothèse à valider ; s'arrêter au premier qui fait mouche et y rester (réagir, pas cocher une case).",
  "Décideur d'abord — s'il redirige vers l'IT ou le métier, c'est gagné (demander l'intro).",
  "Ne jamais revendiquer une certification que Pilae n'a pas ; dire le vrai : hébergement Suisse/UE, réversibilité, hors Cloud Act.",
];

// Sector enjeux + qualifiers. Keys are matched against the company's
// sector/industry string (accent/case-insensitive substring). Defaults for
// the Pilae ICP (romand mid-orgs: fondations / santé / parapublic / low-tech,
// trigger = SaaS remplaçable ; offre = open-source opéré, souverain, moins cher).
//
// {tool} convention: ONE enjeu per sector carries the {tool} placeholder. At
// display time (planProblems) it is interpolated with the prospect's detected
// REPLACEABLE tool and floated first ("Détecté chez eux") — or hidden entirely
// when no tool is detected, so a raw placeholder is never read aloud.
const SECTOR_SCRIPTS: Array<{
  key: string;
  match: string[];
  problems: string[];
  qualifiers: string[];
  note?: string;
}> = [
  {
    key: "fondations",
    match: ["fondation", "foundation", "association", "ong", "non-profit", "nonprofit", "philanthrop", "federation", "fédération"],
    problems: [
      "le budget logiciels rogne sur des moyens qui devraient aller à la mission",
      "vos données donateurs ou bénéficiaires vivent sur des outils américains dont vous ne maîtrisez pas l'hébergement",
      "des abonnements comme {tool}, accumulés au fil du temps, qu'on pourrait remplacer à l'identique pour bien moins cher",
    ],
    qualifiers: [
      "combien d'outils en abonnement aujourd'hui ?",
      "qui gère l'IT (interne, prestataire, ou personne) ?",
      "une échéance de contrat bientôt ?",
    ],
    note: "Fédération internationale / Genève : faire l'appel en anglais si l'interlocuteur est anglophone. Fondation donatrice : insister sur la confidentialité des données donateurs.",
  },
  {
    key: "sante",
    match: ["sant", "health", "medical", "médic", "clinique", "hopital", "hôpital", "ems", "soin"],
    problems: [
      "vos données résidents ou patients transitent par des outils du quotidien hébergés aux États-Unis, au moment où la nLPD se durcit",
      "vous payez {tool} et d'autres logiciels dont la facture grimpe à chaque renouvellement",
      "peu de ressources internes pour remplacer un outil vieillissant sans risquer de tout casser",
    ],
    qualifiers: [
      "géré en interne ou par un prestataire IT ?",
      "un budget logiciels annuel qui compte ?",
      "des données sensibles (résidents/patients) dessus ?",
    ],
    note: "Honnêteté : « conforme » ≠ « souverain » (Cloud Act), ne pas dramatiser. S'ils sont déjà hébergés en Suisse en propre, le reconnaître et lâcher.",
  },
  {
    key: "parapublic",
    match: ["parapublic", "public", "administration", "commune", "canton", "collectivit", "état", "etat"],
    problems: [
      "des systèmes comme {tool}, coûteux à maintenir et difficiles à faire évoluer",
      "des données publiques ou citoyens hébergées hors de Suisse, alors que la pression à la souveraineté monte",
      "une pression à digitaliser sans équipe projet dédiée en interne",
    ],
    qualifiers: [
      "géré en interne ou par un prestataire ?",
      "un budget logiciels / licences annuel qui compte ?",
      "des contraintes de souveraineté ou de marchés publics ?",
    ],
  },
  {
    key: "low-tech",
    match: ["industrie", "manufact", "construction", "btp", "logistique", "négoce", "negoce", "retail", "commerce"],
    problems: [
      "un outil comme {tool} en place, qui ne suit plus vos besoins mais que c'est lourd de remplacer",
      "des données dispersées entre plusieurs outils qui ne se parlent pas",
      "une facture logicielle qui grimpe à chaque renouvellement sans que personne ne pilote",
    ],
    qualifiers: [
      "combien d'outils en abonnement ?",
      "qui gère l'IT en interne ?",
      "une échéance de contrat proche ?",
    ],
  },
];

export const GENERIC_PROBLEMS = [
  "des outils comme {tool} en place, qui ne suivent plus vos besoins mais qu'il est lourd de remplacer",
  "des données et processus éclatés entre plusieurs systèmes qui ne communiquent pas",
  "une facture logicielle qui grimpe à chaque renouvellement",
];

const GENERIC_QUALIFIERS = [
  "combien d'outils en abonnement ?",
  "qui gère l'IT ?",
  "un budget logiciels annuel qui compte ?",
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Compose the in-call guidance: global principles + this sector's qualifiers
 * + the "non" branch for the 2-min ask + any sector note. */
function composeGuidance(base: CallScript): string[] {
  return [
    `${NO_RESPONSE_TAG} ${DEFAULT_NO_RESPONSE}`,
    ...GUIDANCE,
    `À qualifier (2-3 points) : ${base.qualifiers.join(" · ")}.`,
    ...(base.note ? [base.note] : []),
  ];
}

/** Split persisted guidance into the read-aloud "no" response (the tagged
 * entry) and the rest (in-call tips), so the cockpit can surface a dedicated
 * "Si le prospect dit non" block without a dedicated DB column. */
export function splitGuidance(guidance: string[]): { noResponse: string; tips: string[] } {
  const idx = guidance.findIndex((g) => g.startsWith(NO_RESPONSE_TAG));
  if (idx === -1) return { noResponse: "", tips: guidance };
  return {
    noResponse: guidance[idx].slice(NO_RESPONSE_TAG.length).trim(),
    tips: guidance.filter((_, i) => i !== idx),
  };
}

/** Re-encode an edited "no" response into the guidance array (tagged, first),
 * preserving the other tips. Empty input drops the tagged entry. */
export function withNoResponse(tips: string[], noResponse: string): string[] {
  const clean = tips.filter((g) => !g.startsWith(NO_RESPONSE_TAG));
  return noResponse.trim() ? [`${NO_RESPONSE_TAG} ${noResponse.trim()}`, ...clean] : clean;
}

/** Pick the best script for a company's sector. Substring match on the
 * sector/industry label; falls back to a generic permission script. */
export function pickCallScript(sector: string | null | undefined): CallScript {
  const s = norm(sector ?? "");
  if (s) {
    for (const entry of SECTOR_SCRIPTS) {
      if (entry.match.some((m) => s.includes(norm(m)))) {
        return {
          key: entry.key,
          problems: entry.problems,
          qualifiers: entry.qualifiers,
          note: entry.note,
          bookingAsk: BOOKING_ASK,
        };
      }
    }
  }
  return { key: "generic", problems: GENERIC_PROBLEMS, qualifiers: GENERIC_QUALIFIERS, bookingAsk: BOOKING_ASK };
}

/** Resolve a script for a live call: build the permission-based opener (name
 * interpolated) + the per-enjeu validation question + composed guidance. */
export function resolveCallScript(input: {
  sector?: string | null;
  geo?: string | null;
  contactName?: string | null;
}): ResolvedScript {
  const base = pickCallScript(input.sector);
  const sectorLabel = (input.sector ?? "votre secteur").trim() || "votre secteur";
  const geoLabel = (input.geo ?? "votre région").trim() || "votre région";
  const opener = interpolateOpener(DEFAULT_OPENER, {
    name: input.contactName,
    sector: input.sector,
    geo: input.geo,
  });
  return {
    ...base,
    sectorLabel,
    geoLabel,
    opener,
    permissionCheck: PERMISSION_CHECK,
    guidance: composeGuidance(base),
  };
}

/** The editable fields of a script (what's persisted + edited by the rep). */
export interface ScriptFields {
  opener: string;
  problems: string[];
  permissionCheck: string;
  bookingAsk: string;
  guidance: string[];
}

/** Default editable script fields, seeded with the best sector match. */
export function defaultScriptFields(sector?: string | null): ScriptFields {
  const base = pickCallScript(sector);
  return {
    opener: DEFAULT_OPENER,
    problems: base.problems,
    permissionCheck: PERMISSION_CHECK,
    bookingAsk: base.bookingAsk,
    guidance: composeGuidance(base),
  };
}

/** Interpolate {name}/{sector}/{geo} into an opener template (collapsing the
 * gaps left by empty values), so an edited template renders cleanly per call. */
export function interpolateOpener(
  template: string,
  vars: { name?: string | null; sector?: string | null; geo?: string | null },
): string {
  return template
    .replace(/\{name\}/g, (vars.name ?? "").trim())
    .replace(/\{sector\}/g, (vars.sector ?? "").trim() || "votre secteur")
    .replace(/\{geo\}/g, (vars.geo ?? "").trim() || "votre région")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/^Bonjour\s*,/, "Bonjour,")
    .trim();
}
