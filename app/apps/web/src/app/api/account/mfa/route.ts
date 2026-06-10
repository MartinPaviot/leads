import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { authUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/auth-utils";
import {
  confirmMfaEnrollment,
  disableMfa,
  getMfaStatus,
  startMfaEnrollment,
  verifyMfaCode,
} from "@/lib/auth/mfa";
import { logAudit } from "@/lib/infra/audit-log";

/**
 * SOC2 T4 — TOTP MFA management for the signed-in user.
 *   GET    -> { enabled, pending, recoveryCodesRemaining }
 *   POST   -> start enrollment (refused while already enabled): { otpauthUrl, manualKey }
 *   PUT    -> confirm with the first code: { recoveryCodes } (plaintext, shown once)
 *   DELETE -> disable; reauth with current password OR a valid TOTP/recovery code
 */

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getMfaStatus(authCtx.userId));
}

export async function POST() {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db
    .select({ email: authUsers.email })
    .from(authUsers)
    .where(eq(authUsers.id, authCtx.userId))
    .limit(1);
  if (!user?.email) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }

  try {
    const enrollment = await startMfaEnrollment(authCtx.userId, user.email);
    return NextResponse.json(enrollment);
  } catch {
    return NextResponse.json(
      { error: "MFA is already enabled. Disable it first to re-enroll." },
      { status: 400 },
    );
  }
}

const confirmSchema = z.object({ code: z.string().min(6).max(16) });

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = confirmSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const result = await confirmMfaEnrollment(authCtx.userId, parsed.data.code);
  if (!result) {
    return NextResponse.json(
      { error: "That code didn't match. Enter a fresh code from your authenticator." },
      { status: 400 },
    );
  }

  await logAudit({
    tenantId: authCtx.tenantId,
    userId: authCtx.appUserId,
    action: "update",
    entityType: "user",
    entityId: authCtx.appUserId,
    metadata: { event: "mfa_enrolled" },
  });

  return NextResponse.json(result);
}

const disableSchema = z.object({
  password: z.string().optional(),
  code: z.string().optional(),
});

export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = disableSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || (!parsed.data.password && !parsed.data.code)) {
    return NextResponse.json(
      { error: "Confirm with your password or a current authentication code." },
      { status: 400 },
    );
  }

  // Reauth: a stolen session alone must not be able to strip the second
  // factor. Password if the account has one; otherwise a live TOTP /
  // recovery code proves possession of the factor being removed.
  let reauthOk = false;
  if (parsed.data.password) {
    const [user] = await db
      .select({ hash: authUsers.passwordHash })
      .from(authUsers)
      .where(eq(authUsers.id, authCtx.userId))
      .limit(1);
    if (user?.hash) {
      reauthOk = await bcrypt.compare(parsed.data.password, user.hash);
    }
  }
  if (!reauthOk && parsed.data.code) {
    reauthOk = await verifyMfaCode(authCtx.userId, parsed.data.code);
  }
  if (!reauthOk) {
    return NextResponse.json(
      { error: "Verification failed. Check your password or code." },
      { status: 400 },
    );
  }

  await disableMfa(authCtx.userId);
  await logAudit({
    tenantId: authCtx.tenantId,
    userId: authCtx.appUserId,
    action: "update",
    entityType: "user",
    entityId: authCtx.appUserId,
    metadata: { event: "mfa_disabled" },
  });

  return NextResponse.json({ success: true });
}
