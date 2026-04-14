import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  authUsers,
  authAccounts,
  authSessions,
  users,
  tenants,
} from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { logger } from "@/lib/logger";

/**
 * DELETE /api/account — Permanently delete the signed-in user's account.
 *
 * Requires the client to post `{ confirm: "DELETE" }` so a stray request
 * can't trigger it even if the session token leaks. The UI pair is the
 * typed-verify modal (T1-F11 `DestructiveConfirm`).
 *
 * Scope: deletes the auth_user row + its auth_accounts + sessions, and
 * the app-level `users` row. Tenant rows are preserved — an individual
 * user deleting themselves shouldn't erase the team's data. A
 * tenant-level "delete workspace" flow is a separate v2 action.
 */
export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") {
    return NextResponse.json(
      { error: 'Confirmation missing. Expected { "confirm": "DELETE" }.' },
      { status: 400 }
    );
  }

  try {
    // The FK cascades on auth_user → auth_account, auth_session, and
    // app users.clerkId → auth_user should pull the rest. We still
    // explicitly delete the app `users` row in case it holds data
    // (e.g. `role`) that the FK doesn't cascade on older migrations.
    await db.delete(users).where(eq(users.id, authCtx.appUserId));
    await db.delete(authSessions).where(eq(authSessions.userId, authCtx.userId));
    await db
      .delete(authAccounts)
      .where(eq(authAccounts.userId, authCtx.userId));
    await db.delete(authUsers).where(eq(authUsers.id, authCtx.userId));

    // Audit: log the deletion with tenant context so we can reconstruct
    // which accounts requested GDPR erase when legal asks.
    logger.warn("account: user deleted via GDPR flow", {
      userId: authCtx.userId,
      tenantId: authCtx.tenantId,
    });

    // Suppress unused-var noise for `tenants` / `and` / `eq` — we keep
    // the imports available for a future tenant-delete path.
    void tenants;
    void and;

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("account: delete failed", { err, userId: authCtx.userId });
    return NextResponse.json(
      { error: "Account deletion failed. Please contact support." },
      { status: 500 }
    );
  }
}
