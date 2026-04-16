import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { authUsers } from "@/db/schema";
import { createVerifyTokenForUser } from "@/lib/email-verification";
import { sendVerifyEmail } from "@/lib/emails/verify-email";
import {
  rateLimitVerifyEmail,
  rateLimitVerifyEmailIp,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * POST /api/auth/verify-email/send
 *
 * Re-send the verification link to the currently authenticated user's
 * email. Always returns `{ ok: true }` on success/idempotent paths so
 * the UI can show "Email sent" without disclosing whether the address
 * was actually deliverable. Real failures are logged.
 *
 * Auth is required — anonymous calls get 401, which is fine since the
 * sign-up flow auto-issues the first token server-side, and the resend
 * button is only shown to signed-in users on /verify-email-sent.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = session.user.id;
  const normalizedEmail = session.user.email.toLowerCase().trim();
  const ip =
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    "unknown";
  const ua = req.headers.get("user-agent") ?? "";

  const emailLimit = await rateLimitVerifyEmail(normalizedEmail);
  const ipLimit = await rateLimitVerifyEmailIp(ip);
  if (!emailLimit.success || !ipLimit.success) {
    logger.warn("verify-email/send: rate limited", {
      email: normalizedEmail,
      ip,
      emailOk: emailLimit.success,
      ipOk: ipLimit.success,
    });
    return NextResponse.json({ ok: true });
  }

  try {
    const [user] = await db
      .select({
        id: authUsers.id,
        email: authUsers.email,
        emailVerified: authUsers.emailVerified,
      })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);

    if (!user || !user.email) {
      return NextResponse.json({ ok: true });
    }

    if (user.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }

    const token = await createVerifyTokenForUser(user.id, ip, ua);
    const sendResult = await sendVerifyEmail(user.email, token);
    if (!sendResult.sent) {
      logger.error("verify-email/send: email send failed", {
        userId: user.id,
        reason: sendResult.reason,
      });
    }
  } catch (err) {
    logger.error("verify-email/send: unexpected failure", { err });
  }

  return NextResponse.json({ ok: true });
}
