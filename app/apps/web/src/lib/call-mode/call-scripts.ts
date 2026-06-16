/**
 * Permission-based call scripts, keyed by sector — Douablin-faithful flow,
 * adapted to Martin's intent (no phone discovery; the call's only job is to
 * book the meeting). FINAL model (validated on paper before shipping):
 *   1. Opener = minimal identity ("une startup lausannoise") + the PROSPECT'S
 *      SECTOR tied to our subject ({line}) + a permission ask ("ça vous
 *      convient ?"). No self-pitch, never tell the buyer he overpays.
 *   2. After the OK, a half-sentence bascule (IA interne / automatisations open
 *      source, hébergées en Suisse, à l'usage), then ONE enjeu at a time in
 *      RÉCIT-PAIR (a quoted peer voice, never frontal) followed by a two-door
 *      validation — stop at the first that lands. Two variants by maturity:
 *      "terrain" (IA par la bande / licences pour tous / données hors-CH) and
 *      "orga mûre" (retard IA / facture SaaS / souveraineté).
 *   3. As soon as one lands, propose the ~45 min-1h video meeting with two
 *      concrete time windows.
 * Talk to decision-makers first; being redirected to the métier/IT teams is a
 * win (ask for the intro), not a failure.
 *
 * Content is prospect-facing → French (Suisse romande; English for the
 * international Geneva federations). These are EDITABLE defaults — the tenant
 * layer (`tenant-script.ts`) regenerates them from the tenant's product + ICP
 * via LLM. Kept pure so it unit-tests + renders without I/O.
 */

export interface CallScript {
  /** Catalog key this script matched (or "generic"). */
  key: string;
  /** Maturity segment driving the enjeu variant. */
  segment: "terrain" | "mure";
  /** The 3 core enjeux, validated ONE AT A TIME (récit-pair + two-door, baked
   *  into each string so the validation travels with the enjeu). */
  problems: string[];
  /** 2-3 quick points to validate (light qualification, in guidance). */
  qualifiers: string[];
  /** Sector ↔ subject line for the opener ("Je me concentre en ce moment sur …"). */
  line: string;
  /** Optional sector-specific reminder appended to in-call guidance. */
  note?: string;
  /** The ~45 min-1h video deep-dive ask, fired once an enjeu lands. */
  bookingAsk: string;
}

export interface ResolvedScript extends CallScript {
  sectorLabel: string;
  geoLabel: string;
  /** Identity + sector↔subject + permission opener, {name}/{line} interpolated. */
  opener: string;
  /** The half-sentence bascule said right after the OK (shown above the enjeux). */
  peerLead: string;
  /** Kept for shape compatibility; the validation now travels inside each enjeu
   *  (two-door), so this is empty by default. */
  permissionCheck: string;
  /** In-call guidance (not read aloud): principles + qualifiers + "non" branch. */
  guidance: string[];
}

/**
 * Editable default opener — minimal identity + {line} (the prospect's sector
 * tied to our subject) + permission. {name}/{line} interpolate per call; a
 * tokenless saved opener simply renders as-is (regenerate to pick the slots up).
 */
export const DEFAULT_OPENER =
  "Bonjour {name}, Martin Paviot, cofondateur de Pilae, une startup lausannoise. Je me concentre en ce moment sur {line} Je vous appelle pas pour vous dérouler un pitch, juste voir en deux minutes si c'est un sujet chez vous. Ça vous convient ?";

/** The half-sentence said right after the OK (the bascule), then the rule:
 *  one enjeu at a time, stop at the first that lands. Shown above the enjeux. */
export const BASCULE =
  "Si oui — en deux mots : on installe une IA interne ou des automatisations en open source, hébergées en Suisse, facturées à l'usage, pas une licence par tête. Puis un seul sujet à la fois, on s'arrête au premier qui vous parle :";

/** No separate validation line — each enjeu carries its own two-door check. */
export const PERMISSION_CHECK = "";

/** Generic sector↔subject line (after "Je me concentre en ce moment sur …"). */
export const GENERIC_LINE =
  "les entreprises romandes de votre secteur : l'IA en interne et l'automatisation, sans dépendre des outils américains et en gardant la main sur les coûts.";

/** Return the sector↔subject line for the opener (no tool sharpening — the
 *  opener stays pure; tool detection only floats the matched enjeu, downstream). */
