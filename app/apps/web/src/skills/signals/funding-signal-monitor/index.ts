import type { SkillDefinition } from "@/skills/types";
import { fundingSignalMonitorInputSchema, fundingSignalMonitorOutputSchema } from "./schema";
import { fundingSignalMonitorHandler } from "./handler";

export const fundingSignalMonitorSkill: SkillDefinition = {
  slug: "funding-signal-monitor",
  name: "Funding Signal Monitor",
  category: "signals",
  description:
    "Monitor companies for funding signals via Apollo enrichment. Detects new funding rounds by comparing current vs stored funding amounts. Flags target-stage companies with timing-based outreach recommendations.",
  costEstimate: "Free (Apollo org enrich)",
  inputSchema: fundingSignalMonitorInputSchema,
  outputSchema: fundingSignalMonitorOutputSchema,
  handler: fundingSignalMonitorHandler,
};
