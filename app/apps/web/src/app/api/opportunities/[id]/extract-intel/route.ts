import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { deals, activities } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const intelSchema = z.object({
  intel: z.object({
    budget: z.string().optional().describe("Budget mentioned (e.g. '$30,000', 'No budget discussed')"),
    teamSize: z.string().optional().describe("Sales/target team size (e.g. '4 people', '10-20')"),
    currentCRM: z.string().optional().describe("Current CRM or tools they use (e.g. 'Hubspot', 'Salesforce')"),
    competitorTools: z.string().optional().describe("Other tools/solutions they use (e.g. 'Apollo, Fireflies')"),
    decisionTimeline: z.string().optional().describe("When they plan to decide (e.g. 'Q2 2026', 'Next month')"),
    painPoints: z.string().optional().describe("Key pain points mentioned"),
  }),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ intel: {} });
  }

  const [deal] = await db.select().from(deals).where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId))).limit(1);
  if (!deal) return Response.json({ error: "Not found" }, { status: 404 });

  // Get all activities for this deal
  const dealActivities = await db
    .select({ summary: activities.summary, activityType: activities.activityType })
    .from(activities)
    .where(and(eq(activities.entityId, id), eq(activities.tenantId, authCtx.tenantId)))
    .orderBy(desc(activities.occurredAt))
    .limit(20);

  const activityText = dealActivities
    .filter((a) => a.summary)
    .map((a) => `[${a.activityType}] ${a.summary}`)
    .join("\n");

  try {
    const { object } = await generateObject({
      model,
      schema: intelSchema,
      prompt: `Extract structured deal intelligence from these interactions. Only include fields where you have clear evidence.

Deal: ${deal.name}
Deal summary: ${deal.summary || "none"}

Interactions:
${activityText || "No recorded interactions"}

Extract: budget, team size, current CRM, competitor/point solutions, decision timeline, and key pain points.
Only include a field if there's actual evidence. Leave undefined if unknown.`,
    });

    // Save to deal properties
    const currentProps = (deal.properties as Record<string, unknown>) || {};
    await db
      .update(deals)
      .set({
        properties: { ...currentProps, extractedIntel: object.intel },
        updatedAt: new Date(),
      })
      .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId)));

    return Response.json({ intel: object.intel });
  } catch {
    return Response.json({ intel: {} });
  }
}
