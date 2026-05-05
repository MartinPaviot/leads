import { db } from "@/db";
import { activities } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { eq, desc, and, isNull } from "drizzle-orm";
import { apiError } from "@/lib/infra/api-errors";
import { z } from "zod";

const createActivitySchema = z.object({
  entityType: z.string().min(1, "entityType is required").max(50),
  entityId: z.string().min(1, "entityId is required").max(200),
  activityType: z.string().min(1, "activityType is required").max(50),
  channel: z.string().max(50).optional(),
  direction: z.string().max(50).optional(),
  summary: z.string().max(5000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

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
    const filters = [eq(activities.tenantId, authCtx.tenantId), isNull(activities.deletedAt)];
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
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  try {
    const raw = await req.json();
    const parsed = createActivitySchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid activity data", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { entityType, entityId, activityType, channel, direction, summary, metadata } = parsed.data;

    const [activity] = await db
      .insert(activities)
      .values({
        tenantId: authCtx.tenantId,
        actorType: "user",
        actorId: authCtx.appUserId,
        entityType,
        entityId,
        activityType: activityType as any,
        channel: (channel || "manual") as any,
        direction: (direction || "internal") as any,
        summary: summary || null,
        metadata: metadata || {},
      })
      .returning();

    return Response.json({ activity }, { status: 201 });
  } catch (error) {
    console.error("Failed to create activity:", error);
    return apiError("INTERNAL_ERROR", "Failed to create activity");
  }
}
