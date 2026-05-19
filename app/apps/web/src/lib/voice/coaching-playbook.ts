/**
 * Static objection → response playbook for the live coaching layer.
 *
 * Seed bank. Phase 3.5 learns per-tenant responses from accepted
 * cards (when the AE actually says the suggested line versus when
 * they ignore it). For now this is enough to validate the surface.
 *
 * Each suggestion is intentionally short (one or two sentences) — a
 * cold-call reframe, not a Salesforce-flavoured pitch.
 */

export type ObjectionClass =
  | "price_too_high"
  | "not_the_right_time"
  | "already_have_a_vendor"
  | "no_budget"
  | "not_the_decision_maker"
  | "not_the_right_problem"
  | "send_email_instead"
  | "happy_with_current"
  | "need_more_info"
  | "send_to_someone_else";

export interface PlaybookEntry {
  objectionClass: ObjectionClass;
  label: string;
  suggestedResponses: string[];
}

export const PLAYBOOK: Record<ObjectionClass, PlaybookEntry> = {
  price_too_high: {
    objectionClass: "price_too_high",
    label: "Trop cher / pas dans le budget",
    suggestedResponses: [
      "Le prix de surface est $999/mo — mais je voulais surtout savoir si vous trackez le coût par meeting actuellement, parce que c'est là que la comparaison devient pertinente.",
      "Je comprends. La plupart des founders qu'on signe étaient au même point — ce qui a débloqué, c'est de calculer le coût d'un SDR vs Elevay sur 3 mois.",
    ],
  },
  not_the_right_time: {
    objectionClass: "not_the_right_time",
    label: "Pas le bon moment",
    suggestedResponses: [
      "OK, qu'est-ce qu'il faudrait débloquer pour que ça devienne le bon moment ? Si je connais le déclencheur, je peux te recontacter pile au bon moment.",
      "Compris. Je te programme un rappel pour {{date+45j}} — entre temps, tu veux que je t'envoie 2-3 retours de fondateurs dans ton secteur ?",
    ],
  },
  already_have_a_vendor: {
    objectionClass: "already_have_a_vendor",
    label: "Déjà un fournisseur",
    suggestedResponses: [
      "Curieux, vous êtes sur Outreach ou Apollo ? Ce qu'on fait différemment c'est zéro CRM manuel — tu veux que je te montre comment ça change la journée d'un AE en 5 min ?",
      "Logique. Le seul cas où ça vaut la peine d'évaluer un challenger, c'est quand tu sens que ton outil actuel te coûte plus en saisie qu'il te ramène. Tu es dans ce cas ?",
    ],
  },
  no_budget: {
    objectionClass: "no_budget",
    label: "Pas de budget",
    suggestedResponses: [
      "Compris. Quand le budget Q+1 est défini, c'est toi qui le portes ou c'est le COO/CRO ?",
      "OK. Pour info, on a un onboarding qui te fait économiser le coût d'un SDR junior — la conversation budget devient différente quand on regarde la fully-loaded cost.",
    ],
  },
  not_the_decision_maker: {
    objectionClass: "not_the_decision_maker",
    label: "Pas décideur",
    suggestedResponses: [
      "Sans souci. Qui d'autre devrait être dans la conversation ? Je veux pas te faire perdre du temps en repassant par toi à chaque étape.",
      "OK. Tu portes ce sujet ou c'est plus côté Head of Sales / CRO ? Je peux les approcher directement avec ton contexte si tu veux.",
    ],
  },
  not_the_right_problem: {
    objectionClass: "not_the_right_problem",
    label: "Pas le problème actuel",
    suggestedResponses: [
      "Compris. C'est quoi ton top 2 priorités GTM ces 90 prochains jours ? Si Elevay ne s'y plug pas, c'est autant pour toi que pour moi de le savoir.",
      "OK. Pour clarifier — c'est plutôt outbound velocity, retention, ou conversion top-of-funnel que tu tries en ce moment ?",
    ],
  },
  send_email_instead: {
    objectionClass: "send_email_instead",
    label: "Envoyez un mail",
    suggestedResponses: [
      "Bien sûr, je t'envoie ça dans la foulée. Avant — qu'est-ce qui te ferait dire « OK, ça vaut le coup d'en parler 15 min » en lisant le mail ?",
      "Pas de problème. Pour cibler le mail, c'est plus le côté zéro saisie CRM, la vitesse d'enrichissement, ou la qualité du targeting qui te parlerait ?",
    ],
  },
  happy_with_current: {
    objectionClass: "happy_with_current",
    label: "Content du setup actuel",
    suggestedResponses: [
      "Top — c'est rare d'entendre ça. Curieux : si tu devais améliorer un truc sur ton outbound aujourd'hui, ça serait quoi ?",
      "Cool. Just pour cadrer — tu mesures ton outbound sur quel KPI principal ? Replies, meetings, opps ?",
    ],
  },
  need_more_info: {
    objectionClass: "need_more_info",
    label: "Besoin de plus d'infos",
    suggestedResponses: [
      "Je peux faire mieux qu'un PDF — je te montre Elevay sur ton propre TAM en 8 min. Tu as un créneau cette semaine ?",
      "Bien sûr. Avant le mail, juste pour cadrer — c'est quoi ton process outbound aujourd'hui : SDR interne, agence, founder-led ?",
    ],
  },
  send_to_someone_else: {
    objectionClass: "send_to_someone_else",
    label: "Voyez avec quelqu'un d'autre",
    suggestedResponses: [
      "OK, qui je devrais contacter ? Et qu'est-ce que je devrais lui dire pour cadrer le contexte que tu m'as donné ?",
      "Compris. Tu peux me mettre en intro par mail, ou tu préfères que je le contacte cold en mentionnant que tu m'as redirigé ?",
    ],
  },
};

