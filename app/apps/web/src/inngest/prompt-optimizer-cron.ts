/**
 * Prompt Optimizer Cron — Weekly self-improvement cycle.
 *
 * Runs every Sunday at 03:00 UTC. Triggers the evaluator-optimizer
 * loop for each LLM agent that has eval data:
 *
 * 1. Analyze failure patterns from the past 7 days
 * 2. Generate targeted prompt patches for top failure clusters
 * 3. Validate patches against golden cases
 * 4. Create canary prompt versions for validated patches
 *
 * The canary system (prompt-canary.ts) handles gradual rollout.
 * After 48h, the flywheel cron (eval-functions.ts) evaluates
 * canary performance and promotes or rejects.
 */

import { inngest } from "./client";
import { AGENT_REGISTRY } from "@/lib/observability";
import { runOptimizationCycle } from "@/lib/prompt-optimizer/optimizer";
import logger from "@/lib/logger";

// ── Weekly Optimization Cron ──────────────────────────────────

export const weeklyPromptOptimizer = inngest.createFunction(
  {
    id: "weekly-prompt-optimizer",
    name: "Prompt Optimizer: Weekly Self-Improvement Cycle",
    retries: 1,
    triggers: [{ cron: "0 3 * * 0" }], // Every Sunday at 03:00 UTC
  },
  async ({ step }: { step: any }) => {
    // Only optimize agents that use LLMs and have online eval enabled
    const eligibleAgents = Object.values(AGENT_REGISTRY).filter(
      (a) => a.evalSampleRate > 0 && a.maxCostPerCall > 0,
    );

    const results: Array<{
      agentId: string;
      clustersFound: number;
      patchesGenerated: number;
      patchesValidated: number;
      canaryCreated: boolean;
    }> = [];

    for (const agent of eligibleAgents) {
      const result = await step.run(
        `optimize-${agent.id}`,
        async () => {
          try {
            return await runOptimizationCycle(agent.id);
          } catch (err) {
            logger.error("[PROMPT-OPTIMIZER-CRON] Cycle failed", {
              agentId: agent.id,
              err: err instanceof Error ? err.message : String(err),
            });
            return {
              clustersFound: 0,
              patchesGenerated: 0,
              patchesValidated: 0,
              canaryCreated: false,
            };
          }
        },
      );

      results.push({ agentId: agent.id, ...result });
    }

    const summary = {
      agentsProcessed: results.length,
      totalClusters: results.reduce((s, r) => s + r.clustersFound, 0),
      totalPatchesGenerated: results.reduce((s, r) => s + r.patchesGenerated, 0),
      totalPatchesValidated: results.reduce((s, r) => s + r.patchesValidated, 0),
      canariesCreated: results.filter((r) => r.canaryCreated).length,
      details: results.filter(
        (r) => r.clustersFound > 0 || r.canaryCreated,
      ),
    };

    logger.info("[PROMPT-OPTIMIZER-CRON] Weekly cycle complete", summary);
    return summary;
  },
);
