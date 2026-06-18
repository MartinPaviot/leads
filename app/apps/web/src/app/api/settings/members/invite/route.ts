import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { requirePermission, requireCapabilityForRequest } from "@/lib/auth/permissions";
import { db } from "@/db";
import { pendingInvites, users, tenants } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sendInviteEmail } from "@/lib/emails/email-invite";
import { generateInviteToken } from "@/lib/auth/invite-token";
import { logAudit } from "@/lib/infra/audit-log";
import { invalidateRoleCache } from "@/lib/auth/fresh-role";
import { invalidateSessionGuard } from "@/lib/auth/session-guard";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Granular permission check (subsumes the old admin-only gate)
  const denied = requirePermission(authCtx.role, "members:invite");
  if (denied) return denied;
  // CLE-12 — belt-and-braces matrix gate on the fresh DB role, resolving the
  // capability from the SAME route map the middleware uses (members:invite).
  const routeDenied = requireCapabilityForRequest(authCtx, req);
  if (routeDenied) return routeDenied;

  let body: { email?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  // Allowlist parse — unknown values coerce to member, never to admin.
  const role =
    body.role === "admin" || body.role === "viewer"
      ? body.role
      : "member";
  if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
    return Response.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Already in this tenant? An ACTIVE member is a no-op (reject). A previously
  // REVOKED (deactivated) member is re-added in place: clearing deactivated_at
  // restores their login + access immediately and re-applies the chosen role,
  // so "remove" stays reversible without stranding the account. No email/link
  // needed — they keep their existing account.
  const [existingUser] = await db
    .select({ id: users.id, clerkId: users.clerkId, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(and(eq(users.tenantId, authCtx.tenantId), eq(users.email, rawEmail)))
    .limit(1);
  if (existingUser && !existingUser.deactivatedAt) {
    return Response.json({ error: "User is already a member of this workspace" }, { status: 400 });
  }
  if (existingUser && existingUser.deactivatedAt) {
    await db
      .update(users)
      .set({ deactivatedAt: null, role, updatedAt: new Date() })
      .where(eq(users.id, existingUser.id));
    invalidateSessionGuard(existingUser.clerkId);
    invalidateRoleCache(existingUser.id);
    await logAudit({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      action: "reactivate",
      entityType: "user",
      entityId: existingUser.id,
      changes: { role: { old: null, new: role } },
      metadata: { event: "member_readded", email: rawEmail, role },
    });
    return Response.json(
      { reactivated: true, member: { id: existingUser.id, email: rawEmail, role } },
      { status: 200 },
    );
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
  // H5: the column stores the SHA-256 hash; only the raw token goes
  // in the accept link and the email itself.
  const { raw: rawToken, hash: tokenHash } = generateInviteToken();

  let inviteId: string;
  if (existing) {
    await db
      .update(pendingInvites)
      .set({
        role,
        token: tokenHash,
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
        token: tokenHash,
        expiresAt,
        invitedByUserId: authCtx.appUserId,
      })
      .returning({ id: pendingInvites.id });
    inviteId = created.id;
  }

  // Prefer the configured public URL; fall back to the request origin, then
  // to the canonical prod host. The request origin can be an internal Vercel
  // alias on server-to-server calls, which would bake a non-clickable host
  // into the invite link — the canonical default guarantees a usable URL.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(req.url).origin ||
    "https://www.elevay.dev";
  const acceptUrl = `${appUrl}/accept-invite?token=${rawToken}`;

  const sendResult = await sendInviteEmail({
    to: rawEmail,
    workspaceName: tenant.name || "your team",
    inviterName,
    inviterEmail: inviter?.email,
    role,
    acceptUrl,
    expiresAt,
  });

  // H7 — record who invited whom into the tenant. Role is the sensitive
  // bit (admin invites can reshape the workspace's blast radius).
  await logAudit({
    tenantId: authCtx.tenantId,
    userId: authCtx.appUserId,
    action: existing ? "update" : "create",
    entityType: "pending_invite",
    entityId: inviteId,
    metadata: { event: "invite_sent", email: rawEmail, role, emailSent: sendResult.sent },
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
    // The shareable accept link. Surfaced so an admin can copy and send it
    // directly (chat, etc.) instead of relying on email deliverability.
    acceptUrl,
  }, { status: 201 });
}
