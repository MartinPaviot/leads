import { auth } from "@/auth";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
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
          eq(activities.entityType, "deal")
        )
      )
      .orderBy(desc(activities.occurredAt));

    return Response.json({ timeline });
  } catch (error) {
    console.error("Failed to fetch deal timeline:", error);
    return Response.json({ error: "Failed to fetch deal timeline" }, { status: 500 });
  }
}