export function lookupPlaybook(
  cls: ObjectionClass | string | null | undefined,
): PlaybookEntry | null {
  if (!cls) return null;
  return (PLAYBOOK as Record<string, PlaybookEntry>)[cls] ?? null;
}

/**
 * Cheap keyword prefilter — runs locally on the new prospect chunk
 * before we spend an LLM call. Tuned for FR + EN cold-call patterns;
 * returning true means the chunk *might* contain an objection and is
 * worth the Haiku round-trip.
 */
// Word-boundary-ish patterns. JS regex `\b` is ASCII-only — so for
// French accented words (déjà, intéressé, décideur) we use
// space/punct/start-of-string sentinels instead of `\b`.
const WB = "(?:^|[^a-zA-ZÀ-ÿ])";
const WE = "(?:[^a-zA-ZÀ-ÿ]|$)";
const PROSPECT_OBJECTION_HINTS = [
  // FR
  new RegExp(`${WB}mais${WE}`, "i"),
  new RegExp(`${WB}déjà${WE}`, "i"),
  new RegExp(`${WB}trop${WE}`, "i"),
  new RegExp(`${WB}pas${WE}`, "i"),
  /plus tard/i,
  new RegExp(`${WB}réfléchir`, "i"),
  /budget/i,
  new RegExp(`${WB}cher${WE}`, "i"),
  new RegExp(`${WB}int[eé]ress[eé]?[es]?${WE}`, "i"),
  new RegExp(`${WB}d[eé]cideur${WE}`, "i"),
  new RegExp(`${WB}voir${WE}`, "i"),
  /\bmail/i,
  /envoyez/i,
  /enverr/i,
  // EN
  /\bbut\b/i,
  /\bhowever\b/i,
  /\bexpensive\b/i,
  /\blater\b/i,
  /\bthink about\b/i,
  /\balready (have|use|got)\b/i,
  /\bnot the right\b/i,
  /\bnot interested\b/i,
  /\bsend (me|us) (an )?email\b/i,
];

export function looksLikeObjection(text: string): boolean {
  if (!text || text.length < 12) return false;
  return PROSPECT_OBJECTION_HINTS.some((re) => re.test(text));
}
