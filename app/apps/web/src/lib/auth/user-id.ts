import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * The two "user" id spaces — and the ONE place to bridge them.
 * (Full per-column inventory: _audit/2026-06-09-user-id-convergence.md.)
 *
 *  - AUTH-user id = `auth_user.id` (the NextAuth identity, = `authCtx.userId`).
 *    Columns in this space:
 *      - the NextAuth tables (auth_account / auth_session / auth_user)
 *      - the AGENT island (db/schema/agent.ts): agent_tasks.user_id,
 *        agent_actions, trust_events, code_executions.user_id,
 *        requested_by_user_id, reversed_by_user_id, approved_by_user_id
 *      - knowledge_entries.created_by, saved_views.user_id,
 *        user_preferences.user_id
 *      - convention TEXT cols (no FK): connected_mailboxes.user_id,
 *        sequences.created_by — and users.clerk_id, which literally STORES the
 *        auth id (so `eq(users.clerkId, authCtx.userId)` is the inline bridge).
 *
 *  - APP-user id = `users.id` (the tenant-member row, = `authCtx.appUserId`).
 *    Everything else: the CRM (companies/contacts/deals.owner_id,
 *    notes.author_id, tasks.assignee_id), notifications, chat_threads/memories,
 *    coaching_insights + ae_performance_snapshots, calls.user_id, proposals
 *    (created_by_user_id / mapped_by_user_id), icps / custom_skill_templates /
 *    custom_signals.created_by_user_id, tam reviewed_by_user_id, …
 *
 * They map 1:1 through `users.clerk_id` (which stores the auth-user id).
 *
 * CONVENTION
 *  - Write `authCtx.appUserId` into any `users.id` FK, and `authCtx.userId`
 *    into any auth-space column. Never the reverse — it's a silent mismatch
 *    (an FK violation on write, or a filter/compare that matches nothing).
 *  - New "user" FKs SHOULD reference the APP `users.id` (the larger set); the
 *    auth-space columns listed above are the established exceptions.
 *  - To match a user ACROSS the two spaces, call these helpers — never
 *    re-inline the `users.clerk_id` mapping (that's how mismatches creep in).
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
