import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { authAccounts } from "@/db/schema";
import { logger } from "@/lib/observability/logger";

/**
 * N15 — DELETE /api/settings/oauth?provider=google|microsoft-entra-id
 *
 * Revoke one OAuth connection for the currently authenticated user by
 * deleting the `auth_account` row NextAuth uses to cache access +
 * refresh tokens. Subsequent Gmail / Graph API calls won't find tokens
 * and the downstream sync cron will no-op until the user re-links.
 *
 * What we do NOT touch here:
 *   - the NextAuth session cookie (JWT strategy) — removing the OAuth
 *     account row shouldn't log the user out, it only stops the sync.
 *   - Google / Microsoft on their side — the caller should still pop
 *     open their provider security page to revoke upstream. We surface
 *     that in the toast copy.
 */
const ALLOWED_PROVIDERS = new Set(["google", "microsoft-entra-id"]);

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");
  if (!provider || !ALLOWED_PROVIDERS.has(provider)) {
    return NextResponse.json(
      { error: "provider must be 'google' or 'microsoft-entra-id'" },
      { status: 400 }
    );
  }

  try {
    const result = await db
      .delete(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, session.user.id),
          eq(authAccounts.provider, provider)
        )
      );
    // Drizzle delete doesn't return a row count on every adapter; we
    // log the attempt so an admin can audit "who disconnected what
    // when" later if we wire that into Sentry breadcrumbs.
    logger.info("oauth: disconnect", {
      userId: session.user.id,
      provider,
      result,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("oauth: disconnect failed", { err });
    return NextResponse.json(
      { error: "Failed to disconnect account" },
      { status: 500 }
    );
  }
}
