import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { pendingInvites } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

/** List pending invitations for the current workspace. */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const invites = await db
    .select({
      id: pendingInvites.id,
      email: pendingInvites.email,
      role: pendingInvites.role,
      status: pendingInvites.status,
      sentAt: pendingInvites.sentAt,
      lastSentAt: pendingInvites.lastSentAt,
      expiresAt: pendingInvites.expiresAt,
      resendCount: pendingInvites.resendCount,
    })
    .from(pendingInvites)
    .where(and(
      eq(pendingInvites.tenantId, authCtx.tenantId),
      eq(pendingInvites.status, "pending"),
    ))
    .orderBy(desc(pendingInvites.sentAt));

  return Response.json({ invites });
}
