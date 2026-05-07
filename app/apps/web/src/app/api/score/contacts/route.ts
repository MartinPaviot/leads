import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { scoreContact } from "@/lib/scoring/contact-scoring";
import { getGrade } from "@/lib/scoring/scoring";
import { getTenantSettings } from "@/lib/config/tenant-settings";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("enrich", authCtx.userId);
  if (rlResponse) return rlResponse;

  try {
    const { contactIds } = await req.json();

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return Response.json({ error: "contactIds array required" }, { status: 400 });
    }

    const settings = await getTenantSettings(authCtx.tenantId);
    const icpSettings = {
      targetRoles: settings?.targetRoles,
      targetIndustries: settings?.targetIndustries,
    };

    let scored = 0;

    for (const contactId of contactIds.slice(0, 20)) {
      try {
        const result = await scoreContact(contactId, authCtx.tenantId, icpSettings);

        // Determine grade from total score using shared thresholds
        const { grade } = getGrade(result.score);

        // Fetch current properties to merge
        const [current] = await db
          .select({ properties: contacts.properties })
          .from(contacts)
          .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, authCtx.tenantId)))
          .limit(1);

        const currentProps = (current?.properties || {}) as Record<string, unknown>;

        await db
          .update(contacts)
          .set({
            score: result.score,
            scoreReasons: result.reasons,
            properties: {
              ...currentProps,
              score_grade: grade,
              score_breakdown: result.breakdown,
              scored_at: new Date().toISOString(),
              scoring_method: "engagement_weighted",
            },
            updatedAt: new Date(),
          })
          .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, authCtx.tenantId)));

        scored++;
      } catch (err) {
        console.warn(`Failed to score contact ${contactId}:`, err);
      }
    }

    return Response.json({ success: true, scored, total: contactIds.length });
  } catch (error) {
    console.error("Contact scoring failed:", error);
    return Response.json({ error: "Contact scoring failed" }, { status: 500 });
  }
}
