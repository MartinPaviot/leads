import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { deals, activities } from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
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

  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const { id } = await params;
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    return Response.json({ intel: {} });
  }

  const [deal] = await db.select().from(deals).where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt))).limit(1);
  if (!deal) return Response.json({ error: "Not found" }, { status: 404 });

  // Get all activities for this deal
  const dealActivities = await db
    .select({ summary: activities.summary, activityType: activities.activityType })
    .from(activities)
    .where(and(eq(activities.entityId, id), eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt)))
    .orderBy(desc(activities.occurredAt))
    .limit(20);

  const activityText = dealActivities
    .filter((a) => a.summary)
    .map((a) => `[${a.activityType}] ${a.summary}`)
    .join("\n");

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: intelSchema,
      prompt: `Extract structured deal intelligence from these interactions. Only include fields where you have clear evidence.

Deal: ${deal.name}
Deal summary: ${deal.summary || "none"}

Interactions:
${activityText || "No recorded interactions"}

Extract: budget, team size, current CRM, competitor/point solutions, decision timeline, and key pain points.
Only include a field if there's actual evidence. Leave undefined if unknown.`,
      _trace: { agentId: "deal-extract-intel", tenantId: authCtx.tenantId },
    });
    const result = object as any;

    // Save to deal properties
    const currentProps = (deal.properties as Record<string, unknown>) || {};
    await db
      .update(deals)
      .set({
        properties: { ...currentProps, extractedIntel: result.intel },
        updatedAt: new Date(),
      })
      .where(and(eq(deals.id, id), eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt)));

    return Response.json({ intel: result.intel });
  } catch {
    return Response.json({ intel: {} });
  }
}
