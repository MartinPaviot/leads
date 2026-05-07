import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { scoreContact } from "@/lib/scoring/contact-scoring";
import { getGrade } from "@/lib/scoring/scoring";
import { getSkillKnowledge } from "@/skills/skill-knowledge";
import type { SkillRunOptions } from "@/skills/types";
import type { LeadQualificationInput, LeadQualificationOutput } from "./schema";

export async function leadQualificationHandler(
  input: LeadQualificationInput,
  options: SkillRunOptions,
): Promise<LeadQualificationOutput> {
  // Batch fetch contacts + retrieve knowledge in parallel
  const [contactRecords, knowledgeBlock] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(and(
        inArray(contacts.id, input.contactIds),
        eq(contacts.tenantId, options.tenantId),
      )),
    getSkillKnowledge("ideal customer profile qualification criteria target industries company size", options.tenantId),
  ]);

  // Batch fetch associated companies
  const companyIds = contactRecords
    .map((c) => c.companyId)
    .filter((id): id is string => id !== null);

  const companyRecords = companyIds.length > 0
    ? await db.select().from(companies).where(inArray(companies.id, companyIds))
    : [];

  const companyMap = new Map(companyRecords.map((c) => [c.id, c]));

  // Score each contact
  const leads: LeadQualificationOutput["leads"] = [];

  for (const contact of contactRecords) {
    const result = await scoreContact(contact.id, options.tenantId, input.icpSettings);
    const { grade } = getGrade(result.score);
    const company = contact.companyId ? companyMap.get(contact.companyId) : null;

    leads.push({
      contactId: contact.id,
      name: contact.firstName && contact.lastName
        ? `${contact.firstName} ${contact.lastName}`
        : contact.firstName || contact.lastName || null,
      email: contact.email,
      title: contact.title,
      companyName: company?.name ?? null,
      score: result.score,
      grade,
      qualified: result.score >= input.minScoreThreshold,
      reasons: result.reasons,
      breakdown: result.breakdown,
    });
  }

  // Sort by score descending
  leads.sort((a, b) => b.score - a.score);

  const totalQualified = leads.filter((l) => l.qualified).length;
  const avgScore = leads.length > 0
    ? Math.round(leads.reduce((sum, l) => sum + l.score, 0) / leads.length)
    : 0;

  return {
    totalProcessed: leads.length,
    totalQualified,
    totalDisqualified: leads.length - totalQualified,
    avgScore,
    leads,
    knowledgeContext: knowledgeBlock,
  };
}
