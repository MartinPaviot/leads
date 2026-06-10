import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * POST /api/inbox/drafts/[id]/consume — mark an agent-prepared draft as
 * used after the composer sent a reply based on it, so the same draft is
 * never offered (or double-sent) again. 'skipped' is the existing
 * terminal status for never-sent outbound rows.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const [row] = await db
      .update(outboundEmails)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(
        and(
          eq(outboundEmails.id, id),
          eq(outboundEmails.tenantId, authCtx.tenantId),
          eq(outboundEmails.status, "draft"),
          isNull(outboundEmails.sentAt),
        ),
      )
      .returning({ id: outboundEmails.id });

    if (!row) return Response.json({ error: "Draft not found" }, { status: 404 });
    return Response.json({ consumed: row.id });
  } catch (error) {
    console.error("Failed to consume draft:", error);
    return Response.json({ error: "Failed to consume draft" }, { status: 500 });
  }
}
