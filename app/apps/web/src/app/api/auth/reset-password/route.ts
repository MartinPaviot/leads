import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { authAccounts, authUsers } from "@/db/schema";
import {
  consumeResetToken,
  isPasswordAcceptable,
  validateResetToken,
} from "@/lib/password-reset";
import { isPasswordPwned } from "@/lib/password-pwned";
import { sendPasswordChangedEmail } from "@/lib/emails/password-changed";
import { logger } from "@/lib/logger";

const schema = z.object({
  token: z.string().min(10).max(256),
  password: z.string().min(10).max(256),
});

/**
 * POST /api/auth/reset-password
 *
 * Consumes a reset token and writes a new bcrypt hash into
 * `auth_account.access_token` for the credentials provider. Returns 400
 * for all token/password problems (generic error — don't help an
 * attacker distinguish missing-vs-expired), 500 for infra problems, and
 * 200 `{ ok: true }` on success.
 */
export async function POST(req: Request) {
  const rawBody = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input" },
      { status: 400 }
    );
  }

  const { token, password } = parsed.data;

  if (!isPasswordAcceptable(password)) {
    return NextResponse.json(
      {
        error:
          "Password must be at least 10 characters long and include a digit, a lowercase letter, and an uppercase letter.",
      },
      { status: 400 }
    );
  }

  // S5: refuse passwords that show up in the HIBP corpus. Fail-open on
  // network errors so a HIBP outage can't lock users out of resetting.
  const pwned = await isPasswordPwned(password);
  if (pwned.pwned) {
    return NextResponse.json(
      {
        error:
          "This password has appeared in a known data breach. Please choose a different one.",
      },
      { status: 400 }
    );
  }

  try {
    const row = await validateResetToken(token);
    if (!row) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Request a new one." },
        { status: 400 }
      );
    }

    const hash = await bcrypt.hash(password, 10);

    // Update the credentials account's stored hash. If a credentials row
    // doesn't exist (e.g. user signed up via Google and later added a
    // password via this flow), create it.
    const [existing] = await db
      .select({ provider: authAccounts.provider })
      .from(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, row.userId),
          eq(authAccounts.provider, "credentials")
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(authAccounts)
        .set({ access_token: hash })
        .where(
          and(
            eq(authAccounts.userId, row.userId),
            eq(authAccounts.provider, "credentials")
          )
        );
    } else {
      // No credentials account exists yet — the user signed up via OAuth
      // and is adding a password via this flow. Adapter's AdapterAccountType
      // union doesn't include "credentials" (only oauth/oidc/email/webauthn),
      // but the existing sign-up flow stores it with the same cast — see
      // `src/app/sign-up/page.tsx`. Staying consistent.
      await db.insert(authAccounts).values({
        userId: row.userId,
        type: "credentials" as never,
        provider: "credentials",
        providerAccountId: row.userId,
        access_token: hash,
      });
    }

    // Consume only after the hash write succeeds. If we consumed first
    // and then the update threw, the user would be locked out without
    // a way to retry.
    await consumeResetToken(row.id);

    // Notification email — best-effort. We don't want a flaky Resend
    // outage to block a user from signing back in.
    const [user] = await db
      .select({ email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.id, row.userId))
      .limit(1);
    if (user?.email) {
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
      const notif = await sendPasswordChangedEmail(user.email, ip);
      if (!notif.sent) {
        logger.warn("reset-password: notification send failed", {
          userId: row.userId,
          reason: notif.reason,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("reset-password: unexpected failure", { err });
    return NextResponse.json(
      { error: "Reset failed. Please try again." },
      { status: 500 }
    );
  }
}
