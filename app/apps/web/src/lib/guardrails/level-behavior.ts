/**
 * CLE-16 — Autonomy level behaviour SSOT (pure: table, copy, relaxed map,
 * hard exclusion, clamp, trust floors).
 *
 * This module adds ZERO decision logic to the core. It is the pure layer the
 * background callers fold level/trust/relaxation through BEFORE calling
 * `decideAction`: the rich (level → mode, relaxThresholds, learned, static)
 * surface collapses into the one `Record<GuardedAction, number>` the core
 * already knows how to read (`extra.learnedThresholds`). No DB, no IO, no PII.
 *
 * The HARD RULE (money / destructive / outbound never auto-execute) is enforced
 * three independent ways, any one sufficient (design §3.3):
 *   1. The core refuses paid/destructive/outbound ABOVE the threshold gate
 *      (`decide-action.ts`, CLE-10 §2.1) — primary.
 *   2. The learner writes NO low key for excluded classes
 *      (`recalculateThresholds` skip — design §3.2).
 *   3. `buildEffectiveThresholdMap` forces excluded classes to the CEILING in
 *      the injected map, so even a stale/forged learned key or a future core
 *      reordering cannot read a low bar for them.
 */

import { HIGH_CONFIDENCE_THRESHOLDS, type GuardedAction } from "@/lib/guardrails/approval-mode";
import type { AutonomyLevel } from "@/lib/campaign-engine/types";

const FLOOR = 0.5;
const CEILING = 1.0;

/**
 * Classes the learner may NEVER lower the bar for. These map to action classes
 * the core ALREADY refuses to auto-execute (paid / destructive / outbound) —
 * CLE-10 §2.1. Excluding them from learning is belt-and-braces: even if a
 * future core refactor reordered the arms, no LOW learned key exists to be
 * read. (AC-4..7)
 *
 * NB on the GuardedAction set: the three outbound verbs are the only
 * `GuardedAction`s that are outbound/irreversible. `deal-stage-change` is
 * reversible (it MAY learn; the core cards it as confirm:"risky" anyway).
 * Destructive/paid actions have no `GuardedAction` key, so they are unreachable
 * by the learner in the first place.
 */
export const HARD_EXCLUDED_ACTIONS: ReadonlySet<GuardedAction> = new Set<GuardedAction>([
  "email-send", // outbound
  "email-reply", // outbound
  "sequence-enrollment", // outbound + irreversible (static 1.1 = never-auto already)
]);

/**
 * Relaxed thresholds for strategic (trust >= 80). Lower than static, but
 * FLOOR-bounded. Only non-excluded reversible classes appear; excluded classes
 * are absent so even strategic cannot relax an outbound/paid bar. (AC-8)
 */
export const STRATEGIC_RELAXED_THRESHOLDS: Partial<Record<GuardedAction, number>> = {
  "contact-create": 0.6,
  "contact-update": 0.6,
  "task-create": 0.55,
  "deal-stage-change": 0.8, // still high; risky-class, cards anyway
};

/**
 * Clamp a threshold into [FLOOR, CEILING]. A non-finite value (NaN, ±Infinity)
 * fails safe to the HARDEST bar (CEILING) so a corrupt/hand-edited learned
 * value can never WIDEN autonomy. (EC-5 / AC-22)
 */
export function clampThreshold(v: number): number {
  if (!Number.isFinite(v)) return CEILING;
  return Math.max(FLOOR, Math.min(CEILING, v));
}

/**
 * The map CLE-16 INJECTS into `decideAction`'s `extra.learnedThresholds`, per
 * resolve. The caller has ALREADY resolved level → (mode, relaxThresholds) via
 * `resolveEffectiveMode` (CLE-10); this collapses the relaxation richness into
 * the one map the core reads:
 *   - excluded classes → CEILING (so even if the core read them it would demand
 *     confidence >= 1.0; and it won't, because outbound/paid/destructive
 *     short-circuit to `confirm` above the threshold gate). (AC-6 / EC-8)
 *   - non-excluded classes → relaxed (if strategic+trust) ?? learned ?? static,
 *     then clamped to [FLOOR, CEILING] at READ time (EC-5).
 */
export function buildEffectiveThresholdMap(args: {
  learned?: Record<string, number>; // tenant_settings.learnedThresholds
  relaxThresholds: boolean; // from resolveEffectiveMode (CLE-10)
}): Record<GuardedAction, number> {
  const out = {} as Record<GuardedAction, number>;
  for (const action of Object.keys(HIGH_CONFIDENCE_THRESHOLDS) as GuardedAction[]) {
    if (HARD_EXCLUDED_ACTIONS.has(action)) {
      out[action] = CEILING; // AC-6 / AC-7 / EC-8
      continue;
    }
    const relaxed = args.relaxThresholds ? STRATEGIC_RELAXED_THRESHOLDS[action] : undefined;
    const learned = args.learned?.[action];
    const chosen = relaxed ?? learned ?? HIGH_CONFIDENCE_THRESHOLDS[action];
    out[action] = clampThreshold(chosen); // EC-5 read-clamp
  }
  return out;
}

/**
 * ONE source of truth for what each level DOES, derived from the §3.1 table.
 * The UI renders these strings; the copy-match test asserts the shipped UI
 * uses THIS map — so marketing copy can never drift from real behaviour.
 * (AC-16 / AC-17)
 *
 * Honest by construction: outbound ALWAYS confirms at every level (the HARD
 * RULE), so no copy claims auto-send. copilot and guided are identical on the
 * disposition axis by design (CLE-10 maps both to review-each); the
 * copilot/guided difference lives in the campaign-engine send-policy axis
 * (out of CLE-16 scope) — the copy says so rather than over-promising.
 */
export const LEVEL_BEHAVIOR: Record<AutonomyLevel, { label: string; behavior: string }> = {
  copilot: {
    label: "Copilot",
    behavior: "I approve everything before it happens.",
  },
  guided: {
    label: "Guided",
    behavior:
      "Same as Copilot for actions — every change and every send waits for your approval. (Send timing/policy is set under Guardrails.)",
  },
  autonomous: {
    label: "Autonomous",
    behavior:
      "Auto-runs safe, reversible changes it is confident about (e.g. updating a contact, creating a task). Always asks before sending email, anything irreversible, or anything that costs money.",
  },
  strategic: {
    label: "Strategic",
    behavior:
      "Like Autonomous, but more willing to act on reversible changes once your trust score is 80+. Still always asks before sends, irreversible changes, or spending.",
  },
};

/**
 * The minimum `getTrustScore().overall` (0–100, the systemTrustScore gate
 * score) required to SET each level. Deliberately mirrors `suggestedLevel`'s
 * thresholds (`campaign-engine/trust-score.ts`: 65→guided, 80→autonomous) and
 * the route's pre-existing strategic-80 rule, so "suggested" and "allowed" can
 * never contradict. Downgrades are never gated (the route only refuses RAISING
 * above an unearned floor). (AC-11 / §4.3)
 */
const TRUST_FLOOR: Record<AutonomyLevel, number> = {
  copilot: 0,
  guided: 50,
  autonomous: 65,
  strategic: 80,
};

export function requiredTrustForLevel(level: AutonomyLevel): number {
  return TRUST_FLOOR[level] ?? 0;
}
