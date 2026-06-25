import { db } from "@/db";
import { companies } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { searchPeople, enrichOrganization } from "@/lib/integrations/apollo-client";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { getSkillKnowledge } from "@/skills/skill-knowledge";
import type { SkillRunOptions } from "@/skills/types";
import type { JobPostingIntentInput, JobPostingIntentOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-haiku-4-5-20251001");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function jobPostingIntentHandler(
  input: JobPostingIntentInput,
  options: SkillRunOptions,
): Promise<JobPostingIntentOutput> {
  const signals: JobPostingIntentOutput["signals"] = [];

  const companyRecords = await db
    .select()
    .from(companies)
    .where(and(
      inArray(companies.id, input.companyIds),
      eq(companies.tenantId, options.tenantId),
    ));

  const model = getLLMModel();

  // Retrieve Knowledge context to improve LLM reasoning about hiring intent
  const knowledgeBlock = model
    ? await getSkillKnowledge("job posting hiring intent signals tool adoption indicators", options.tenantId)
    : "";

  for (const company of companyRecords) {
    if (!company.domain) continue;

    // Check company growth via Apollo enrichment
    const org = await enrichOrganization(company.domain).catch(() => null);
    if (!org) continue;

    const props = (company.properties as Record<string, unknown>) ?? {};
    const previousEmployeeCount = props.lastKnownEmployeeCount as number | null;
    const currentEmployeeCount = org.estimated_num_employees;

    // Detect growth signal
    let isGrowing = false;
    if (previousEmployeeCount && currentEmployeeCount) {
      const growthRate = (currentEmployeeCount - previousEmployeeCount) / previousEmployeeCount;
      isGrowing = growthRate > 0.1; // 10%+ growth
    }

    // Look for people in roles that suggest tool evaluation
    const targetTitles = input.targetKeywords.length > 0
      ? input.targetKeywords
      : undefined;

    // Search for potential hiring managers (one level above target role)
    const people = await searchPeople({
      q_organization_domains: company.domain,
      person_seniorities: ["vp", "director", "head"],
      person_titles: targetTitles,
      per_page: 3,
    }).catch(() => null);

    const hiringManager = people?.people[0] ?? null;

    if (isGrowing || (org.estimated_num_employees && org.estimated_num_employees > 50)) {
      let reasoning: string;
      let angle: string;
      let strength: "high" | "medium" | "low";

      if (isGrowing && previousEmployeeCount && currentEmployeeCount) {
        const growth = Math.round(((currentEmployeeCount - previousEmployeeCount) / previousEmployeeCount) * 100);
        reasoning = `Growing ${growth}% (${previousEmployeeCount} → ${currentEmployeeCount} employees). Rapid growth = process pain = tool buying.`;
        angle = `"As you scale from ${previousEmployeeCount} to ${currentEmployeeCount}+ people, the tools that worked before start breaking..."`;
        strength = growth > 25 ? "high" : "medium";
      } else if (model) {
        const result = await tracedGenerateObject({
          model,
          schema: z.object({
            reasoning: z.string(),
            angle: z.string(),
            strength: z.enum(["high", "medium", "low"]),
          }),
          prompt: `Company: ${org.name} (${org.industry}), ${org.estimated_num_employees} employees, ${org.latest_funding_stage || "unknown"} funding.
Tech stack: ${org.technology_names?.slice(0, 10).join(", ") || "unknown"}.
${knowledgeBlock}
Is this company likely to be hiring for roles that indicate they need new tools/processes?
- reasoning: why or why not (1-2 sentences)
- angle: suggested outreach angle if yes (1 sentence)
- strength: high/medium/low signal`,
          _trace: { agentId: "skill-job-posting-intent", tenantId: options.tenantId },
        });
        reasoning = result.object.reasoning;
        angle = result.object.angle;
        strength = result.object.strength;
      } else {
        reasoning = `${org.name} has ${org.estimated_num_employees} employees in ${org.industry}`;
        angle = "Growing company in need of modern tools";
        strength = "low";
      }

      signals.push({
        companyId: company.id,
        companyName: company.name,
        companyDomain: company.domain,
        hiringManagerTitle: hiringManager?.title ?? null,
        hiringManagerName: hiringManager?.name ?? null,
        hiringManagerEmail: hiringManager?.email ?? null,
        signalStrength: strength,
        reasoning,
        suggestedOutreachAngle: angle,
      });
    }

    // Update stored employee count for future diff
    if (currentEmployeeCount) {
      await db.update(companies).set({
        properties: { ...props, lastKnownEmployeeCount: currentEmployeeCount },
      }).where(eq(companies.id, company.id));
    }
  }

  signals.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.signalStrength] - order[b.signalStrength];
  });

  return {
    totalCompaniesChecked: companyRecords.length,
    signalsFound: signals.length,
    signals,
  };
}
