/**
 * Sales moment — the copilot's situational awareness, COMPUTED not configured.
 *
 * A founder never tells Elevay what kind of call this is; the copilot derives
 * the moment from the deal's real state (stage, meetings, activity, lifecycle),
 * the same derive-at-read discipline as lib/accounts/lifecycle-stage.ts. The
 * user never sees this taxonomy — it only selects which moment-specific prep,
 * coaching, and objections surface. If the read is wrong, the user corrects it
 * in plain language in chat (a momentHint), which persists as the deal's
 * `properties.momentOverride`. There is no picker, toggle, or mode control.
 *
 * Precedence (one rule): NL override > computed-from-signals > safe default.
 * On ambiguity or no signal it returns a generic-safe moment with low
 * confidence — never a confidently-specialized wrong one.
 */

export const MOMENTS = [
  "outbound",
  "cold_call",
  "discovery",
  "demo",
  "proposal",
  "close",
  "expansion",
] as const;

export type Moment = (typeof MOMENTS)[number];

/** Sentinel accepted by the override writer to clear the manual override. */
export const MOMENT_AUTO = "auto";

/**
 * Normalize free-form input ("Discovery", "cold call", " COLD-CALL ") to a
 * canonical moment. Returns "auto" for the clear-override sentinel, null for
 * anything invalid. Never throws — invalid hints are simply ignored upstream.
 */
export function normalizeMoment(
  input: string,
): Moment | typeof MOMENT_AUTO | null {
  const v = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v === MOMENT_AUTO) return MOMENT_AUTO;
  return (MOMENTS as readonly string[]).includes(v) ? (v as Moment) : null;
}

export interface MomentSignals {
  /** deal.properties.momentOverride, set from a chat NL correction. Top precedence. */
  override?: string | null;
  /** Live Call Mode dial. */
  liveCallMode?: boolean;
  hasDeal: boolean;
  /** deal_stage enum value: lead|qualification|demo|trial|proposal|negotiation|won|lost */
  dealStage?: string | null;
  /** Effective account lifecycle (deriveLifecycleStage): customer → expansion. */
  lifecycleStage?: string | null;
  /** A demo meeting already exists in the deal's activity. */
  hasDemoActivity?: boolean;
  /** activity metadata.meetingType: intro|qualification|deep_dive|follow_up. */
  lastMeetingType?: string | null;
}

export interface DerivedMoment {
  moment: Moment;
  confidence: "high" | "low";
  /** The deciding signal, for traceability and the legible heading. */
  source: string;
}

/** Funnel order — used only by the conflict guard to pick the later moment. */
const MOMENT_ORDER: readonly Moment[] = MOMENTS;

function isEarlierThan(a: Moment, b: Moment): boolean {
  return MOMENT_ORDER.indexOf(a) < MOMENT_ORDER.indexOf(b);
}

/** Deal stage → moment. Stages with no active prep (won/lost) return null. */
const STAGE_MOMENT: Readonly<Record<string, Moment>> = {
  lead: "outbound",
  qualification: "discovery",
  demo: "demo",
  trial: "demo", // PoC in progress sits with the demo-stage motion (prove the gap closes)
  proposal: "proposal",
  negotiation: "close",
};

function stageToMoment(stage: string): Moment | null {
  return STAGE_MOMENT[stage] ?? null;
}

/**
 * Pure derivation — no DB, no LLM, no I/O. Mirrors the precedence philosophy of
 * deriveLifecycleStage. Callers assemble MomentSignals from facts they already
 * hold (the deal row, the meeting, the lifecycle SQL).
 */
export function deriveMoment(s: MomentSignals): DerivedMoment {
  // 1. NL override wins (set from a chat correction; "auto"/invalid → ignored).
  if (s.override) {
    const o = normalizeMoment(s.override);
    if (o && o !== MOMENT_AUTO) {
      return { moment: o, confidence: "high", source: "override" };
    }
  }

  // 2. Live cold dial with no deal yet.
  if (s.liveCallMode && !s.hasDeal) {
    return { moment: "cold_call", confidence: "high", source: "live-cold" };
  }

  // 3. Existing customer → expansion.
  if ((s.lifecycleStage ?? "").trim().toLowerCase() === "customer") {
    return { moment: "expansion", confidence: "high", source: "lifecycle-customer" };
  }

  const stageMoment = stageToMoment((s.dealStage ?? "").trim().toLowerCase());

  // 4. Conflict guard: a demo already happened but the stage points earlier
  //    (or nowhere). Prefer the LATER moment, flagged low so consumers can fall
  //    back to generic rather than trust a confidently-wrong specialization.
  if (s.hasDemoActivity && (stageMoment === null || isEarlierThan(stageMoment, "demo"))) {
    return { moment: "demo", confidence: "low", source: "conflict-later" };
  }

  // 5. Plain stage map.
  if (stageMoment) {
    return { moment: stageMoment, confidence: "high", source: "deal-stage" };
  }

  // 6. No usable signal → the safe "we have a meeting" default.
  return { moment: "discovery", confidence: "low", source: "no-signal" };
}
