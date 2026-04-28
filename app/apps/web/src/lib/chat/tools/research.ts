import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { buildDossier } from "@/lib/research/dossier-builder";

export function buildResearchTools(ctx: ToolContext) {
  const { tenantId } = ctx;

  return {
    buildCompanyDossier: makeTool({
      description: `Build a comprehensive research dossier for a company. Given a company name or domain, this tool gathers: company basics (industry, size, revenue), leadership (executives with titles), funding history, tech stack, hiring signals, competitive landscape, ICP fit score, and recommended outreach approach. Use when the user asks to "research a company", "build a dossier", "tell me about [company]", "prepare intel on [company]", "who are the key people at [company]", or "should I reach out to [company]".`,
      inputSchema: z.object({
        companyNameOrDomain: z
          .string()
          .describe(
            "Company name (e.g. 'Stripe') or domain (e.g. 'stripe.com')",
          ),
      }),
      execute: async (input) => {
        try {
          const dossier = await buildDossier(
            input.companyNameOrDomain,
            tenantId,
          );

          return {
            dossier,
            summary: {
              company: dossier.company.name,
              industry: dossier.company.industry,
              size: dossier.company.size,
              icpFitScore: dossier.icpFit.score,
              leadershipCount: dossier.leadership.length,
              hasFunding: !!dossier.funding,
              techStackCount: dossier.techStack.length,
              hiringSignalCount: dossier.hiringSignals.length,
            },
          };
        } catch (err) {
          return {
            error: `Failed to build dossier: ${String(err)}`,
            suggestion:
              "Try providing the company's domain name (e.g. stripe.com) for better results.",
          };
        }
      },
    }),
  };
}
