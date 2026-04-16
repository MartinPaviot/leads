import { db } from "@/db";
import { deals, companies, contacts, activities } from "@/db/schema";
import { eq, and, desc, or } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/traced-ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { SkillRunOptions } from "@/skills/types";
import type { ScopePocInput, ScopePocOutput } from "./schema";

function getLLMModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export async function scopePocHandler(
  input: ScopePocInput,
  options: SkillRunOptions,
): Promise<ScopePocOutput> {
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, options.tenantId)));

  if (!deal) throw new Error(`Deal ${input.dealId} not found`);

  let companyName: string | null = null;
  let companyDesc = "";
  let contactTitle = "";

  if (deal.companyId) {
    const [company] = await db.select().from(companies).where(eq(companies.id, deal.companyId));
    if (company) {
      companyName = company.name;
      companyDesc = company.description || "";
    }
  }
  if (deal.contactId) {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, deal.contactId));
    if (contact) {
      contactTitle = contact.title || "";
    }
  }

  // Fetch recent activities for context
  const entityFilters = [
    and(eq(activities.entityType, "deal"), eq(activities.entityId, input.dealId)),
  ];
  if (deal.contactId) {
    entityFilters.push(
      and(eq(activities.entityType, "contact"), eq(activities.entityId, deal.contactId)),
    );
  }
  const recentActivities = await db
    .select({ summary: activities.summary, activityType: activities.activityType })
    .from(activities)
    .where(and(eq(activities.tenantId, options.tenantId), or(...entityFilters)))
    .orderBy(desc(activities.occurredAt))
    .limit(15);

  const activityContext = recentActivities
    .map((a) => `- ${a.activityType}: ${a.summary || "no summary"}`)
    .join("\n");

  const model = getLLMModel();
  if (!model) throw new Error("No LLM API key configured");

  const result = await tracedGenerateObject({
    model,
    schema: z.object({
      objective: z.string(),
      successCriteria: z.array(z.object({ criterion: z.string(), measurable: z.string(), target: z.string() })),
      scope: z.object({ inScope: z.array(z.string()), outOfScope: z.array(z.string()) }),
      timeline: z.object({
        totalDays: z.number(),
        phases: z.array(z.object({ name: z.string(), durationDays: z.number(), deliverables: z.array(z.string()) })),
      }),
      resourcesRequired: z.array(z.object({ role: z.string(), commitment: z.string(), from: z.enum(["us", "them"]) })),
      risks: z.array(z.object({ risk: z.string(), mitigation: z.string() })),
      goNoGoFramework: z.string(),
    }),
    prompt: `You are a sales engineer scoping a Proof of Concept (PoC) for a prospect. Be practical and specific.

## Deal
- Name: ${deal.name}
- Stage: ${deal.stage}
- Value: ${deal.value ? `$${deal.value}` : "unset"}
- Company: ${companyName || "unknown"}
- Company description: ${companyDesc || "unknown"}
- Primary contact role: ${contactTitle || "unknown"}
- Deal summary: ${deal.summary || "none"}
${input.focusAreas?.length ? `- Focus areas requested: ${input.focusAreas.join(", ")}` : ""}

## Recent Interaction Context
${activityContext || "No activities recorded"}

## Requirements
1. **Objective**: One clear sentence on what the PoC proves
2. **Success criteria**: 3-5 measurable criteria with specific targets
3. **Scope**: What's in and what's explicitly out
4. **Timeline**: Realistic phases with deliverables (typically 2-4 weeks total)
5. **Resources**: Who's needed from both sides
6. **Risks**: What could go wrong + mitigations
7. **Go/No-Go**: How to evaluate at the end (1 paragraph framework)

Make it specific to this company and deal, not generic.`,
    _trace: {
      agentId: "skill-scope-poc",
      tenantId: options.tenantId,
    },
  });

  return {
    dealId: input.dealId,
    dealName: deal.name,
    companyName,
    poc: result.object,
  };
}
