import { db } from "@/db";
import { activities } from "@/db/schema";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { eq, desc, and, sql } from "drizzle-orm";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Admin-only — the audit trail is a privileged, compliance-sensitive view.
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");

  try {
    const filters = [
      eq(activities.tenantId, authCtx.tenantId),
      sql`${activities.metadata}->>'audit' = 'true'`,
    ];

    if (entityType) filters.push(eq(activities.entityType, entityType));
    if (entityId) filters.push(eq(activities.entityId, entityId));

    const result = await db
      .select()
      .from(activities)
      .where(and(...filters))
      .orderBy(desc(activities.occurredAt))
      .limit(100);

    return Response.json({ logs: result });
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    return Response.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}
