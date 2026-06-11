import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { pendingInvites, tenants, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sendInviteEmail } from "@/lib/emails/email-invite";
import { generateInviteToken } from "@/lib/auth/invite-token";

const MAX_RESENDS = 3;

/** Cancel (soft delete) a pending invite. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const { id } = await params;
  const result = await db
    .update(pendingInvites)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(
      eq(pendingInvites.id, id),
      eq(pendingInvites.tenantId, authCtx.tenantId),
      eq(pendingInvites.status, "pending"),
    ))
    .returning({ id: pendingInvites.id });

  if (result.length === 0) {
    return Response.json({ error: "Invite not found or already accepted" }, { status: 404 });
  }
  return Response.json({ success: true });
}

/**
 * POST — refresh a pending invite's link.
 *   action "resend" (default): rotate the token, email it, count it (cap 3).
 *   action "link": rotate the token and RETURN the fresh accept URL without
 *     sending an email or burning a resend — for "Copy link", so an admin can
 *     share it directly (chat, etc.) when email deliverability is unreliable.
 * Both rotate the token, so the previously-shared link stops working.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  const linkOnly = body.action === "link";

  const { id } = await params;
  const [invite] = await db
    .select()
    .from(pendingInvites)
    .where(and(
      eq(pendingInvites.id, id),
      eq(pendingInvites.tenantId, authCtx.tenantId),
    ))
    .limit(1);

  if (!invite) return Response.json({ error: "Invite not found" }, { status: 404 });
  if (invite.status !== "pending") {
    return Response.json({ error: `Cannot resend ${invite.status} invite` }, { status: 400 });
  }
  if (!linkOnly && invite.resendCount >= MAX_RESENDS) {
    return Response.json({ error: `Resend limit reached (${MAX_RESENDS})` }, { status: 429 });
  }

  const [tenant] = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, authCtx.tenantId))
    .limit(1);
  const [inviter] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(eq(users.id, authCtx.appUserId))
    .limit(1);
  const inviterName = [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ") || inviter?.email || "A teammate";

  // H5 — we only store the SHA-256 hash of the invite token, so the
  // raw one from the original send is unrecoverable. Resend rotates
  // the token: a fresh raw token is minted, emailed, and its hash
  // replaces the prior one in the DB. Side benefit: if the previous
  // link ever leaked (shoulder-surfed an email, forwarded share), it
  // stops working as soon as the admin clicks "Resend".
  const { raw: rawToken, hash: tokenHash } = generateInviteToken();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(req.url).origin ||
    "https://www.elevay.dev";
  const acceptUrl = `${appUrl}/accept-invite?token=${rawToken}`;

  // Link-only: persist the rotated token and return the URL, no email/no count.
  if (linkOnly) {
    await db
      .update(pendingInvites)
      .set({ token: tokenHash, updatedAt: new Date() })
      .where(eq(pendingInvites.id, id));
    return Response.json({ success: true, acceptUrl });
  }

  const sendResult = await sendInviteEmail({
    to: invite.email,
    workspaceName: tenant?.name || "your team",
    inviterName,
    inviterEmail: inviter?.email,
    role: invite.role as "admin" | "member" | "viewer",
    acceptUrl,
    expiresAt: invite.expiresAt,
  });

  await db
    .update(pendingInvites)
    .set({
      token: tokenHash,
      lastSentAt: new Date(),
      resendCount: invite.resendCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(pendingInvites.id, id));

  return Response.json({
    success: true,
    emailSent: sendResult.sent,
    emailError: sendResult.sent ? undefined : sendResult.reason,
    resendCount: invite.resendCount + 1,
    acceptUrl,
  });
}
