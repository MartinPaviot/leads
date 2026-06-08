import { db } from "@/db";
import { connectedMailboxes, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Resolve an active connected mailbox owned by the given APP user — used by the
 * agent-driven senders (autonomous pipeline, stale-deal revival) to send a
 * deal's email from the DEAL OWNER's mailbox, never a colleague's.
 *
 * Id-space bridge: `deals.ownerId` references the app `users.id`, but
 * `connected_mailboxes.user_id` holds the AUTH-user id (= `authCtx.userId`,
 * matching the OAuth side). We map app `users.id -> users.clerkId` (which stores
 * the auth-user id) before matching.
 *
 * Returns null when the owner is unknown or has no active connected mailbox —
 * callers then fall back to the neutral system sender (Resend) rather than
 * borrowing another user's personal mailbox.
 */
export async function getOwnerMailbox(
  tenantId: string,
  appUserId: string | null | undefined,
): Promise<{ id: string; emailAddress: string } | null> {
  if (!appUserId) return null;

  const [u] = await db
    .select({ authUserId: users.clerkId })
    .from(users)
    .where(eq(users.id, appUserId))
    .limit(1);
  if (!u?.authUserId) return null;

  const [mb] = await db
    .select({ id: connectedMailboxes.id, emailAddress: connectedMailboxes.emailAddress })
    .from(connectedMailboxes)
    .where(
      and(
        eq(connectedMailboxes.tenantId, tenantId),
        eq(connectedMailboxes.status, "active"),
        eq(connectedMailboxes.userId, u.authUserId),
      ),
    )
    .limit(1);

  return mb ?? null;
}
