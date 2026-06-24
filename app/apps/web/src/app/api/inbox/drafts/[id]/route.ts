import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { outboundEmails } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * DELETE /api/inbox/drafts/[id] — discard a composer draft. Tenant-scoped and
 * draft-only (never deletes a queued/held/sent row). Idempotent: a missing row
 * is a no-op success so a double-discard / already-sent draft doesn't error.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await db
      .delete(outboundEmails)
      .where(
        and(
          eq(outboundEmails.id, id),
          eq(outboundEmails.tenantId, authCtx.tenantId),
          eq(outboundEmails.status, "draft"),
          isNull(outboundEmails.sentAt),
        ),
      );
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete draft:", error);
    return Response.json({ error: "Failed to delete draft" }, { status: 500 });
  }
}
