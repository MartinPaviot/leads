/**
 * Action-policy CONSUMPTION — feed the agent-reactor's own outcome history
 * back into its next decision. `action_outcomes` records, per resolved
 * watcher, which trigger → action → outcome combination produced what
 * positivity. `getBestCombinations` aggregates it, but nothing read it:
 * the reactor chose actions blind to what had actually worked. This is
 * the missing consumer — it formats the workspace's best/worst combos
 * into a compact block that `buildDecisionUserPrompt` shows the LLM right
 * before it decides.
 *
 * Advisory only: it INFORMS the LLM's action choice. The approval-mode
 * guardrails in the reactor's dispatch step are untouched, so this can
 * never auto-execute an action the mode wouldn't already allow.
 *
 * Tenant-scoped. No-op ("") until enough outcomes accrue (cold-start) —
 * combos below MIN_COUNT observations are dropped as noise.
 */

import { getBestCombinations } from "./stats";

/** Ignore combos with too few observations to be a real signal. */
const MIN_COUNT = 3;
/** Cap injected rows for token economy. */
const MAX_ROWS = 10;

function fmtPositivity(n: number): string {
  return n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

/**
 * Build the "what's worked for this workspace" block for the reactor's
 * decision prompt. Surfaces combos for the current trigger first (most
 * relevant), then the rest, each already sorted by avg positivity. "" if
 * there is nothing with enough observations yet.
 */
export async function getActionPolicyBlock(
  tenantId: string,
  trigger?: string,
): Promise<string> {
  const combos = (await getBestCombinations(tenantId).catch(() => [])).filter(
    (c) => c.count >= MIN_COUNT,
  );
  if (combos.length === 0) return "";

  // Current trigger's combos first (most relevant), then the rest — each
  // already sorted by avg positivity within getBestCombinations.
  const forTrigger = trigger ? combos.filter((c) => c.triggerType === trigger) : [];
  const others = combos.filter((c) => c.triggerType !== trigger);
  const rows = [...forTrigger, ...others].slice(0, MAX_ROWS);
  if (rows.length === 0) return "";

  const lines = rows.map(
    (c) =>
      `- [${c.triggerType}] ${c.actionType} → ${c.outcomeType}: avg ${fmtPositivity(c.avgPositivity)} (${c.count} times)`,
  );

  return [
    "## What's worked for this workspace (your own outcome history)",
    "Past trigger → action → outcome by average result (positivity > 0.3 is good). Bias toward action choices with high averages and away from ones that historically led to low or negative outcomes. This is data, not an override — still apply the rules above and the approval guardrails decide what actually runs.",
    ...lines,
  ].join("\n");
}
