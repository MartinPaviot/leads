import type { SkillDefinition } from "@/skills/types";
import { expansionSignalSpotterInputSchema, expansionSignalSpotterOutputSchema } from "./schema";
import { expansionSignalSpotterHandler } from "./handler";

export const expansionSignalSpotterSkill: SkillDefinition = {
  slug: "expansion-signal-spotter",
  name: "Expansion Signal Spotter",
  category: "signals",
  description:
    "Monitor existing customers for upsell/cross-sell signals: new department engagement, positive sentiment trends, activity volume increases, headcount growth. Surfaces expansion opportunities with revenue impact.",
  costEstimate: "Free (DB queries only)",
  inputSchema: expansionSignalSpotterInputSchema,
  outputSchema: expansionSignalSpotterOutputSchema,
  handler: expansionSignalSpotterHandler,
};
