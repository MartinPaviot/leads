import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const timeline = await db
      .select({
        id: activities.id,
        type: activities.activityType,
        summary: activities.summary,
        occurredAt: activities.occurredAt,
      })
      .from(activities)
      .where(
        and(
          eq(activities.entityId, id),
          eq(activities.entityType, "deal"),
          eq(activities.tenantId, authCtx.tenantId),
          isNull(activities.deletedAt),
        )
      )
      .orderBy(desc(activities.occurredAt));

    return Response.json({ timeline });
  } catch (error) {
    console.error("Failed to fetch deal timeline:", error);
    return Response.json({ error: "Failed to fetch deal timeline" }, { status: 500 });
  }
}
