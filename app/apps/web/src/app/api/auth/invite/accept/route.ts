import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { pendingInvites, users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { invalidateRoleCache } from "@/lib/auth/fresh-role";
import { logAudit } from "@/lib/infra/audit-log";

/**
 * Accept an invite for the currently-authenticated user.
 *
 * Switches the user's `tenantId` and `role` to those of the invite, then
 * marks the invite as accepted. The user must already be signed in — new
 * users are redirected to /sign-up first by the /accept-invite page.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return Response.json({ error: "token is required" }, { status: 400 });

  // H5 — the token column holds sha256(rawToken). Hash the presented
  // token before looking up so we never compare against the raw value.
  const tokenHash = hashInviteToken(token);
  const [invite] = await db
    .select()
    .from(pendingInvites)
    .where(eq(pendingInvites.token, tokenHash))
    .limit(1);

  if (!invite) return Response.json({ error: "Invite not found" }, { status: 404 });
  if (invite.status !== "pending") {
    return Response.json({ error: `Invite is ${invite.status}` }, { status: 410 });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    await db
      .update(pendingInvites)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(pendingInvites.id, invite.id));
    return Response.json({ error: "Invite expired" }, { status: 410 });
  }

  // Verify the signed-in user's email matches the invite (prevent token hijack)
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, authCtx.appUserId))
    .limit(1);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return Response.json(
      { error: "This invitation was sent to a different email address. Sign in with that account." },
      { status: 403 },
    );
  }

  // No-op if the user is already in the target tenant — accepting
  // an invite you've already accepted shouldn't 500.
  if (authCtx.tenantId === invite.tenantId) {
    await db
      .update(pendingInvites)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        acceptedByUserId: user.id,
        updatedAt: new Date(),
      })
      .where(eq(pendingInvites.id, invite.id));
    return Response.json({ success: true, tenantId: invite.tenantId, role: invite.role, requiresReauth: false });
  }

  // M10 — block the accept if leaving the current tenant would strand
  // OTHER MEMBERS with no admin. Without this guard, a workspace founder
  // who accepts a cross-tenant invite quietly abandons their own org;
  // any remaining members are locked out of billing, invites, and
  // settings (all admin-gated).
  //
  // A SOLO workspace (no other member at all) strands nobody — it just
  // goes dormant. That's the common "signed up first, then got invited
  // to the real workspace" path: blocking it dead-ends the invite,
  // because the sole user has nobody to promote.
  if (authCtx.role === "admin") {
    const [anotherMember] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, authCtx.tenantId), ne(users.id, user.id)))
      .limit(1);
    if (anotherMember) {
      const [anotherAdmin] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.tenantId, authCtx.tenantId),
            eq(users.role, "admin"),
            ne(users.id, user.id)
          )
        )
        .limit(1);
      if (!anotherAdmin) {
        return Response.json(
          {
            error:
              "You're the only admin in your current workspace. Promote another member to admin before accepting this invitation, or delete the workspace first.",
          },
          { status: 409 }
        );
      }
    }
  }

  // Switch tenant + role
  await db
    .update(users)
    .set({
      tenantId: invite.tenantId,
      role: invite.role,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  // The fresh-user-state overlay (getAuthContext) is what routes live
  // sessions to the NEW tenant — drop this instance's cache so the switch
  // bites on the very next request instead of after the 60s TTL.
  invalidateRoleCache(user.id);

  // Mark invite accepted
  await db
    .update(pendingInvites)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      acceptedByUserId: user.id,
      updatedAt: new Date(),
    })
    .where(eq(pendingInvites.id, invite.id));

  // H7 — tenant+role change on a user row is a privileged event. Log
  // against BOTH tenants (destination and origin) so post-hoc review
  // can spot unexpected cross-tenant movement.
  await logAudit({
    tenantId: invite.tenantId,
    userId: user.id,
    action: "update",
    entityType: "user",
    entityId: user.id,
    changes: { tenantId: { old: authCtx.tenantId, new: invite.tenantId }, role: { old: authCtx.role, new: invite.role } },
    metadata: { event: "invite_accepted", inviteId: invite.id },
  });

  return Response.json({
    success: true,
    tenantId: invite.tenantId,
    role: invite.role,
    /** The session cookie still carries the OLD tenantId — caller must trigger
     *  a re-auth (sign-out/sign-in or token refresh) to pick up the new claims. */
    requiresReauth: true,
  });
}
