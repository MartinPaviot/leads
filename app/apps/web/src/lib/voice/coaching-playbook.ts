/**
 * NEUTRAL objection → response playbook for the live coaching layer.
 *
 * This is the universal FALLBACK: methodology-sound aikido (acknowledge →
 * one calibrated question → de-risk), product-agnostic, in "vous" — safe to
 * whisper to ANY tenant's rep. It deliberately contains no product names, no
 * prices, no vendor claims: those belong to the per-tenant bank generated
 * from the tenant's own product + ICP (lib/voice/tenant-playbook.ts), which
 * overrides these entries class-by-class when present.
 *
 * Each suggestion is intentionally short — a cold-call reframe the rep can
 * say in one breath, never a pitch.
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
      "C'est une vraie question, et honnêtement le chiffre seul ne veut rien dire : il se compare à ce que ça remplace. C'est exactement ce qu'on poserait à plat en rendez-vous — qu'est-ce que vous payez aujourd'hui sur ce poste ?",
      "Je comprends. Avant de parler prix : est-ce que le sujet lui-même vous parle ? Si oui, le rendez-vous sert justement à chiffrer l'écart, sans engagement.",
    ],
  },
  not_the_right_time: {
    objectionClass: "not_the_right_time",
    label: "Pas le bon moment",
    suggestedResponses: [
      "Aucun souci. Juste pour comprendre — c'est le timing, ou le sujet ne vous parle pas du tout ? Si c'est le timing, je vous rappelle quand ce sera mieux : qu'est-ce qui changerait d'ici là ?",
      "Compris, je ne vous retiens pas. Une seule question : si je vous recontacte dans quelques mois, qu'est-ce qui aura bougé chez vous d'ici là ?",
    ],
  },
  already_have_a_vendor: {
    objectionClass: "already_have_a_vendor",
    label: "Déjà un fournisseur",
    suggestedResponses: [
      "Logique — vous ne seriez pas à votre poste sans avoir réglé ça. La question n'est jamais « changer », c'est « mesurer l'écart » : qu'est-ce qui vous agace le plus dans l'outil en place, même un détail ?",
      "Très bien, je ne vous propose pas de changer. Si un jour vous voulez un point de comparaison chiffré, c'est exactement ce qu'on prépare — ça se regarde en 45 minutes, sans suite obligée.",
    ],
  },
  no_budget: {
    objectionClass: "no_budget",
    label: "Pas de budget",
    suggestedResponses: [
      "Compris. Par curiosité, le budget sur ce poste, il se décide quand et par qui ? Je préfère revenir au bon moment qu'insister au mauvais.",
      "C'est entendu. La rencontre ne vous coûte rien et ne vous engage à rien — vous repartez avec une lecture chiffrée que vous pourrez ressortir quand le budget s'ouvrira.",
    ],
  },
  not_the_decision_maker: {
    objectionClass: "not_the_decision_maker",
    label: "Pas décideur",
    suggestedResponses: [
      "Merci de me le dire — c'est précieux. Qui porte ce sujet chez vous ? Et est-ce que ça vous touche quand même dans votre périmètre ?",
      "Très bien. Vous préférez me mettre en relation, ou que je le contacte directement en mentionnant notre échange ?",
    ],
  },
  not_the_right_problem: {
    objectionClass: "not_the_right_problem",
    label: "Pas le problème actuel",
    suggestedResponses: [
      "C'est noté, et c'est une vraie réponse. Pour que je ne vous rappelle pas pour rien : c'est quoi, vous, le sujet qui compte ce trimestre ?",
      "Compris. Si ce n'est pas ce sujet-là, je préfère le savoir — qu'est-ce qui vous occupe vraiment en ce moment ?",
    ],
  },
  send_email_instead: {
    objectionClass: "send_email_instead",
    label: "Envoyez un mail",
    suggestedResponses: [
      "Avec plaisir, je vous l'envoie. Pour qu'il ne finisse pas dans la pile : qu'est-ce qui vous ferait dire, en le lisant, « OK, ça mérite un échange » ?",
      "Bien sûr. Une question avant, pour cibler le mail : sur ce sujet, vous en êtes où aujourd'hui ?",
    ],
  },
  happy_with_current: {
    objectionClass: "happy_with_current",
    label: "Content du setup actuel",
    suggestedResponses: [
      "C'est rare, et tant mieux. Par curiosité : s'il y avait UNE chose à améliorer dans ce qui est en place, ce serait quoi ?",
      "Très bien. Je ne cherche pas à vous faire changer — juste à savoir si un point de comparaison chiffré vous serait utile un jour. Oui ou non, en toute franchise ?",
    ],
  },
  need_more_info: {
    objectionClass: "need_more_info",
    label: "Besoin de plus d'infos",
    suggestedResponses: [
      "Normal. Le plus efficace, c'est 45 minutes où on regarde votre cas précis — vous repartez avec une lecture concrète, même si on ne va pas plus loin. Plutôt début ou fin de semaine ?",
      "Bien sûr. Pour vous envoyer la bonne info et pas une plaquette : qu'est-ce que vous voulez vérifier en premier ?",
    ],
  },
  send_to_someone_else: {
    objectionClass: "send_to_someone_else",
    label: "Voyez avec quelqu'un d'autre",
    suggestedResponses: [
      "Merci, c'est exactement ce qu'il me fallait. Qui dois-je contacter, et qu'est-ce que je devrais mentionner de notre échange pour que ce soit utile ?",
      "Très bien. Vous préférez faire l'intro par mail, ou que je l'appelle en disant que vous m'avez orienté vers lui ?",
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
