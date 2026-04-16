import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { authAccounts, authUsers } from "@/db/schema";
import { getAuthContext } from "@/lib/auth-utils";
import { isPasswordAcceptable } from "@/lib/password-reset";
import { hashPassword } from "@/lib/password-hash";
import { logger } from "@/lib/logger";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(256),
});

/**
 * POST /api/account/password — Change the signed-in user's password.
 *
 * Requires the current password (even though the user is authenticated)
 * so a stolen session token alone can't silently rotate credentials.
 * Same password policy as sign-up / reset (T0.8 `isPasswordAcceptable`).
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  if (!isPasswordAcceptable(newPassword)) {
    return NextResponse.json(
      {
        error:
          "New password must be ≥12 characters with a digit, a lowercase letter, and an uppercase letter.",
      },
      { status: 400 }
    );
  }

  try {
    // H12 — read from the new `authUsers.passwordHash` column, fall
    // back to the legacy `authAccounts.access_token` until the
    // migration sweep + sign-in roll-forward have touched every row.
    const [user] = await db
      .select({ id: authUsers.id, hash: authUsers.passwordHash })
      .from(authUsers)
      .where(eq(authUsers.id, authCtx.userId))
      .limit(1);

    let storedHash = user?.hash ?? null;
    if (!storedHash) {
      const [cred] = await db
        .select({ hash: authAccounts.access_token })
        .from(authAccounts)
        .where(
          and(
            eq(authAccounts.userId, authCtx.userId),
            eq(authAccounts.provider, "credentials")
          )
        )
        .limit(1);
      storedHash = cred?.hash ?? null;
    }

    if (!storedHash) {
      return NextResponse.json(
        {
          error:
            "This account signs in via SSO. Set a password via Forgot password first.",
        },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(currentPassword, storedHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400 }
      );
    }

    const newHash = await hashPassword(newPassword);
    // Write the new hash to the canonical location. Also clear the
    // legacy column so a later backfill or debug query sees only one
    // source of truth.
    await db
      .update(authUsers)
      .set({ passwordHash: newHash })
      .where(eq(authUsers.id, authCtx.userId));
    await db
      .update(authAccounts)
      .set({ access_token: null })
      .where(
        and(
          eq(authAccounts.userId, authCtx.userId),
          eq(authAccounts.provider, "credentials")
        )
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("account/password: update failed", { err, userId: authCtx.userId });
    return NextResponse.json(
      { error: "Password change failed. Please try again." },
      { status: 500 }
    );
  }
}
