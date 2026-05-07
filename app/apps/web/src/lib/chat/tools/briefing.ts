import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { buildDealBrief, briefAllOpenDeals } from "@/lib/deals/deal-briefing";
import {
  buildEnrichedContext,
  formatEnrichedContextForPrompt,
} from "@/lib/context/enriched-prospect-context";

export function buildBriefingTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    briefAllDeals: makeTool({
      description: `Get a comprehensive briefing on all open deals in the pipeline. Returns structured briefs with: summary, key discussions, promises made, objections raised, stall reasons, and recommended next actions. Sorted by risk level (critical first). Use when user asks "brief me on my deals", "what's happening with my pipeline", "deal status", "update me on all deals", or "morning brief".`,
      inputSchema: z.object({
        maxDeals: z
          .number()
          .optional()
          .describe("Maximum deals to brief (default 20, max 50)"),
      }),
      execute: async (input) => {
        const briefs = await briefAllOpenDeals(tenantId, {
          maxDeals: Math.min(input.maxDeals ?? 20, 50),
        });

        if (briefs.length === 0) {
          return {
            message: "No open deals in the pipeline.",
            briefs: [],
            totalDeals: 0,
          };
        }

        // Compute summary stats
        const critical = briefs.filter((b) => b.riskLevel === "critical").length;
        const high = briefs.filter((b) => b.riskLevel === "high").length;
        const totalValue = briefs.reduce((sum, b) => sum + (b.value ?? 0), 0);

        return {
          totalDeals: briefs.length,
          totalValue,
          riskSummary: {
            critical,
            high,
            medium: briefs.filter((b) => b.riskLevel === "medium").length,
            low: briefs.filter((b) => b.riskLevel === "low").length,
          },
          briefs,
        };
      },
    }),

    briefDeal: makeTool({
      description: `Get a deep briefing on a single deal. More detailed than the multi-deal brief — includes full interaction excerpts and verbatim quotes. Use when user asks about a specific deal, "brief me on the Acme deal", "what's the status of deal X", or "deep dive on this opportunity".`,
      inputSchema: z.object({
        dealId: z.string().describe("The deal/opportunity ID to brief on"),
      }),
      execute: async (input) => {
        const brief = await buildDealBrief(input.dealId, tenantId);
        return brief;
      },
    }),

    getEnrichedContext: makeTool({
      description: `Get the full enriched context for a contact including extracted deal signals (objections, next steps, champion signals, budget mentions), knowledge graph facts, and recent email bodies with verbatim excerpts. Use when drafting a contextual follow-up, preparing for a meeting, or needing the full picture on a contact's interactions. More detailed than basic contact lookup.`,
      inputSchema: z.object({
        contactId: z.string().describe("Contact ID"),
        dealId: z
          .string()
          .optional()
          .describe("Optional deal ID to include deal-specific signals"),
      }),
      execute: async (input) => {
        const enriched = await buildEnrichedContext(
          input.contactId,
          tenantId,
          { dealId: input.dealId },
        );

        if (!enriched) {
          return { error: "Contact not found" };
        }

        return {
          contact: enriched.contact,
          company: enriched.company,
          signals: enriched.signals,
          extractedSignals: enriched.extractedSignals,
          graphFacts: enriched.graphFacts,
          recentEmailBodies: enriched.recentEmailBodies,
          formattedForPrompt: formatEnrichedContextForPrompt(enriched),
        };
      },
    }),
  };
}
