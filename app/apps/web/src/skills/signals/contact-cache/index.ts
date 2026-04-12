import type { SkillDefinition } from "@/skills/types";
import { contactCacheInputSchema, contactCacheOutputSchema } from "./schema";
import { contactCacheHandler } from "./handler";

export const contactCacheSkill: SkillDefinition = {
  slug: "contact-cache",
  name: "Contact Cache",
  category: "signals",
  description:
    "Deduplication cache for contacts — check if a contact already exists (by email or LinkedIn URL), prevent duplicate outreach, and track outreach status lifecycle (new -> qualified -> contacted -> replied -> converted).",
  costEstimate: "Free (DB queries only)",
  inputSchema: contactCacheInputSchema,
  outputSchema: contactCacheOutputSchema,
  handler: contactCacheHandler,
};
