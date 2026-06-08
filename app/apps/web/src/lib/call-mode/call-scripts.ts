/**
 * Permission-based call scripts, keyed by {sector × geography} (later
 * industry × persona). Martin's methodology: the cold call is short
 * (7-8 min) and its only job is to earn a YES to a 45-min deep-dive. The
 * opener names 1-3 sector/geo problems the prospect can validate ("ça
 * résonne ?") — a reason to call, not a pitch — then asks for the meeting.
 * Talk to decision-makers first; being redirected to the métier teams is
 * a win, not a failure.
 *
 * Content is prospect-facing → French (Suisse romande). These are
 * EDITABLE defaults; the real per-sector×persona wording is the founder's
 * to refine, and a later version pulls problems from the tenant's product
 * / knowledge base + LLM. Kept pure so it unit-tests + renders without I/O.
 */

export interface CallScript {
  /** Catalog key this script matched (or "generic"). */
  key: string;
  /** 1-3 sector/geo problems the prospect validates. */
  problems: string[];
  /** The 45-min deep-dive ask, fired once the prospect validates. */
  bookingAsk: string;
}

export interface ResolvedScript extends CallScript {
  sectorLabel: string;
  geoLabel: string;
  /** The permission-based opener, geo/sector/contact interpolated. */
  opener: string;
  /** The validation question after the problems. */
  permissionCheck: string;
  /** In-call guidance (not read aloud). */
  guidance: string[];
}

const BOOKING_ASK =
  "Parfait. Dans ce cas, je propose qu'on bloque 45 min ensemble pour creuser ça concrètement — je vous montrerai même ce qu'on peut mettre en place. Vous préférez début ou fin de semaine prochaine ?";

const GUIDANCE = [
  "Appel court (7-8 min) : le seul objectif est un OUI pour les 45 min.",
  "Permission-based : on a une raison d'appeler, on ne pitche pas.",
  "Décideur d'abord — s'il redirige vers une équipe métier, c'est gagné (demander l'intro).",
  "Cocher les problématiques qui résonnent au fil de l'échange.",
];

// Sector problem-sets. Keys are matched against the company's
// sector/industry string (accent/case-insensitive substring). Defaults
// for the Pilae ICP (romand mid-orgs, low-tech / fondations / santé /
// parapublic, trigger = SaaS remplaçable / digitalisation).
const SECTOR_SCRIPTS: Array<{ key: string; match: string[]; problems: string[] }> = [
  {
    key: "fondations",
    match: ["fondation", "foundation", "association", "ong", "non-profit", "nonprofit"],
    problems: [
      "des outils de gestion (dons, membres, projets) éclatés et souvent encore sur Excel",
      "un reporting aux donateurs / au conseil qui prend un temps fou à consolider",
      "des solutions en place vieillissantes que personne n'ose remplacer faute de temps IT",
    ],
  },
  {
    key: "sante",
    match: ["sant", "health", "medical", "médic", "clinique", "hopital", "hôpital", "ems", "soin"],
    problems: [
      "des logiciels métier anciens, mal interconnectés, qui forcent de la double saisie",
      "des contraintes de conformité / protection des données difficiles à tenir avec l'existant",
      "peu de ressources internes pour piloter un remplacement d'outil sans tout casser",
    ],
  },
  {
    key: "parapublic",
    match: ["parapublic", "public", "administration", "commune", "canton", "collectivit", "état", "etat"],
    problems: [
      "des systèmes hérités coûteux à maintenir et difficiles à faire évoluer",
      "des processus encore très manuels entre services qui ralentissent les délais",
      "une pression à digitaliser sans équipe projet dédiée en interne",
    ],
  },
  {
    key: "low-tech",
    match: ["industrie", "manufact", "construction", "btp", "logistique", "négoce", "negoce", "retail", "commerce"],
    problems: [
      "un SaaS / ERP en place qui ne suit plus vos besoins mais que c'est lourd de remplacer",
      "des données dispersées entre plusieurs outils qui ne se parlent pas",
      "des tâches répétitives qui mobilisent vos équipes au lieu de la valeur ajoutée",
    ],
  },
];

const GENERIC_PROBLEMS = [
  "des outils logiciels en place qui ne suivent plus vos besoins, mais qu'il est lourd de remplacer",
  "des données et processus éclatés entre plusieurs systèmes qui ne communiquent pas",
  "peu de ressources internes pour mener un changement d'outil sans perturber l'activité",
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Pick the best script for a company's sector. Substring match on the
 * sector/industry label; falls back to a generic permission script. */
export function pickCallScript(sector: string | null | undefined): CallScript {
  const s = norm(sector ?? "");
  if (s) {
    for (const entry of SECTOR_SCRIPTS) {
      if (entry.match.some((m) => s.includes(norm(m)))) {
        return { key: entry.key, problems: entry.problems, bookingAsk: BOOKING_ASK };
      }
    }
  }
  return { key: "generic", problems: GENERIC_PROBLEMS, bookingAsk: BOOKING_ASK };
}

/** Resolve a script for a live call: interpolate geo/sector/contact and
 * build the opener + validation question. */
export function resolveCallScript(input: {
  sector?: string | null;
  geo?: string | null;
  contactName?: string | null;
}): ResolvedScript {
  const base = pickCallScript(input.sector);
  const sectorLabel = (input.sector ?? "votre secteur").trim() || "votre secteur";
  const geoLabel = (input.geo ?? "votre région").trim() || "votre région";
  const hi = input.contactName ? `Bonjour ${input.contactName}, ` : "Bonjour, ";
  const opener =
    `${hi}je me permets de vous appeler car en travaillant avec des organisations ` +
    `de ${sectorLabel} en ${geoLabel}, on a identifié trois points qui reviennent souvent : ` +
    base.problems.map((p, i) => `(${i + 1}) ${p}`).join(" ; ") +
    ".";
  return {
    ...base,
    sectorLabel,
    geoLabel,
    opener,
    permissionCheck:
      "Est-ce que l'un de ces points résonne avec votre situation aujourd'hui ?",
    guidance: GUIDANCE,
  };
}
