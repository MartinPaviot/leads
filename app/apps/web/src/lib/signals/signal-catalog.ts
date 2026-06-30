/**
 * The signal CATALOG — the curated "which buying signals matter for B2B" prior
 * (pillar 1). The structured generalization of the 5 onboarding playbooks
 * (lib/onboarding/playbooks.ts): each canonical signal + why it's a buying
 * signal + how Elevay can collect it + (optionally) the sectors/personas it
 * skews toward. The recommender (recommend-signals.ts) ranks these against a
 * tenant's actual TAM coverage + learned outcome multipliers.
 *
 * Only signals Elevay can ACTUALLY collect are listed (a recommendation you can't
 * act on is noise):
 *  - "property": fires from companies.properties → profile-able via
 *    detectActiveSignals (so we can measure coverage in the tenant's TAM).
 *  - "monitor": collectable by standing up a search monitor (#572) — the action
 *    is one click.
 *  - "event": arrives from an engagement/integration flow already wired.
 *
 * Curation, not ML: the priors come from SIGNAL_PRIORS; this adds the human
 * rationale + the collect-path. `sectors`/`personas` undefined = applies broadly.
 */

export type SignalDetectability = "property" | "monitor" | "event";

export interface CatalogSignal {
  /** Canonical signal type — matches SIGNAL_PRIORS / the detectors. */
  type: string;
  label: string;
  /** Why it's a buying signal (the B2B logic). */
  rationale: string;
  detect: SignalDetectability;
  /** How to start collecting it (shown as the recommended next step). */
  action: string;
  /** Sectors it skews toward (substring-matched against the ICP industry). Undefined = broad. */
  sectors?: string[];
  /** Persona classes it skews toward (founder/exec/vp/manager/ic). Undefined = broad. */
  personas?: string[];
}

export const SIGNAL_CATALOG: CatalogSignal[] = [
  {
    type: "funding",
    label: "Recent funding",
    rationale: "A fresh round means new budget + a mandate to scale — tooling decisions happen within ~60 days.",
    detect: "property",
    action: "Enrich accounts with Apollo/Crunchbase funding (already on the TAM), or watch funding news.",
    personas: ["founder", "exec"],
  },
  {
    type: "funding_crunchbase",
    label: "Funding (Crunchbase)",
    rationale: "Same buying trigger as funding, from the Crunchbase feed — round size + investors signal budget tier.",
    detect: "property",
    action: "Enrich the TAM via Crunchbase.",
    personas: ["founder", "exec"],
  },
  {
    type: "hiring",
    label: "Hiring for the buying team",
    rationale: "Open roles in the function you sell to (RevOps, Eng, Sales) = a team scaling = a budget being formed.",
    detect: "monitor",
    action: "Create a daily Jobs monitor for the roles your buyers hire (#572).",
  },
  {
    type: "hiring_surge",
    label: "Hiring surge",
    rationale: "5+ open roles at once is aggressive scaling — strong intent to invest in process + tooling.",
    detect: "monitor",
    action: "Create a Jobs monitor; a company with 5+ roles flags as a surge.",
  },
  {
    type: "executive_hire",
    label: "New executive (VP / C-level)",
    rationale: "A new VP/CxO rebuilds their stack in the first 90 days — the highest-intent window to reach a buyer.",
    detect: "monitor",
    action: "Create a Jobs monitor for senior roles, or watch leadership news.",
    personas: ["exec", "vp"],
  },
  {
    type: "leadership_change",
    label: "Leadership change",
    rationale: "A leadership move resets priorities + vendor relationships — incumbents are up for review.",
    detect: "property",
    action: "Enrich the TAM with leadership data, or watch news.",
    personas: ["exec", "vp"],
  },
  {
    type: "tech_stack_change",
    label: "Tech-stack change",
    rationale: "Adopting/dropping a tool signals an active build — adjacent needs open right after.",
    detect: "property",
    action: "Enrich the TAM with technographics.",
  },
  {
    type: "investor_overlap",
    label: "Shared investor",
    rationale: "A common investor is a warm path + social proof — intro-able and higher-trust from the first touch.",
    detect: "property",
    action: "Sourced from the funding graph on the TAM.",
  },
  {
    type: "warm_connection",
    label: "Warm LinkedIn connection",
    rationale: "A 1st-degree path turns a cold account warm — the single highest-converting access signal.",
    detect: "event",
    action: "Connect a LinkedIn seat (Settings → Sending infra) to light up the relationship graph.",
  },
  {
    type: "acquisition",
    label: "Acquisition / M&A",
    rationale: "An acquisition forces consolidation + re-tooling — a large, time-boxed buying window.",
    detect: "event",
    action: "Watch M&A news on the TAM.",
    personas: ["exec"],
  },
  {
    type: "positive_reply",
    label: "Positive reply",
    rationale: "The prospect engaged — by far the strongest signal; route them to the front of the queue.",
    detect: "event",
    action: "Already captured from inbound replies once outreach is running.",
  },
];

/** Lookup a catalog entry by type. */
export function catalogEntry(type: string): CatalogSignal | undefined {
  return SIGNAL_CATALOG.find((s) => s.type === type);
}

/** Does a catalog signal apply to an ICP's sectors / personas? A signal with no
 * sector/persona constraint applies broadly. Substring, case-insensitive match
 * of the signal's sectors against any of the ICP industries. Pure. */
export function appliesToIcp(sig: CatalogSignal, icpIndustries: string[], icpPersonas: string[]): boolean {
  const sectorOk =
    !sig.sectors?.length ||
    icpIndustries.length === 0 ||
    sig.sectors.some((s) => icpIndustries.some((ind) => ind.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(ind.toLowerCase())));
  const personaOk = !sig.personas?.length || icpPersonas.length === 0 || sig.personas.some((p) => icpPersonas.includes(p));
  return sectorOk && personaOk;
}
