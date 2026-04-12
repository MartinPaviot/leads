import type { SkillDefinition } from "@/skills/types";
import { championTrackerInputSchema, championTrackerOutputSchema } from "./schema";
import { championTrackerHandler } from "./handler";

export const championTrackerSkill: SkillDefinition = {
  slug: "champion-tracker",
  name: "Champion Tracker",
  category: "signals",
  description:
    "Track product champions for job changes by re-enriching contacts via Apollo. Detects company changes (high signal — reach out immediately) and title changes (medium — re-engage). Auto-updates contact records.",
  costEstimate: "1 Apollo credit per contact re-enrichment",
  inputSchema: championTrackerInputSchema,
  outputSchema: championTrackerOutputSchema,
  handler: championTrackerHandler,
};
