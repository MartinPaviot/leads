import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * The two "user" id spaces — and the ONE place to bridge them.
 * (Background: _audit/2026-06-09-shared-vs-personal-bilan.md §5.1.)
 *
 *  - AUTH-user id = `auth_user.id` (the NextAuth identity, = `authCtx.userId`).
 *    Used by the auth tables, the agent tables, and the personal-connection
 *    tables: `connected_mailboxes.user_id`, `sequences.created_by`.
 *  - APP-user id  = `users.id` (the tenant-member row). Used by the CRM + most
 *    feature tables: `deals.ownerId`, `chat_threads.user_id`,
 *    `notifications.user_id`, proposals, icps, …
 *
 * They map 1:1 through `users.clerk_id`, which stores the auth-user id.
 *
 * CONVENTION: new "user" foreign keys should reference the APP `users.id`. When
 * you genuinely need to match an owner ACROSS the two spaces, call these
 * helpers — never re-inline the `users.clerk_id` mapping (that's how silent
 * mismatches creep in).
 */

/** APP `users.id` → AUTH user id (`users.clerk_id`). Null if the user is unknown. */
export async function appToAuthUserId(
  appUserId: string | null | undefined,
): Promise<string | null> {
  if (!appUserId) return null;
  const [u] = await db
    .select({ authUserId: users.clerkId })
    .from(users)
    .where(eq(users.id, appUserId))
    .limit(1);
  return u?.authUserId ?? null;
}

/** AUTH user id → APP `users.id` (via `users.clerk_id`). Null if no member row. */
export async function authToAppUserId(
  authUserId: string | null | undefined,
): Promise<string | null> {
  if (!authUserId) return null;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, authUserId))
    .limit(1);
  return u?.id ?? null;
}
