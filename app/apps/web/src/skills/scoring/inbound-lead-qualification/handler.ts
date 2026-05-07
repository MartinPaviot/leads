import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { scoreContact } from "@/lib/scoring/contact-scoring";
import { getGrade } from "@/lib/scoring/scoring";
import { getSkillKnowledge } from "@/skills/skill-knowledge";
import type { SkillRunOptions } from "@/skills/types";
import type { InboundLeadQualificationInput, InboundLeadQualificationOutput } from "./schema";

function determinePriority(score: number, source: string): "hot" | "warm" | "nurture" | "disqualified" {
  // Demo requests and referrals get a boost
  const sourceBoost = ["demo_request", "referral", "trial"].includes(source) ? 15 : 0;
  const adjustedScore = score + sourceBoost;

  if (adjustedScore >= 60) return "hot";
  if (adjustedScore >= 40) return "warm";
  if (adjustedScore >= 20) return "nurture";
  return "disqualified";
}

function recommendAction(priority: "hot" | "warm" | "nurture" | "disqualified", source: string): string {
  switch (priority) {
    case "hot":
      return source === "demo_request"
        ? "Schedule demo within 24 hours — high-intent inbound"
        : "Assign to AE immediately — qualified and engaged";
    case "warm":
      return "Enroll in nurture sequence, schedule follow-up in 3 days";
    case "nurture":
      return "Add to long-term nurture campaign, monitor for engagement signals";
    case "disqualified":
      return "Send polite disqualification email, add to newsletter list";
  }
}

export async function inboundLeadQualificationHandler(
  input: InboundLeadQualificationInput,
  options: SkillRunOptions,
): Promise<InboundLeadQualificationOutput> {
  // Fetch the contact + retrieve knowledge in parallel
  const [[contact], knowledgeBlock] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, input.contactId), eq(contacts.tenantId, options.tenantId))),
    getSkillKnowledge("inbound lead qualification ideal customer profile priority routing", options.tenantId),
  ]);

  if (!contact) throw new Error(`Contact ${input.contactId} not found`);

  // Check for duplicates (same email, different contact)
  let isDuplicate = false;
  let existingContactId: string | null = null;

  if (contact.email) {
    const [existing] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(
        eq(contacts.email, contact.email),
        eq(contacts.tenantId, options.tenantId),
        ne(contacts.id, input.contactId),
      ))
      .limit(1);

    if (existing) {
      isDuplicate = true;
      existingContactId = existing.id;
    }
  }

  // Score the contact
  const result = await scoreContact(contact.id, options.tenantId, input.icpSettings);
  const { grade } = getGrade(result.score);

  // Determine priority based on score + source
  const priority = determinePriority(result.score, input.source);
  const qualified = priority === "hot" || priority === "warm";
  const recommendedAction = recommendAction(priority, input.source);

  // Fetch company name
  let companyName: string | null = null;
  if (contact.companyId) {
    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, contact.companyId));
    companyName = company?.name ?? null;
  }

  const contactName = contact.firstName && contact.lastName
    ? `${contact.firstName} ${contact.lastName}`
    : contact.firstName || contact.lastName || null;

  return {
    contactId: input.contactId,
    contactName,
    companyName,
    source: input.source,
    score: result.score,
    grade,
    qualified,
    priority,
    reasons: result.reasons,
    recommendedAction,
    isDuplicate,
    existingContactId,
    knowledgeContext: knowledgeBlock,
  };
}
