import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { appToAuthUserId } from "@/lib/auth/user-id";

/**
 * Resolve an active connected mailbox owned by the given APP user (e.g. a
 * deal's `ownerId`) — used by the agent-driven senders (autonomous pipeline,
 * stale-deal revival) to send a deal's email from the DEAL OWNER's mailbox,
 * never a colleague's.
 *
 * Bridges the two user id spaces via `appToAuthUserId` (see lib/auth/user-id):
 * `connected_mailboxes.user_id` holds the AUTH-user id. Returns null when the
 * owner is unknown or has no active connected mailbox — callers then fall back
 * to the neutral system sender (Resend) rather than borrowing another user's
 * personal mailbox.
 */
export async function getOwnerMailbox(
  tenantId: string,
  appUserId: string | null | undefined,
): Promise<{ id: string; emailAddress: string } | null> {
  const authUserId = await appToAuthUserId(appUserId);
  if (!authUserId) return null;

  const [mb] = await db
    .select({ id: connectedMailboxes.id, emailAddress: connectedMailboxes.emailAddress })
    .from(connectedMailboxes)
    .where(
      and(
        eq(connectedMailboxes.tenantId, tenantId),
        eq(connectedMailboxes.status, "active"),
        eq(connectedMailboxes.userId, authUserId),
      ),
    )
    .limit(1);

  return mb ?? null;
}
