import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { buildStakeholderMap } from "@/lib/analysis/stakeholder-map";

export function buildStakeholderTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    mapDealStakeholders: makeTool({
      description:
        "Map all stakeholders in a deal and classify their roles (champion, economic buyer, technical evaluator, coach, blocker, end user) based on interaction patterns. " +
        "Shows engagement scores, sentiment, influence level, coverage gaps, and a recommended strategy. " +
        "Use when the user asks 'who are the stakeholders', 'map the buying committee', 'who's involved in this deal', " +
        "'deal org chart', 'who's the champion', 'who's blocking this deal', or 'stakeholder analysis'.",
      inputSchema: z.object({
        dealId: z.string().describe("The deal/opportunity ID to map stakeholders for"),
      }),
      execute: async (input) => {
        const map = await buildStakeholderMap(input.dealId, tenantId);

        if (map.stakeholders.length === 0) {
          return {
            dealId: map.dealId,
            stakeholders: [],
            coverage: map.coverage,
            gaps: map.gaps,
            strategy: map.strategy,
            message: "No stakeholders found. Link contacts or a company to this deal first.",
          };
        }

        return {
          dealId: map.dealId,
          stakeholderCount: map.stakeholders.length,
          stakeholders: map.stakeholders.map((s) => ({
            contactId: s.contactId,
            name: s.name,
            title: s.title,
            role: s.role,
            confidence: `${Math.round(s.confidence * 100)}%`,
            engagementScore: s.engagementScore,
            sentiment: s.sentiment,
            influence: s.influence,
            lastInteraction: s.lastInteraction || "none",
            signals: s.signals,
            recommendedAction: s.recommendedAction,
          })),
          coverage: map.coverage,
          gaps: map.gaps,
          strategy: map.strategy,
        };
      },
    }),
  };
}
