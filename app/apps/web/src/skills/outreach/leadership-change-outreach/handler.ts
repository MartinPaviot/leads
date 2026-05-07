import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { searchPeople } from "@/lib/integrations/apollo-client";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { getSkillKnowledge } from "@/skills/skill-knowledge";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { SkillRunOptions } from "@/skills/types";
import type { LeadershipChangeOutreachInput, LeadershipChangeOutreachOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function leadershipChangeOutreachHandler(
  input: LeadershipChangeOutreachInput,
  options: SkillRunOptions,
): Promise<LeadershipChangeOutreachOutput> {
  const changes: LeadershipChangeOutreachOutput["changes"] = [];

  const [companyRecords, knowledgeBlock] = await Promise.all([
    db
      .select()
      .from(companies)
      .where(and(
        inArray(companies.id, input.companyIds),
        eq(companies.tenantId, options.tenantId),
      )),
    getSkillKnowledge("leadership change outreach product positioning", options.tenantId),
  ]);

  const model = input.generateOutreach ? getLLMModel() : null;

  for (const company of companyRecords) {
    if (!company.domain) continue;

    // Search for senior people at company
    const result = await searchPeople({
      q_organization_domains: company.domain,
      person_seniorities: input.targetSeniorities,
      per_page: 10,
    }).catch(() => null);

    if (!result) continue;

    // Get existing contacts for this company to find NEW leaders
    const existingContacts = await db
      .select({ email: contacts.email, linkedinUrl: contacts.linkedinUrl })
      .from(contacts)
      .where(and(
        eq(contacts.tenantId, options.tenantId),
        eq(contacts.companyId, company.id),
      ));

    const existingEmails = new Set(existingContacts.map((c) => c.email?.toLowerCase()).filter(Boolean));
    const existingLinkedins = new Set(existingContacts.map((c) => c.linkedinUrl?.toLowerCase()).filter(Boolean));

    for (const person of result.people) {
      // Check if this person is already in our DB
      const isKnown = (person.email && existingEmails.has(person.email.toLowerCase()))
        || (person.linkedin_url && existingLinkedins.has(person.linkedin_url.toLowerCase()));

      if (isKnown) continue; // Not new

      // New senior person at a tracked company = leadership change signal
      const isCLevel = person.seniority?.toLowerCase().includes("c_suite")
        || person.title?.toLowerCase().match(/^(ceo|cto|cfo|coo|cmo|cio|cro|cpo)/);

      let outreachSubject: string | null = null;
      let outreachBody: string | null = null;

      if (input.generateOutreach && model) {
        const emailResult = await tracedGenerateObject({
          model,
          schema: z.object({ subject: z.string(), body: z.string() }),
          prompt: `Write a cold email to a new senior leader at a company.

Person: ${person.name} (${person.title}) at ${company.name}
They appear to be a NEW hire/appointment at this company.

${knowledgeBlock ? `## Knowledge Base\n${knowledgeBlock}\n` : ""}Write a short, personalized cold email:
- Acknowledge their new role (without being creepy)
- Connect it to a challenge they'll face in their first 90 days
- Suggest a quick call to share how similar leaders approached it
- Max 100 words body
- No filler, no "hope this finds you well"`,
          _trace: { agentId: "skill-leadership-change-outreach", tenantId: options.tenantId },
        });
        outreachSubject = emailResult.object.subject;
        outreachBody = emailResult.object.body;
      }

      changes.push({
        companyId: company.id,
        companyName: company.name,
        companyDomain: company.domain,
        newLeader: {
          name: person.name,
          title: person.title,
          email: person.email,
          linkedinUrl: person.linkedin_url,
          seniority: person.seniority,
        },
        isNewHire: true,
        signalStrength: isCLevel ? "high" : "medium",
        outreachSubject,
        outreachBody,
      });
    }
  }

  const strengthOrder = { high: 0, medium: 1, low: 2 };
  changes.sort((a, b) => strengthOrder[a.signalStrength] - strengthOrder[b.signalStrength]);

  return {
    totalCompaniesScanned: companyRecords.length,
    changesDetected: changes.length,
    changes,
  };
}
