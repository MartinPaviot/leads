import type { SkillDefinition } from "@/skills/types";
import { tamBuilderInputSchema, tamBuilderOutputSchema } from "./schema";
import { tamBuilderHandler } from "./handler";

export const tamBuilderSkill: SkillDefinition = {
  slug: "tam-builder",
  name: "TAM Builder",
  category: "enrichment",
  description:
    "Build a scored Total Addressable Market using Apollo Company Search. Discovers companies matching ICP, scores fit (0-100), assigns tiers (1/2/3), and auto-builds a persona watchlist for top-tier companies.",
  costEstimate: "Free (Apollo Company Search) + 1 credit per person enriched in watchlist",
  inputSchema: tamBuilderInputSchema,
  outputSchema: tamBuilderOutputSchema,
  handler: tamBuilderHandler,
};
