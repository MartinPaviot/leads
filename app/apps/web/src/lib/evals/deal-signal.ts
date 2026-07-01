/**
 * Deal-signal recall — the eval behind the "body into the deal AI" work.
 *
 * The brains surface a bounded body EXCERPT to the LLM (lib/company-brain/
 * excerpt.ts). The quality question Claap's pitch names ("the AI is blind on the
 * most critical part of the deal") is precisely: does that excerpt PRESERVE the
 * buyer's decision — the "go", the objection, the next step, the churn — when it
 * is buried mid-thread, or does head-truncation lose it?
 *
 * These are hand-crafted synthetic threads (the repo is PUBLIC — no real
 * prospect content is committed). Each case pins one verbatim decision signal
 * and its POSITION: `head` (in the first ~120 chars) or `buried` (after a
 * paragraph of pleasantries). The gate feeds every case through the ACTUAL brain
 * excerpt and asserts the signal survives; the paired regression test shows the
 * old head-only excerpt loses the buried ones.
 */

export type DealSignalKind = "go" | "objection" | "next-step" | "churn";

export interface DealSignalCase {
  id: string;
  lang: "en" | "fr";
  position: "head" | "buried";
  kind: DealSignalKind;
  /** Verbatim phrase the deal read must not lose (a substring of `body`). */
  signal: string;
  /** Full inbound email body. */
  body: string;
}

const PLEASANTRY_EN =
  "Hi there, thanks so much for taking the time yesterday — really enjoyed the walkthrough and the team clearly knows the space. I looped in a couple of colleagues afterwards and we chatted through it over coffee this morning. ";
const PLEASANTRY_FR =
  "Bonjour, merci beaucoup pour l'échange d'hier, c'était vraiment intéressant et l'équipe maîtrise clairement le sujet. J'en ai reparlé avec deux collègues ce matin autour d'un café, on a bien creusé le point ensemble. ";

export const DEAL_SIGNAL_CASES: DealSignalCase[] = [
  // ── GO ───────────────────────────────────────────────────────
  {
    id: "go-head-en",
    lang: "en",
    position: "head",
    kind: "go",
    signal: "we're good to go, send the order form",
    body: "Great news — we're good to go, send the order form and we'll get it signed this week. Excited to start.",
  },
  {
    id: "go-buried-en",
    lang: "en",
    position: "buried",
    kind: "go",
    signal: "we're good to go — send over the contract",
    body: `${PLEASANTRY_EN}A few small notes on the onboarding timeline we can sort later. Bottom line: we're good to go — send over the contract and we'll countersign by Friday.`,
  },
  {
    id: "go-buried-fr",
    lang: "fr",
    position: "buried",
    kind: "go",
    signal: "c'est bon pour nous, on signe",
    body: `${PLEASANTRY_FR}Il reste deux détails sur le planning de déploiement mais rien de bloquant. En résumé : c'est bon pour nous, on signe, envoie le bon de commande.`,
  },
  // ── OBJECTION ────────────────────────────────────────────────
  {
    id: "obj-head-en",
    lang: "en",
    position: "head",
    kind: "objection",
    signal: "it's too expensive for where we are",
    body: "Honestly it's too expensive for where we are right now — the value is clear but the number is a stretch for this quarter.",
  },
  {
    id: "obj-buried-en",
    lang: "en",
    position: "buried",
    kind: "objection",
    signal: "we'd need a security review before anything",
    body: `${PLEASANTRY_EN}The product itself looks like a strong fit for the team. One thing though: we'd need a security review before anything can move, our infosec lead is strict about that.`,
  },
  {
    id: "obj-buried-fr",
    lang: "fr",
    position: "buried",
    kind: "objection",
    signal: "je dois valider le budget avec la direction",
    body: `${PLEASANTRY_FR}Sur le fond l'outil correspond bien à notre besoin. Seul point : je dois valider le budget avec la direction avant d'aller plus loin, c'est trop cher pour une décision de mon niveau.`,
  },
  // ── NEXT-STEP ────────────────────────────────────────────────
  {
    id: "next-head-en",
    lang: "en",
    position: "head",
    kind: "next-step",
    signal: "let's schedule a call next week",
    body: "Let's schedule a call next week to walk the wider team through it — Tuesday or Wednesday afternoon works best for me.",
  },
  {
    id: "next-buried-en",
    lang: "en",
    position: "buried",
    kind: "next-step",
    signal: "circle back after the board meeting on the 14th",
    body: `${PLEASANTRY_EN}No blockers on our side and the pricing is fine. Given the size of this, we'll circle back after the board meeting on the 14th with a final yes.`,
  },
  {
    id: "next-buried-fr",
    lang: "fr",
    position: "buried",
    kind: "next-step",
    signal: "on se recale la semaine prochaine",
    body: `${PLEASANTRY_FR}Rien ne bloque de notre côté et le tarif nous convient. Vu l'enjeu, on se recale la semaine prochaine pour valider avec l'équipe élargie.`,
  },
  // ── CHURN ────────────────────────────────────────────────────
  {
    id: "churn-head-en",
    lang: "en",
    position: "head",
    kind: "churn",
    signal: "we're going with another vendor",
    body: "Appreciate all the time — we're going with another vendor that already integrates with our stack. Not a fit right now, but let's stay in touch.",
  },
  {
    id: "churn-buried-en",
    lang: "en",
    position: "buried",
    kind: "churn",
    signal: "we've decided not to move forward",
    body: `${PLEASANTRY_EN}Your team was great throughout and this was a genuinely hard call. After weighing it internally, we've decided not to move forward this year — budget got reallocated.`,
  },
  {
    id: "churn-buried-fr",
    lang: "fr",
    position: "buried",
    kind: "churn",
    signal: "finalement ce n'est pas pour nous",
    body: `${PLEASANTRY_FR}Votre équipe a été au top et la décision n'a pas été simple. Après en avoir rediscuté en interne, finalement ce n'est pas pour nous cette année, le budget a été réaffecté.`,
  },
  // A long buried case: cue past 500 chars (still within the 2000 fetch window).
  {
    id: "go-deep-buried-en",
    lang: "en",
    position: "buried",
    kind: "go",
    signal: "you have our green light — let's sign",
    body: `${PLEASANTRY_EN}${PLEASANTRY_EN}We went through the security questionnaire and legal had a quick look at the MSA, all clear. The team is aligned and the champion is bought in. So: you have our green light — let's sign and kick off in January.`,
  },
  {
    id: "next-head-fr",
    lang: "fr",
    position: "head",
    kind: "next-step",
    signal: "prochaine étape : une démo avec l'équipe",
    body: "Prochaine étape : une démo avec l'équipe élargie, idéalement mardi prochain. Je cale ça et je reviens vers toi avec un créneau.",
  },
];

/**
 * Does the brain PROJECTION (the excerpt the LLM actually receives) still
 * contain the decision signal? Case- and whitespace-insensitive containment —
 * the excerpt may add leading/trailing "…" and collapse whitespace.
 */
export function signalInProjection(
  projection: string | null | undefined,
  signal: string,
): boolean {
  if (!projection) return false;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return norm(projection).includes(norm(signal));
}
