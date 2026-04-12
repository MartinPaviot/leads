import type { SkillDefinition } from "@/skills/types";
import { meetingBriefInputSchema, meetingBriefOutputSchema } from "./schema";
import { meetingBriefHandler } from "./handler";

export const meetingBriefSkill: SkillDefinition = {
  slug: "meeting-brief",
  name: "Meeting Brief",
  category: "intelligence",
  description:
    "Generate a comprehensive meeting preparation brief: person summary, company context, recent activity, buying signals, personalized talking points, objection handling, and discovery questions.",
  costEstimate: "~$0.05-0.10 per brief (LLM generation cost)",
  inputSchema: meetingBriefInputSchema,
  outputSchema: meetingBriefOutputSchema,
  handler: meetingBriefHandler,
};
