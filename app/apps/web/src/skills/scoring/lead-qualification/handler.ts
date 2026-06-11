import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { loadActiveIcps } from "@/lib/icp/fit-recompute-core";
import {
  hasContactScorableCriteria,
  scoreContactIcpBatch,
} from "@/lib/scoring/contact-icp-fit";
import { getGrade } from "@/lib/scoring/scoring";
import { getSkillKnowledge } from "@/skills/skill-knowledge";
import type { SkillRunOptions } from "@/skills/types";
import type { LeadQualificationInput, LeadQualificationOutput } from "./schema";

/**
 * Chat-facing qualification = the STORED ICP-fit score, refreshed
 * through the same lib every other writer uses (the contacts More-menu
 * run, campaign prep, email-sync rescore). The skill must quote the
 * column: the old private recomputation (legacy flat-settings
 * composite) had chat disagreeing with every list in the product
 * (_specs/title-persona-fit R8).
 */
export async function leadQualificationHandler(
  input: LeadQualificationInput,
  options: SkillRunOptions,
): Promise<LeadQualificationOutput> {
  const [activeIcps, knowledgeBlock] = await Promise.all([
    loadActiveIcps(options.tenantId),
    getSkillKnowledge(
      "ideal customer profile qualification criteria target industries company size",
      options.tenantId,
    ),
  ]);

  // Refresh first so the answer reflects today's profiles. No-op when
  // nothing is scorable — the stored scores then stand as they are.
  if (hasContactScorableCriteria(activeIcps)) {
    await scoreContactIcpBatch(options.tenantId, input.contactIds, activeIcps);
  }

  const contactRecords = await db
    .select()
    .from(contacts)
    .where(
      and(
        inArray(contacts.id, input.contactIds),
        eq(contacts.tenantId, options.tenantId),
        isNull(contacts.deletedAt),
      ),
    );

  const companyIds = contactRecords
    .map((c) => c.companyId)
    .filter((id): id is string => id !== null);
  const companyRecords =
    companyIds.length > 0
      ? await db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(
            and(
              inArray(companies.id, companyIds),
              eq(companies.tenantId, options.tenantId),
              isNull(companies.deletedAt),
            ),
          )
      : [];
  const companyNameById = new Map(companyRecords.map((c) => [c.id, c.name]));

  const leads: LeadQualificationOutput["leads"] = contactRecords.map((contact) => {
    const score = Math.round(contact.score ?? 0);
    return {
      contactId: contact.id,
      name:
        contact.firstName && contact.lastName
          ? `${contact.firstName} ${contact.lastName}`
          : contact.firstName || contact.lastName || null,
      email: contact.email,
      title: contact.title,
      companyName: contact.companyId
        ? (companyNameById.get(contact.companyId) ?? null)
        : null,
      score,
      grade: getGrade(score).grade,
      qualified: score >= input.minScoreThreshold,
      reasons: Array.isArray(contact.scoreReasons)
        ? (contact.scoreReasons as string[])
        : [],
    };
  });

  leads.sort((a, b) => b.score - a.score);

  const totalQualified = leads.filter((l) => l.qualified).length;
  const avgScore =
    leads.length > 0
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
