import type { SkillDefinition } from "@/skills/types";
import { investorOverlapInputSchema, investorOverlapOutputSchema } from "./schema";
import { investorOverlapHandler } from "./handler";

export const investorOverlapSkill: SkillDefinition = {
  slug: "investor-overlap",
  name: "Investor Overlap Signal",
  category: "signals",
  description:
    "Flag target accounts that share any investor with the tenant's own cap table. Produces the 'Common Investor?' boolean + warm-intro shortlist. Depends on `companyInvestors` in TenantSettings plus existing company enrichment (Apollo funding_rounds or user-entered investors).",
  costEstimate: "Free (no external API calls — pure DB + settings join)",
  inputSchema: investorOverlapInputSchema,
  outputSchema: investorOverlapOutputSchema,
  handler: investorOverlapHandler,
};
