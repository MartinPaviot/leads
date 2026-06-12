import type { SkillDefinition } from "@/skills/types";
import { inboundLeadQualificationInputSchema, inboundLeadQualificationOutputSchema } from "./schema";
import { inboundLeadQualificationHandler } from "./handler";

export const inboundLeadQualificationSkill: SkillDefinition = {
  slug: "inbound-lead-qualification",
  name: "Inbound Lead Qualification",
  category: "scoring",
  description:
    "Qualify an inbound lead: stored ICP-profile fit, duplicate detection, priority (hot/warm/nurture/disqualified), and a recommended next action. Source-aware: demo requests get a priority boost.",
  costEstimate: "DB queries; small LLM cost on first run when ICP personas are configured (title resolution, cached)",
  inputSchema: inboundLeadQualificationInputSchema,
  outputSchema: inboundLeadQualificationOutputSchema,
  handler: inboundLeadQualificationHandler,
};
