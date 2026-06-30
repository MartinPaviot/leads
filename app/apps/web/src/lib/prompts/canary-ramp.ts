/**
 * Canary ramp — the missing close of the prompt-canary loop.
 *
 * The optimizer ships an eval-gated prompt change as a canary at a small
 * initial percent (prompt-canary.ts + prompt-optimizer), but nothing ever
 * advanced it: `promoteCanary` had ZERO callers and `setCanaryPercent`
 * fired only once at creation. So a canary served a fixed traffic slice
 * forever, never reaching 100% and never rolling back. This is the ramp.
 *
 * A canary already cleared the offline eval bar at creation (it scored
 * better than the stable it shadows). This job advances that proven
 * candidate one rung per run (10 → 25 → 50 → 100 → promote) and rolls a
 * canary back the moment its recorded eval score sits below stable's.
 * Runs weekly off the back of the flywheel cron.
 */

import { db } from "@/db";
import { agentPromptVersions } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { setCanaryPercent, promoteCanary, rollbackCanary } from "./prompt-canary";
import logger from "../observability/logger";

/** Traffic rungs a canary climbs, one per run, before promotion. */
export const CANARY_LADDER = [10, 25, 50, 100] as const;

/** The next rung strictly above `current` (caps at 100). Pure. */
export function nextCanaryPercent(current: number): number {
  for (const step of CANARY_LADDER) {
    if (step > current) return step;
  }
  return 100;
}

export type CanaryDecision =
  | { action: "ramp"; nextPercent: number }
  | { action: "promote" }
  | { action: "rollback" }
  | { action: "hold"; reason: string };

/**
 * Decide what to do with an agent's canary from the recorded eval scores
 * (set when each version was evaluated). Pure:
 *  - no canary eval score yet → hold (nothing to judge on);
 *  - canary scored below stable → roll back (it regressed);
 *  - canary holding/better and already at full traffic → promote;
 *  - otherwise → advance one rung.
 */
export function decideCanaryAction(
  canary: { canaryPercent: number; evalScore: number | null },
  stable: { evalScore: number | null } | undefined,
): CanaryDecision {
  if (canary.evalScore == null) {
    return { action: "hold", reason: "canary has no eval score yet" };
  }
  const stableScore = stable?.evalScore ?? 0;
  if (canary.evalScore < stableScore) {
    return { action: "rollback" };
  }
  if (canary.canaryPercent >= 100) {
    return { action: "promote" };
  }
  return { action: "ramp", nextPercent: nextCanaryPercent(canary.canaryPercent) };
}

export interface RampResult {
  ramped: number;
  promoted: number;
  rolledBack: number;
  held: number;
}

/**
 * Advance / promote / roll back every active canary across all agents.
 * Canary versions are agent-scoped (not per-tenant), so this runs once
 * per cycle. No-op when there are no canaries.
 */
export async function rampCanaries(): Promise<RampResult> {
  const canaries = await db
    .select()
    .from(agentPromptVersions)
    .where(
      and(eq(agentPromptVersions.isActive, true), gt(agentPromptVersions.canaryPercent, 0)),
    );

  const result: RampResult = { ramped: 0, promoted: 0, rolledBack: 0, held: 0 };

  for (const canary of canaries) {
    const [stable] = await db
      .select({ evalScore: agentPromptVersions.evalScore })
      .from(agentPromptVersions)
      .where(
        and(
          eq(agentPromptVersions.agentId, canary.agentId),
          eq(agentPromptVersions.isActive, true),
          eq(agentPromptVersions.canaryPercent, 0),
        ),
      )
      .limit(1);

    const decision = decideCanaryAction(canary, stable);
    switch (decision.action) {
      case "ramp":
        await setCanaryPercent(canary.id, decision.nextPercent);
        result.ramped++;
        break;
      case "promote":
        await promoteCanary(canary.id);
        result.promoted++;
        break;
      case "rollback":
        await rollbackCanary(canary.id);
        result.rolledBack++;
        break;
      case "hold":
        result.held++;
        break;
    }
  }

  if (canaries.length > 0) {
    logger.info("[CANARY-RAMP] cycle complete", { ...result });
  }
  return result;
}