export function lineFor(sector?: string | null): string {
  return pickCallScript(sector).line;
}

// ── The enjeux, by maturity segment (récit-pair quote → two-door validation).
//    Shared across sectors of the same segment so they read as a real peer
//    voice, not a per-sector rewrite. NO {tool} placeholder: the 3 angles
//    always show; the detected tool only floats the matched one (planProblems).

/** "orga mûre" — IT, conseil, recherche, enseignement sup, international. */
export const ENJEUX_MURE = [
  `« Beaucoup nous disent : "On sait que l'IA va compter, on en parle en comité depuis un moment… mais entre les POC qui ne passent jamais en prod et le flou sur par où commencer, on a l'impression de prendre du retard pendant que d'autres avancent." »  →  « Vous êtes plutôt dans cette situation, ou vous avez déjà des projets IA en production ? »`,
  `« On entend aussi : "à chaque renouvellement les licences SaaS augmentent, on empile les outils américains, et le jour où on veut faire de l'IA dessus les coûts explosent — sans qu'on ait la main." »  →  « Sur vos postes logiciels, vous maîtrisez la trajectoire de coût, ou ça vous échappe un peu ? »`,
  `« Et de plus en plus : "nos données, nos modèles tournent chez des hyperscalers hors de Suisse — entre la conformité, les clients qui posent la question et le géopolitique, on se demande où sont vraiment nos données et qui peut y accéder." »  →  « C'est déjà remonté chez vous — un client, un juriste, le conseil — ou pas encore ? »`,
];

/** "terrain" — fondations, santé/soin, social, parapublic/administration. */
export const ENJEUX_TERRAIN = [
  `« Beaucoup nous disent : "nos équipes se sont mises à ChatGPT chacun dans son coin — courriers, comptes-rendus, demandes — et personne n'a vraiment posé de cadre sur ce qui sort." »  →  « Chez vous, c'est déjà le cas, ou vos équipes n'y sont pas encore ? »`,
  `« On entend aussi : "on paie une licence Microsoft pour chaque collaborateur — y compris ceux qui, sur le terrain, n'ouvrent presque jamais un ordinateur — et à chaque renouvellement ça monte, sans qu'on ait la main." »  →  « Sur vos licences, vous maîtrisez la trajectoire, ou ça vous échappe un peu ? »`,
  `« Et de plus en plus : "nos données — donateurs, résidents, administrés — sont chez Microsoft ou Google, donc hors de Suisse ; entre la nLPD et le conseil, on se demande où elles sont vraiment et qui peut y accéder." »  →  « C'est déjà remonté chez vous — conseil, juriste, protection des données — ou pas encore ? »`,
];

const enjeuxFor = (segment: "terrain" | "mure"): string[] =>
  segment === "terrain" ? [...ENJEUX_TERRAIN] : [...ENJEUX_MURE];

/** Read-aloud response when the prospect says no — natural, autonomy-first
 *  (acknowledge, one calibrated question, graceful exit), never a pushy rebuttal.
 *  Persisted inside `guidance` (tagged) so it survives without a schema change. */
export const DEFAULT_NO_RESPONSE =
  "Aucun souci, c'est vous qui voyez. Juste pour comprendre — c'est le timing, ou ce n'est pas un sujet pour vous en ce moment ? Si c'est le timing, je vous recontacte ; sinon je ne vous embête pas, et merci d'avoir pris l'appel.";

/** Marker prefixing the "no" response inside the guidance array. */
export const NO_RESPONSE_TAG = "[NON]";

// ── Branches: what a real call needs beyond the happy path — gatekeeper,
//    voicemail, callback re-opener, and the objection playbook. Universal +
//    Pilae-tuned (sober, never argue: redirect to the booking or ask a
//    calibrated question). {name} interpolated; sector kept short on purpose.

export interface Objection {
  /** The objection, as the prospect says it. */
  cue: string;
  /** Pilae's answer — redirect to the meeting / a calibrated question. */
  response: string;
}

