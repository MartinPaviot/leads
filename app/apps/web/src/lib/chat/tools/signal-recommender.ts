/**
 * Chat/agent tool — recommend which buying signals THIS workspace should track,
 * ranked by TAM coverage × the prior/learned outcome multiplier (pillar 1). The
 * agent can then one-click stand up a search monitor (createSearchMonitor) for a
 * recommended signal. Read-only (query group).
 */
import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { recommendSignals } from "@/lib/signals/recommend-signals";

export function buildSignalRecommenderTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    recommendSignals: makeTool({
      description:
        "Recommend which buying signals THIS workspace should track, ranked by how often each fires across your accounts (TAM coverage) × how strongly it correlates with wins (a B2B prior, or learned once you have >=10 closed deals). Use when the user asks 'which signals should I track / watch / prioritize', 'what signals matter for my ICP', 'help me decide what to monitor'. Returns each signal with its rationale, the coverage in your TAM, whether the weight is a prior or learned, and the next step to start collecting it (often: create a search monitor).",
      inputSchema: z.object({
        limit: z.number().int().positive().max(20).optional().describe("How many signals to return (default 8)"),
      }),
      execute: async (input) => {
        const r = await recommendSignals(tenantId, { limit: input.limit });
        return {
          ok: true,
          accountsProfiled: r.totalAccounts,
          outcomesLearned: r.outcomesLearned,
          weighting: r.outcomesLearned >= 10 ? "learned from your closed deals" : "B2B priors (will switch to learned after ~10 closed deals)",
          icpIndustries: r.icpIndustries,
          recommendations: r.recommendations.map((s) => ({
            signal: s.label,
            type: s.type,
            why: s.rationale,
            weight: s.multiplier,
            weightSource: s.multiplierSource,
            coverage: s.coverage ? `${s.coverage.count} of ${s.coverage.total} accounts (${Math.round(s.coverage.pct * 100)}%)` : "not yet collected",
            nextStep: s.action,
          })),
          note: "Stand up a daily monitor for any of these with createSearchMonitor — it sources net-new matches and (for hiring) records the signal so they rank higher for the autopilot.",
        };
      },
    }),
  };
}
