import { db } from "@/db";
import { activities } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { eq, desc, and } from "drizzle-orm";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  const activityType = url.searchParams.get("activityType");
  const limit = parseInt(url.searchParams.get("limit") || "50");

  try {
    const filters = [eq(activities.tenantId, authCtx.tenantId)];
    if (entityType) filters.push(eq(activities.entityType, entityType));
    if (entityId) filters.push(eq(activities.entityId, entityId));
    if (activityType) filters.push(eq(activities.activityType, activityType as any));
    const conditions = filters.length === 1 ? filters[0] : and(...filters);

    const result = await db
      .select()
      .from(activities)
      .where(conditions)
      .orderBy(desc(activities.occurredAt))
      .limit(limit);

    return Response.json({ activities: result });
  } catch (error) {
    console.error("Failed to fetch activities:", error);
    return Response.json({ error: "Failed to fetch activities" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { entityType, entityId, activityType, channel, direction, summary, metadata } = body;

    if (!entityType || !entityId || !activityType) {
      return Response.json(
        { error: "entityType, entityId, and activityType are required" },
        { status: 400 }
      );
    }

    const [activity] = await db
      .insert(activities)
      .values({
        tenantId: authCtx.tenantId,
        actorType: "user",
        actorId: authCtx.appUserId,
        entityType,
        entityId,
        activityType,
        channel: channel || "manual",
        direction: direction || "internal",
        summary: summary || null,
        metadata: metadata || {},
      })
      .returning();

    return Response.json({ activity }, { status: 201 });
  } catch (error) {
    console.error("Failed to create activity:", error);
    return Response.json({ error: "Failed to create activity" }, { status: 500 });
  }
}