/** The classic cold-call objections + sober answers. Order = frequency. */
export const OBJECTIONS: Objection[] = [
  {
    cue: "Je n'ai pas le temps",
    response: "Je comprends, je fais court. En deux phrases : on installe une IA interne et des automatisations en open source, hébergées en Suisse, facturées à l'usage. Si ce n'est pas le moment, je vous bloque juste 15 min en visio la semaine prochaine — vous regardez à tête reposée.",
  },
  {
    cue: "Envoyez-moi un mail / une doc",
    response: "Je peux, mais un mail de plus se perd. 15 minutes en visio vous donnent une lecture chiffrée sur votre cas, rien à préparer — plutôt lundi après-midi ou jeudi matin ?",
  },
  {
    cue: "On a déjà un outil / on est chez Microsoft",
    response: "C'est justement le bon moment : on ne remplace pas tout, on pose une IA interne et des automatisations par-dessus, en Suisse, à l'usage. Ça se voit mieux sur un cas concret — c'est l'objet de la visio.",
  },
  {
    cue: "Pas intéressé",
    response: "Aucun souci, c'est vous qui voyez. Juste pour comprendre — c'est le sujet (IA, souveraineté) qui ne parle pas, ou ce n'est pas le moment ? Si c'est le timing, je vous recontacte ; sinon je ne vous embête pas.",
  },
  {
    cue: "C'est quoi Pilae / vous faites quoi exactement ?",
    response: "On installe et on opère des outils open source — une IA interne, des automatisations — hébergés en Suisse et facturés à l'usage, pas une licence par tête. C'est pour ça que je voulais deux minutes avec vous.",
  },
  {
    cue: "C'est combien ?",
    response: "Ça dépend du périmètre, et je ne veux pas vous lancer un chiffre en l'air. Le but de la visio, c'est justement de vous donner l'écart de coût sur VOTRE situation — concret, sans engagement.",
  },
];

/** Getting past the front desk. */
export const GATEKEEPER =
  "Bonjour, Martin Paviot. Je cherche à joindre {name} — c'est au sujet de l'IA interne hébergée en Suisse qu'on opère pour des institutions romandes. Vous pouvez me le ou la passer ?";
export const GATEKEEPER_NOTE =
  "Si « c'est à quel sujet ? » : deux minutes suffisent, il/elle saura si c'est pertinent. Si « envoyez un mail » : « bien sûr — quel est le meilleur moment pour le/la joindre en direct ? »";

/** ~12 s voicemail — a reason + a callback path, no hard sell. */
export const VOICEMAIL =
  "Bonjour {name}, Martin Paviot, de Pilae à Lausanne. Je vous appelle au sujet de l'IA interne hébergée en Suisse pour votre secteur — je réessaie en fin de semaine ; au besoin, mon numéro s'affiche sur votre écran. Bonne journée.";

/** Re-opener for a scheduled callback — never a cold opener again. */
export const CALLBACK_OPENER =
  "Bonjour {name}, Martin Paviot de Pilae — on avait convenu que je vous rappelle. C'est toujours un bon moment pour les deux minutes dont on avait parlé ?";

export interface ResolvedBranches {
  gatekeeper: string;
  gatekeeperNote: string;
  voicemail: string;
  callback: string;
  objections: Objection[];
}

/** Interpolate {name} into the branch lines for the live call. */
export function resolveBranches(vars: { name?: string | null }): ResolvedBranches {
  const i = (t: string) => interpolateOpener(t, { name: vars.name });
  return {
    gatekeeper: i(GATEKEEPER),
    gatekeeperNote: GATEKEEPER_NOTE,
    voicemail: i(VOICEMAIL),
    callback: i(CALLBACK_OPENER),
    objections: OBJECTIONS,
  };
}

/** Global in-call principles — final model (sector↔subject opener, récit-pair,
 *  two-door, ton suisse). Per-sector qualifiers + the "non" branch compose on top. */
export const GUIDANCE = [
  "Appel court (2-3 min) : le seul but est un OUI pour une visio d'approfondissement (45 min-1h). Pas de découverte au téléphone.",
  "Ouvrir sur l'identité minimale (« startup lausannoise ») + le secteur du prospect relié à notre sujet, puis demander la permission (« ça vous convient ? »). Aucun pitch produit dans l'accroche.",
  "Un seul enjeu à la fois, en récit-pair (citer un pair, jamais accuser le prospect), puis valider à deux portes ; s'arrêter au premier qui fait mouche.",
  "Dès qu'un enjeu mouche, proposer la visio avec deux fenêtres horaires précises (créneau guidé, pas une demande ouverte).",
  "Décideur d'abord — s'il redirige vers l'IT ou le métier, c'est gagné (demander l'intro).",
  "Ton suisse : sobre, factuel, modeste. Pas de chiffre balancé au téléphone. On propose, on ne fait jamais la leçon (« vous payez trop cher / vous êtes en retard » est interdit).",
  "Ne jamais revendiquer une certification que Pilae n'a pas : open source opéré, hébergé en Suisse, réversible, hors Cloud Act.",
];

