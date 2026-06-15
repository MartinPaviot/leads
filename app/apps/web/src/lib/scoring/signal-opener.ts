/**
 * Signal → opener generator (gap D, _specs/multi-icp + cold-call flow).
 *
 * Closes the gap where SIGNAL_ANGLES + METHODOLOGIES existed but nothing
 * fused a company's ACTUAL fired signals + the tenant's ICP/product +
 * the contact's seniority into concrete opening copy.
 *
 * Pure — no DB, no LLM, fully testable. Produces a grounded opener
 * deterministically (so it works even when the LLM endpoint is
 * unreachable); an optional LLM polish can wrap the output later.
 */

import {
  getMethodology,
  pickBestSignal,
  SIGNAL_ANGLES,
  type SignalAngle,
} from "./outbound-methodologies";

/** A company's fired TAM signals (companies.properties.tamSignals). */
export interface TamSignalBundle {
  [key: string]:
    | { value?: boolean; reason?: string; confidence?: string; computedAt?: string }
    | null
    | undefined;
}

/**
 * TAM signal key → SIGNAL_ANGLES taxonomy key.
 *
 * Deliberately absent: `yc_company`. Being a YC company is a static
 * TRAIT — it belongs in ICP criteria, not in outreach angles. The old
 * `yc_company → "news"` mapping generated "Read about this…" copy
 * about something that never happened. `investor_overlap` gets its
 * own warm-path angle instead of impersonating a funding event.
 */
const TAM_SIGNAL_TO_ANGLE: Record<string, string> = {
  funding_recent: "funding",
  funding_crunchbase: "funding",
  investor_overlap: "common_investor",
  hiring_intent: "hiring",
};

/**
 * Freshness windows for TAM-signal payloads used as outreach angles
 * (mirrors SIGNAL_TTL_DAYS in signal-detectors.ts — TAM keys differ
 * from detector keys, hence the local map). `null` = standing fact.
 * Legacy payloads without `computedAt` are kept: retro-purging every
 * pre-dating TAM at once would silently blank existing openers; all
 * new builds stamp `computedAt`.
 */
const TAM_SIGNAL_TTL_DAYS: Record<string, number | null> = {
  funding_recent: 180,
  funding_crunchbase: 180,
  hiring_intent: 30,
  investor_overlap: null,
};

const DAY_MS = 86_400_000;

function isTamPayloadFresh(key: string, computedAt: string | undefined, asOf: Date): boolean {
  const ttl = TAM_SIGNAL_TTL_DAYS[key];
  if (ttl === null || ttl === undefined) return true;
  if (!computedAt) return true; // legacy tolerance — see map comment
  const t = new Date(computedAt).getTime();
  return t >= asOf.getTime() - ttl * DAY_MS; // NaN fails closed
}

function confidenceToRelevance(c: string | undefined): "high" | "medium" | "low" {
  const s = (c ?? "").toLowerCase();
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  return "low";
}

/** Flatten a fired-signal bundle into the shape pickBestSignal expects.
 * Stale payloads (computedAt beyond the type's TTL) are dropped — a
 * fossil is not a reason to write. */
export function tamSignalsToAngleSignals(
  bundle: TamSignalBundle | null | undefined,
  asOf: Date = new Date(),
): Array<{ type: string; relevance: "high" | "medium" | "low"; title: string; description: string; dataSource?: string }> {
  if (!bundle) return [];
  const out: Array<{ type: string; relevance: "high" | "medium" | "low"; title: string; description: string }> = [];
  for (const [key, sig] of Object.entries(bundle)) {
    if (!sig || sig.value !== true) continue;
    const angleType = TAM_SIGNAL_TO_ANGLE[key];
    if (!angleType) continue;
    if (!isTamPayloadFresh(key, sig.computedAt, asOf)) continue;
    out.push({
      type: angleType,
      relevance: confidenceToRelevance(sig.confidence),
      title: key,
      description: sig.reason ?? "",
    });
  }
  return out;
}

