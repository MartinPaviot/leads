import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { notifications, notificationPreferences } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

// GET /api/notifications — list notifications for current user
export async function GET(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const unreadOnly = searchParams.get("unread") === "true";

    const conditions = [eq(notifications.userId, authCtx.appUserId)];
    if (unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    const items = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    const [unreadCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, authCtx.appUserId),
          eq(notifications.read, false)
        )
      );

    return Response.json({
      notifications: items,
      unreadCount: Number(unreadCount?.count || 0),
    });
  });
}

// POST /api/notifications — mark notifications as read
export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const body = await req.json();
    const { action, notificationIds } = body;

    if (action === "mark_read" && Array.isArray(notificationIds)) {
      for (const id of notificationIds.slice(0, 100)) {
        await db
          .update(notifications)
          .set({ read: true })
          .where(
            and(
              eq(notifications.id, id),
              eq(notifications.userId, authCtx.appUserId)
            )
          );
      }
      return Response.json({ success: true });
    }

    if (action === "mark_all_read") {
      await db
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.userId, authCtx.appUserId),
            eq(notifications.read, false)
          )
        );
      return Response.json({ success: true });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  });
}
