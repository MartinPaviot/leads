import { auth } from "@/auth";
import { db } from "@/db";
import { deals, companies, contacts, sequenceEnrollments } from "@/db/schema";
import { sql } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const actionsSchema = z.object({
  actions: z.array(
    z.object({
      action: z.string().describe("What to do — specific and actionable"),
      why: z.string().describe("Why this matters — the impact or risk"),
      dealName: z.string().nullable().describe("Which deal this relates to, if any"),
      priority: z.enum(["critical", "high", "medium", "low"]),
      category: z.enum(["follow_up", "close", "rescue", "research", "expand"]),
    })
  ),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-20250514")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ error: "No LLM API key configured" }, { status: 500 });
  }

  try {
    // Gather pipeline data
    const allDeals = await db.select().from(deals).limit(50);
    const companyCount = await db.select({ count: sql<number>`count(*)` }).from(companies);
    const contactCount = await db.select({ count: sql<number>`count(*)` }).from(contacts);
    const enrollmentCount = await db.select({ count: sql<number>`count(*)` }).from(sequenceEnrollments);

    const dealSummary = allDeals.map((d) => {
      const props = d.properties as Record<string, unknown> | null;
      return `- ${d.name}: stage=${d.stage}, value=$${d.value || 0}, risk=${(props?.riskLevel as string) || "unknown"}`;
    }).join("\n");

    const { object } = await generateObject({
      model,
      schema: actionsSchema,
      prompt: `You are a CRO Copilot for a founder doing outbound sales. Based on the pipeline data below, generate the 5 most important actions to close more revenue.

PIPELINE:
${dealSummary || "No deals yet"}

STATS:
- ${Number(companyCount[0]?.count || 0)} companies in TAM
- ${Number(contactCount[0]?.count || 0)} contacts
- ${Number(enrollmentCount[0]?.count || 0)} active sequence enrollments
- ${allDeals.length} deals in pipeline

Generate specific, actionable recommendations. Prioritize by impact on revenue.
If there are no deals, recommend pipeline-building activities (TAM enrichment, sequence creation, outreach).`,
    });

    return Response.json({ actions: object.actions });
  } catch (error) {
    console.error("Failed to generate actions:", error);
    return Response.json({ error: "Failed to generate actions" }, { status: 500 });
  }
}
