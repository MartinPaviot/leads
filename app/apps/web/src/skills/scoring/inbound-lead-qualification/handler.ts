import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, and, ne, isNull } from "drizzle-orm";
import { loadActiveIcps } from "@/lib/icp/fit-recompute-core";
import {
  hasContactScorableCriteria,
  scoreContactIcpBatch,
} from "@/lib/scoring/contact-icp-fit";
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

/**
 * Same contract as lead-qualification: the score quoted to chat is the
 * STORED ICP-fit score, refreshed through the shared lib — never a
 * private legacy recomputation (_specs/title-persona-fit R8). The
 * source-based priority boost stays a presentation-layer adjustment on
 * top of the stored fit.
 */
export async function inboundLeadQualificationHandler(
  input: InboundLeadQualificationInput,
  options: SkillRunOptions,
): Promise<InboundLeadQualificationOutput> {
  const [activeIcps, knowledgeBlock] = await Promise.all([
    loadActiveIcps(options.tenantId),
    getSkillKnowledge("inbound lead qualification ideal customer profile priority routing", options.tenantId),
  ]);

  if (hasContactScorableCriteria(activeIcps)) {
    await scoreContactIcpBatch(options.tenantId, [input.contactId], activeIcps);
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(
      eq(contacts.id, input.contactId),
      eq(contacts.tenantId, options.tenantId),
      isNull(contacts.deletedAt),
    ));

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
        isNull(contacts.deletedAt),
      ))
      .limit(1);

    if (existing) {
      isDuplicate = true;
      existingContactId = existing.id;
    }
  }

  const score = Math.round(contact.score ?? 0);
  const { grade } = getGrade(score);
  const reasons = Array.isArray(contact.scoreReasons) ? (contact.scoreReasons as string[]) : [];

  // Determine priority based on score + source
  const priority = determinePriority(score, input.source);
  const qualified = priority === "hot" || priority === "warm";
  const recommendedAction = recommendAction(priority, input.source);

  // Fetch company name
  let companyName: string | null = null;
  if (contact.companyId) {
    const [company] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(and(
        eq(companies.id, contact.companyId),
        eq(companies.tenantId, options.tenantId),
        isNull(companies.deletedAt),
      ));
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
    score,
    grade,
    qualified,
    priority,
    reasons,
    recommendedAction,
    isDuplicate,
    existingContactId,
    knowledgeContext: knowledgeBlock,
  };
}
