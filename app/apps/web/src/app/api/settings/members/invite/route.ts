import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import { db } from "@/db";
import { pendingInvites, users, tenants } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendInviteEmail } from "@/lib/email-invite";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  let body: { email?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = body.role === "admin" ? "admin" : "member";
  if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
    return Response.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Reject if already a member of this tenant
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, authCtx.tenantId), eq(users.email, rawEmail)))
    .limit(1);
  if (existingUser) {
    return Response.json({ error: "User is already a member of this workspace" }, { status: 400 });
  }

  // Look up workspace + inviter for the email
  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, authCtx.tenantId))
    .limit(1);
  if (!tenant) return Response.json({ error: "Workspace not found" }, { status: 404 });

  const [inviter] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(eq(users.id, authCtx.appUserId))
    .limit(1);
  const inviterName = [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ") || inviter?.email || "A teammate";

  // Re-use an existing pending invite for this (tenant,email) — refresh role + token + reset counters
  const [existing] = await db
    .select()
    .from(pendingInvites)
    .where(and(
      eq(pendingInvites.tenantId, authCtx.tenantId),
      eq(pendingInvites.email, rawEmail),
      eq(pendingInvites.status, "pending"),
    ))
    .limit(1);

  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const token = generateInviteToken();

  let inviteId: string;
  if (existing) {
    await db
      .update(pendingInvites)
      .set({
        role,
        token,
        expiresAt,
        lastSentAt: new Date(),
        invitedByUserId: authCtx.appUserId,
        updatedAt: new Date(),
      })
      .where(eq(pendingInvites.id, existing.id));
    inviteId = existing.id;
  } else {
    const [created] = await db
      .insert(pendingInvites)
      .values({
        tenantId: authCtx.tenantId,
        email: rawEmail,
        role,
        token,
        expiresAt,
        invitedByUserId: authCtx.appUserId,
      })
      .returning({ id: pendingInvites.id });
    inviteId = created.id;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const acceptUrl = `${appUrl}/accept-invite?token=${token}`;

  const sendResult = await sendInviteEmail({
    to: rawEmail,
    workspaceName: tenant.name || "your team",
    inviterName,
    inviterEmail: inviter?.email,
    role,
    acceptUrl,
    expiresAt,
  });

  return Response.json({
    invite: {
      id: inviteId,
      email: rawEmail,
      role,
      expiresAt: expiresAt.toISOString(),
    },
    emailSent: sendResult.sent,
    emailError: sendResult.sent ? undefined : sendResult.reason,
  }, { status: 201 });
}