export interface OpenerInput {
  companyName: string;
  contactTitle?: string | null;
  seniority?: string | null;
  /** Fired signals — pass tamSignalsToAngleSignals(company.properties.tamSignals). */
  signals: Array<{ type: string; relevance: "high" | "medium" | "low"; title: string; description: string }>;
  /** What the tenant sells — drives painPoint / inferredArea inference. */
  product?: string | null;
  icpIndustry?: string | null;
  /** Template fill values when known; sensible fallbacks otherwise. */
  fields?: {
    fundingDetail?: string | null;
    inferredArea?: string | null;
    painPoint?: string | null;
    department?: string | null;
    inferredPain?: string | null;
    technology?: string | null;
    specificChallenge?: string | null;
    companyStage?: string | null;
    geography?: string | null;
    expansionChallenge?: string | null;
    role?: string | null;
    category?: string | null;
    newsEvent?: string | null;
    implication?: string | null;
    area?: string | null;
  };
}

export interface GeneratedOpener {
  /** TAM signal key used (e.g. "funding_recent"), or null when no signal fired. */
  signalUsed: string | null;
  /** Angle taxonomy key (funding/hiring/...), or null. */
  angle: string | null;
  methodology: string;
  maxWords: number;
  /** The composed, ready-to-edit opener. */
  opener: string;
  businessImplication: string | null;
  /** What NOT to do, from the seniority methodology. */
  guardrails: string[];
  cta: string;
}

/** Replace {placeholders} with provided values; strip any unfilled ones
 * to a neutral phrase so no raw "{x}" ever leaks into copy. */
function fillTemplate(tpl: string, vars: Record<string, string | null | undefined>, companyName: string): string {
  let out = tpl.replace(/\{company\}/g, companyName);
  out = out.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = vars[key];
    return v && v.trim() ? v : "this";
  });
  // Tidy any double spaces from blank substitutions.
  return out.replace(/\s{2,}/g, " ").trim();
}

/**
 * Generate a grounded opener from a company's fired signals + the
 * contact's seniority methodology + tenant product context.
 * Deterministic. When no signal fired, returns a methodology-shaped
 * opener that leans on the ICP/product instead of a trigger.
 */
export function generateOpener(input: OpenerInput): GeneratedOpener {
  const methodology = getMethodology(input.seniority);
  const f = input.fields ?? {};

  // Fallbacks inferred from product/industry so templates never read "this".
  const inferredArea = f.inferredArea ?? (input.product ? `your ${input.product} roadmap` : "your roadmap");
  const painPoint = f.painPoint ?? "the work compounding faster than the team";
  const vars: Record<string, string | null | undefined> = {
    fundingDetail: f.fundingDetail ?? "your recent raise",
    inferredArea,
    painPoint,
    department: f.department ?? "the team",
    inferredPain: f.inferredPain ?? painPoint,
    technology: f.technology,
    specificChallenge: f.specificChallenge ?? painPoint,
    companyStage: f.companyStage ?? "your stage",
    geography: f.geography,
    expansionChallenge: f.expansionChallenge ?? "operational complexity",
    role: f.role ?? input.contactTitle ?? "the new leader",
    category: f.category ?? (input.product ? input.product : "the category"),
    newsEvent: f.newsEvent,
    implication: f.implication ?? "new priorities",
    area: f.area ?? inferredArea,
  };

  const best = pickBestSignal(input.signals);
  if (best) {
    const angle: SignalAngle | undefined = SIGNAL_ANGLES[best.type];
    if (angle) {
      const line = fillTemplate(angle.angleTemplate, vars, input.companyName);
      const question = fillTemplate(angle.questionSeed, vars, input.companyName);
      return {
        signalUsed: best.title,
        angle: best.type,
        methodology: methodology.name,
        maxWords: methodology.maxWords,
        opener: `${line} ${question}`.trim(),
        businessImplication: angle.businessImplication,
        guardrails: methodology.whatNotToDo,
        cta: methodology.ctaType,
      };
    }
  }

  // No usable signal — fall back to the methodology's example shape,
  // grounded in the company + product rather than a trigger.
  const fallback = fillTemplate(methodology.exampleOpener, vars, input.companyName);
  return {
    signalUsed: null,
    angle: null,
    methodology: methodology.name,
    maxWords: methodology.maxWords,
    opener: fallback,
    businessImplication: null,
    guardrails: methodology.whatNotToDo,
    cta: methodology.ctaType,
  };
}