export const BOOKING_ASK =
  "Très bien — dans ce cas, je pense qu'on a intérêt à se voir. Vous seriez disponible pour une visio de 45 minutes à 1h, plutôt lundi entre 14h et 18h, ou jeudi entre 9h et 12h ? Je viendrais avec une première lecture de ce que vous pourriez remplacer et l'écart de coût — rien à préparer de votre côté.";

// Sector → segment + sector↔subject line + qualifiers. Keys match the company's
// sector/industry string (accent/case-insensitive substring). Enjeux come from
// the segment (shared), so the peer voice stays consistent.
const SECTOR_SCRIPTS: Array<{
  key: string;
  segment: "terrain" | "mure";
  match: string[];
  line: string;
  qualifiers: string[];
  note?: string;
}> = [
  {
    key: "sante",
    segment: "terrain",
    match: ["sant", "health", "medical", "médic", "clinique", "hopital", "hôpital", "ems", "soin"],
    line: "les EMS et institutions de soin romands : leur permettre d'utiliser l'IA en interne sans que les données des résidents partent à l'étranger.",
    qualifiers: [
      "géré en interne ou par un prestataire IT ?",
      "un budget logiciels annuel qui compte ?",
      "des données sensibles (résidents/patients) dessus ?",
    ],
    note: "Honnêteté : « conforme » ≠ « souverain » (Cloud Act), ne pas dramatiser. S'ils sont déjà hébergés en Suisse en propre, le reconnaître et lâcher.",
  },
  {
    key: "fondations",
    segment: "terrain",
    match: ["fondation", "foundation", "stiftung", "association", "ong", "ngo", "non-profit", "nonprofit", "philanthrop", "social", "caritas"],
    line: "les fondations et institutions sociales romandes : utiliser l'IA et automatiser l'administratif tout en gardant les données donateurs et bénéficiaires en Suisse.",
    qualifiers: [
      "combien d'outils en abonnement aujourd'hui ?",
      "qui gère l'IT (interne, prestataire, ou personne) ?",
      "une échéance de contrat bientôt ?",
    ],
    note: "Fondation donatrice : insister sur la confidentialité des données donateurs. Décideur = secrétaire général / directeur, pas le président (souvent bénévole).",
  },
  {
    key: "parapublic",
    segment: "terrain",
    match: ["parapublic", "public", "administration", "commune", "canton", "collectivit", "état", "etat", "municipal", "ville de"],
    line: "les administrations et le parapublic romand : l'IA en interne et la souveraineté des données citoyens.",
    qualifiers: [
      "géré en interne ou par un prestataire ?",
      "un budget logiciels / licences annuel qui compte ?",
      "des contraintes de souveraineté ou de marchés publics ?",
    ],
  },
  {
    key: "international",
    segment: "mure",
    match: ["international", "intergouvernement", "nations unies", "united nations", "federation", "fédération", "federación"],
    line: "les organisations internationales basées en Suisse romande : l'IA souveraine — données sensibles et mandat de neutralité.",
    qualifiers: [
      "la décision IT se prend ici ou au siège ?",
      "qui gère l'IT en interne ?",
      "des contraintes de neutralité ou de souveraineté formalisées ?",
    ],
    note: "Souvent en anglais. Décideur = secrétaire général / directeur, pas le président (souvent bénévole). ONU/OIG = vente longue (ICT centralisée, appels d'offres).",
  },
  {
    // Before "education" so "Information technology" hits IT (else education's
    // "formation" token greedily matches "inFORMATION").
    key: "it",
    segment: "mure",
    match: ["information technology", "informatique", "it services", "it & services", "software", "logiciel", "saas", "cybersecur", "cloud"],
    line: "les sociétés IT romandes : la souveraineté — vos clients demandent du suisse, et on peut le leur offrir opéré, en marque blanche.",
    qualifiers: [
      "vos clients demandent-ils déjà de l'hébergement suisse ?",
      "vous revendez / opérez pour des clients ?",
      "qui gère l'infra en interne ?",
    ],
  },
  {
    key: "education",
    segment: "mure",
    match: ["education", "école", "ecole", "haute école", "enseignement", "school", "scolaire", "universit", "facult", "hes", "hep", "heg", "college", "colleges", "collège", "académie", "academy", "gymnase", "lycée", "business school", "graduate", "conservatoire", "training", "formation"],
    line: "les hautes écoles et écoles privées romandes : l'IA en interne — les étudiants l'utilisent déjà partout, avec des données sensibles derrière.",
    qualifiers: [
      "qui gère l'IT (une personne, un prestataire) ?",
      "un budget licences annuel qui compte ?",
      "une rentrée ou une échéance qui approche ?",
    ],
    note: "Écoles privées / internationales : la confidentialité vis-à-vis des familles pèse autant que le coût.",
  },
  {
    key: "conseil",
    segment: "mure",
    match: ["conseil", "consult", "advisory", "cabinet", "audit"],
    line: "les cabinets de conseil romands : l'IA et l'automatisation — le temps gagné se refacture, mais les dossiers clients restent confidentiels.",
    qualifiers: [
      "combien d'outils en abonnement ?",
      "qui gère l'IT en interne ?",
      "des données clients sensibles à protéger ?",
    ],
  },
  {
    key: "low-tech",
    segment: "mure",
    match: ["industrie", "manufact", "construction", "btp", "logistique", "négoce", "negoce", "retail", "commerce", "machinery"],
    line: "les PME industrielles et de terrain romandes : l'IA en interne et l'automatisation, sans dépendre des outils américains et en gardant la main sur les coûts.",
    qualifiers: [
      "combien d'outils en abonnement ?",
      "qui gère l'IT en interne ?",
      "une échéance de contrat proche ?",
    ],
  },
];

