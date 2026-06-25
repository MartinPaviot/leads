/**
 * Eval Flywheel — Background jobs for continuous self-improvement.
 *
 * Implements Anthropic's flywheel pattern via Inngest cron jobs:
 *
 * 1. Every hour:  Scan failed traces → create regression eval cases
 * 2. Every 6h:    Analyze failure patterns → refine prompts → activate if better
 * 3. Every 6h:    Curate few-shot examples from best outputs
 * 4. On-demand:   Run full flywheel cycle for a specific agent
 * 5. On trace:    Online eval sampling (async quality scoring)
 */

import { inngest } from "./client";
import { db } from "@/db";
import { agentTraces, tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  processRecentFailures,
  runFlywheelCycle,
} from "@/lib/evals/flywheel";
import { onlineEval } from "@/lib/agents/corrections";
import { AGENT_REGISTRY } from "@/lib/observability/observability";

// ─── 1. Hourly: Failures → Eval Cases ───────────────────────

export const cronFailureToEvalCases = inngest.createFunction(
  {
    id: "cron-failure-to-eval-cases",
    name: "Flywheel: Failures → Eval Cases",
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }: { step: any }) => {
    const allTenants = await step.run("get-tenants", async () => {
      return db.select({ id: tenants.id }).from(tenants);
    });

    const since = new Date(Date.now() - 60 * 60 * 1000); // last hour
    const results: Array<{ tenantId: string; processed: number; newCases: number }> = [];

    for (const tenant of allTenants) {
      const result = await step.run(`process-failures-${tenant.id}`, async () => {
        return processRecentFailures(tenant.id, since);
      });
      results.push({ tenantId: tenant.id, ...result });
    }

    const totalNew = results.reduce((s: number, r: any) => s + r.newCases, 0);
    return {
      tenantsProcessed: allTenants.length,
      totalFailuresScanned: results.reduce((s: number, r: any) => s + r.processed, 0),
      totalNewEvalCases: totalNew,
      details: results.filter((r) => r.newCases > 0),
    };
  }
);

// ─── 2. Weekly: Full Flywheel Cycle ─────────────────────────

export const cronFlywheelCycle = inngest.createFunction(
  {
    id: "cron-flywheel-cycle",
    name: "Flywheel: Pattern Analysis + Prompt Refinement",
    retries: 1,
    // Weekly (was every 6h). The cycle loops over every tenant x LLM agent on
    // Sonnet (pattern-analysis + prompt-refinement + eval-case regeneration);
    // the 6h cadence re-ran the whole mesh 28x/week for marginal prompt deltas.
    // Weekly preserves the optimization signal at a fraction of the spend.
    triggers: [{ cron: "TZ=UTC 0 2 * * 1" }],
  },
  async ({ step }: { step: any }) => {
    const allTenants = await step.run("get-tenants", async () => {
      return db.select({ id: tenants.id }).from(tenants);
    });

    // Only run flywheel for agents that use LLMs
    const llmAgents = Object.values(AGENT_REGISTRY).filter(
      (a) => a.evalSampleRate > 0 && a.maxCostPerCall > 0
    );

    const results: Array<{
      agentId: string;
      tenantId: string;
      patterns: number;
      promptRefined: boolean;
      promptActivated: boolean;
    }> = [];

    for (const tenant of allTenants) {
      for (const agent of llmAgents) {
        const result = await step.run(
          `flywheel-${agent.id}-${tenant.id}`,
          async () => {
            try {
              return await runFlywheelCycle(agent.id, tenant.id);
            } catch (err) {
              console.error(`[FLYWHEEL] Error for ${agent.id}:`, err);
              return {
                failures: { processed: 0, newCases: 0 },
                patterns: 0,
                fewShot: { added: 0, pruned: 0 },
                promptRefined: false,
                promptActivated: false,
              };
            }
          }
        );

        results.push({
          agentId: agent.id,
          tenantId: tenant.id,
          patterns: result.patterns,
          promptRefined: result.promptRefined,
          promptActivated: result.promptActivated,
        });
      }
    }

    return {
      agentsProcessed: results.length,
      promptsRefined: results.filter((r: any) => r.promptRefined).length,
      promptsActivated: results.filter((r: any) => r.promptActivated).length,
      patternsFound: results.reduce((s: number, r: any) => s + r.patterns, 0),
      details: results.filter((r: any) => r.patterns > 0 || r.promptRefined),
    };
  }
);

// ─── 3. On-demand: Run flywheel for specific agent ──────────

export const runAgentFlywheel = inngest.createFunction(
  {
    id: "run-agent-flywheel",
    name: "Flywheel: Run for Specific Agent",
    retries: 1,
    triggers: [{ event: "eval/flywheel-requested" }],
  },
  async ({ event, step }: { event: { data: { agentId: string; tenantId: string } }; step: any }) => {
    const { agentId, tenantId } = event.data;

    const result = await step.run("run-flywheel", async () => {
      return runFlywheelCycle(agentId, tenantId);
    });

    return result;
  }
);

// ─── 4. On trace: Async online eval sampling ────────────────

export const asyncOnlineEval = inngest.createFunction(
  {
    id: "async-online-eval",
    name: "Flywheel: Online Eval Sampling",
    retries: 1,
    triggers: [{ event: "eval/trace-created" }],
  },
  async ({ event, step }: { event: { data: { traceId: string; agentId: string; input: string; output: string; context?: string } }; step: any }) => {
    const { traceId, agentId, input, output, context } = event.data;

    const evalResult = await step.run("run-online-eval", async () => {
      return onlineEval(agentId, input, output, context);
    });

    if (evalResult) {
      // Update the trace with the eval score
      await step.run("update-trace", async () => {
        await db.update(agentTraces)
          .set({ evalScore: evalResult.score })
          .where(eq(agentTraces.id, traceId));
      });

      // If score is very low, immediately create an eval case
      if (evalResult.score < 0.4) {
        await step.run("create-regression-case", async () => {
          const { failureToEvalCase } = await import("@/lib/evals/flywheel");
          const [trace] = await db.select().from(agentTraces)
            .where(eq(agentTraces.id, traceId)).limit(1);
          if (trace?.tenantId) {
            await failureToEvalCase(traceId, trace.tenantId);
          }
        });
      }
    }

    return { traceId, evalResult };
  }
);
