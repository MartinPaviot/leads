import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authUsers } from "@/db/schema";
import { createResetTokenForUser } from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/emails/password-reset";
import {
  rateLimitPasswordResetEmail,
  rateLimitPasswordResetIp,
} from "@/lib/infra/rate-limit";
import { logger } from "@/lib/observability/logger";

const schema = z.object({ email: z.string().email() });

/**
 * POST /api/auth/forgot-password
 *
 * Always returns `{ ok: true }` — even on invalid input, unknown email,
 * rate limit, or email-send failure — so an attacker can't probe whether
 * a given email is registered. All failure modes are logged server-side
 * via `logger.*` with enough context that we can audit abuse without
 * exposing it to the caller.
 */
export async function POST(req: Request) {
  const rawBody = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ua = req.headers.get("user-agent") ?? "";

  const emailLimit = await rateLimitPasswordResetEmail(normalizedEmail);
  const ipLimit = await rateLimitPasswordResetIp(ip);
  if (!emailLimit.success || !ipLimit.success) {
    logger.warn("forgot-password: rate limited", {
      email: normalizedEmail,
      ip,
      emailOk: emailLimit.success,
      ipOk: ipLimit.success,
    });
    return NextResponse.json({ ok: true });
  }

  try {
    const [user] = await db
      .select({ id: authUsers.id, email: authUsers.email })
      .from(authUsers)
      .where(eq(authUsers.email, normalizedEmail))
      .limit(1);

    if (user && user.email) {
      const token = await createResetTokenForUser(user.id, ip, ua);
      const emailResult = await sendPasswordResetEmail(user.email, token);
      if (!emailResult.sent) {
        logger.error("forgot-password: email send failed", {
          userId: user.id,
          reason: emailResult.reason,
        });
      }
    } else {
      // No user — quietly drop. Logged so we can spot email-enumeration
      // attempts in aggregate without leaking to the caller.
      logger.info("forgot-password: unknown email", { email: normalizedEmail });
    }
  } catch (err) {
    logger.error("forgot-password: unexpected failure", { err });
  }

  return NextResponse.json({ ok: true });
}