export const GENERIC_PROBLEMS = [...ENJEUX_MURE];

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
 * + the "non" branch + any sector note. */
function composeGuidance(base: CallScript): string[] {
  return [
    `${NO_RESPONSE_TAG} ${DEFAULT_NO_RESPONSE}`,
    ...GUIDANCE,
    `À qualifier si besoin (sans en faire une découverte) : ${base.qualifiers.join(" · ")}.`,
    ...(base.note ? [base.note] : []),
  ];
}

/** Split persisted guidance into the read-aloud "no" response (the tagged
 * entry) and the rest (in-call tips). */
export function splitGuidance(guidance: string[]): { noResponse: string; tips: string[] } {
  const idx = guidance.findIndex((g) => g.startsWith(NO_RESPONSE_TAG));
  if (idx === -1) return { noResponse: "", tips: guidance };
  return {
    noResponse: guidance[idx].slice(NO_RESPONSE_TAG.length).trim(),
    tips: guidance.filter((_, i) => i !== idx),
  };
}

/** Re-encode an edited "no" response into the guidance array (tagged, first). */
export function withNoResponse(tips: string[], noResponse: string): string[] {
  const clean = tips.filter((g) => !g.startsWith(NO_RESPONSE_TAG));
  return noResponse.trim() ? [`${NO_RESPONSE_TAG} ${noResponse.trim()}`, ...clean] : clean;
}

/** Bascule lead shown above the enjeux (sector-agnostic — the demi-phrase). */
export function peerLeadFor(_sector?: string | null): string {
  return BASCULE;
}

// Precedence: org-TYPE (school / federation / foundation) wins over TOPIC
// (santé / public). A "haute école de santé" is a SCHOOL, not an EMS — so the
// classification text (ideally NAME + industry) is matched in THIS order, not
// array order. Apollo's industry is unreliable (a health school tagged
// "hospital & health care"); the company name disambiguates.
const MATCH_ORDER = ["it", "education", "international", "fondations", "sante", "parapublic", "conseil", "low-tech"];

/** Every sector key the classifier can resolve to (incl. generic). */
export const SECTOR_KEYS = [...MATCH_ORDER, "generic"] as const;

