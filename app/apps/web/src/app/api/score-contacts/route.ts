import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { contacts, companies, activities } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { getTenantSettings, parseRoleKeywords } from "@/lib/config/tenant-settings";
import { calculateContactFitScore, getGrade } from "@/lib/scoring/scoring";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("enrich", authCtx.userId);
  if (rlResponse) return rlResponse;

  try {
    const body = await req.json();
    const { contactIds } = body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return Response.json({ error: "contactIds array required" }, { status: 400 });
    }

    // Load typed tenant settings
    const settings = await getTenantSettings(authCtx.tenantId);
    const targetRoleKeywords = parseRoleKeywords(settings);

    let scored = 0;

    for (const id of contactIds.slice(0, 20)) {
      try {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)))
          .limit(1);

        if (!contact) continue;

        const props = (contact.properties || {}) as Record<string, unknown>;

        // Get company info if available
        let company: Record<string, unknown> | null = null;
        let companyProps: Record<string, unknown> | null = null;
        if (contact.companyId) {
          const [c] = await db
            .select()
            .from(companies)
            .where(and(eq(companies.id, contact.companyId), eq(companies.tenantId, authCtx.tenantId)))
            .limit(1);
          if (c) {
            company = c as Record<string, unknown>;
            companyProps = (c.properties || {}) as Record<string, unknown>;
          }
        }

        // Calculate engagement boost from activities
        let engagementBoost = 0;
        const engagementReasons: string[] = [];
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [activityCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(activities)
          .where(
            and(
              eq(activities.tenantId, authCtx.tenantId),
              eq(activities.entityType, "contact"),
              eq(activities.entityId, id),
              gte(activities.occurredAt, thirtyDaysAgo)
            )
          );

        const recentActivities = Number(activityCount?.count || 0);
        if (recentActivities > 5) {
          engagementBoost = 10;
          engagementReasons.push(`${recentActivities} recent interactions`);
        } else if (recentActivities > 0) {
          engagementBoost = 5;
        }

        const fit = calculateContactFitScore(
          contact as Record<string, unknown>,
          props,
          company,
          targetRoleKeywords
        );

        const totalScore = Math.min(100, fit.score + engagementBoost);
        const allReasons = [...fit.reasons, ...engagementReasons];

        // Re-calculate grade with engagement using shared thresholds
        const { grade } = getGrade(totalScore);

        await db
          .update(contacts)
          .set({
            score: totalScore,
            scoreReasons: allReasons,
            properties: {
              ...props,
              score_grade: grade,
              scored_at: new Date().toISOString(),
              scoring_method: "rule_based",
            },
            updatedAt: new Date(),
          })
          .where(and(eq(contacts.id, id), eq(contacts.tenantId, authCtx.tenantId)));

        scored++;
      } catch (err) {
        console.warn(`Failed to score contact ${id}:`, err);
      }
    }

    return Response.json({ success: true, scored });
  } catch (error) {
    console.error("Contact scoring failed:", error);
    return Response.json({ error: "Contact scoring failed" }, { status: 500 });
  }
}