/** Substring match (accent/case-insensitive) of free text → a sector key, in
 *  precedence order (org-type before topic), or null. The waterfall uses this
 *  for the NAME and INDUSTRY signals. */
export function matchSectorKey(text: string | null | undefined): string | null {
  const s = norm(text ?? "");
  if (!s) return null;
  for (const key of MATCH_ORDER) {
    const entry = SECTOR_SCRIPTS.find((e) => e.key === key);
    if (entry && entry.match.some((m) => s.includes(norm(m)))) return key;
  }
  return null;
}

/** Build the CallScript for a known sector key (generic if unknown/empty). */
export function scriptForKey(key: string | null | undefined): CallScript {
  const entry = SECTOR_SCRIPTS.find((e) => e.key === key);
  if (entry) {
    return {
      key: entry.key,
      segment: entry.segment,
      problems: enjeuxFor(entry.segment),
      qualifiers: entry.qualifiers,
      line: entry.line,
      note: entry.note,
      bookingAsk: BOOKING_ASK,
    };
  }
  return {
    key: "generic",
    segment: "mure",
    problems: GENERIC_PROBLEMS,
    qualifiers: GENERIC_QUALIFIERS,
    line: GENERIC_LINE,
    bookingAsk: BOOKING_ASK,
  };
}

/** Pick the best script from free text (name/industry substring). Falls back
 *  to generic. (The full multi-signal waterfall lives in sector-classify.) */
export function pickCallScript(sector: string | null | undefined): CallScript {
  return scriptForKey(matchSectorKey(sector) ?? "generic");
}

/** The opener sector↔subject line for a known sector key. */
export function lineForKey(key: string | null | undefined): string {
  return scriptForKey(key).line;
}

/** Default editable fields for a known sector key. */
export function defaultScriptFieldsForKey(key: string | null | undefined): ScriptFields {
  const base = scriptForKey(key);
  return {
    opener: DEFAULT_OPENER,
    problems: base.problems,
    permissionCheck: PERMISSION_CHECK,
    bookingAsk: base.bookingAsk,
    guidance: composeGuidance(base),
  };
}

/** Resolve a script for a live call: build the identity + sector↔subject +
 * permission opener (name + line interpolated) + bascule lead + composed
 * guidance. `tool` is accepted for signature stability but no longer alters the
 * opener (it only floats the matched enjeu downstream, via planProblems). */
export function resolveCallScript(input: {
  sector?: string | null;
  geo?: string | null;
  contactName?: string | null;
  tool?: string | null;
}): ResolvedScript {
  const base = pickCallScript(input.sector);
  const sectorLabel = (input.sector ?? "votre secteur").trim() || "votre secteur";
  const geoLabel = (input.geo ?? "votre région").trim() || "votre région";
  const opener = interpolateOpener(DEFAULT_OPENER, {
    name: input.contactName,
    sector: input.sector,
    geo: input.geo,
    line: base.line,
  });
  return {
    ...base,
    sectorLabel,
    geoLabel,
    opener,
    peerLead: peerLeadFor(sectorLabel),
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

/** Interpolate {name}/{sector}/{geo}/{line} into an opener template (collapsing
 * the gaps left by empty values). {line} is the sector↔subject hook; the legacy
 * {reason} token is accepted as an alias so older saved openers still render.
 * Never positionally injected (a "M." honorific would corrupt the sentence). */
export function interpolateOpener(
  template: string,
  vars: { name?: string | null; sector?: string | null; geo?: string | null; line?: string | null; reason?: string | null },
): string {
  const line = (vars.line ?? vars.reason ?? "").trim();
  const out = template
    .replace(/\{name\}/g, (vars.name ?? "").trim())
    .replace(/\{sector\}/g, (vars.sector ?? "").trim() || "votre secteur")
    .replace(/\{geo\}/g, (vars.geo ?? "").trim() || "votre région")
    .replace(/\{line\}/g, line)
    .replace(/\{reason\}/g, line);
  return out
    .replace(/\s{2,}/g, " ")
    // Only collapse a stray space before a comma/period (gaps left by an empty
    // token). French keeps the space before ; : ! ? — never strip those.
    .replace(/\s+([,.])/g, "$1")
    .replace(/^Bonjour\s*,/, "Bonjour,")
    .trim();
}
