import { db } from "@/db";
import { pendingInvites, tenants, authUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashInviteToken } from "@/lib/auth/invite-token";

/**
 * Public endpoint — no auth required. Validates an invite token and returns
 * enough info for the accept-invite page to render. The token IS the auth.
 *
 * H5: `pending_invites.token` stores a SHA-256 hash of the real token;
 * we hash the URL-provided token and look it up that way.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return Response.json({ valid: false, reason: "missing_token" }, { status: 400 });

  const tokenHash = hashInviteToken(token);
  const [invite] = await db
    .select({
      id: pendingInvites.id,
      tenantId: pendingInvites.tenantId,
      email: pendingInvites.email,
      role: pendingInvites.role,
      status: pendingInvites.status,
      expiresAt: pendingInvites.expiresAt,
    })
    .from(pendingInvites)
    .where(eq(pendingInvites.token, tokenHash))
    .limit(1);

  if (!invite) return Response.json({ valid: false, reason: "not_found" }, { status: 404 });
  if (invite.status !== "pending") {
    return Response.json({ valid: false, reason: invite.status }, { status: 410 });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    // Mark expired so /invites list stops showing it
    await db
      .update(pendingInvites)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(pendingInvites.id, invite.id));
    return Response.json({ valid: false, reason: "expired" }, { status: 410 });
  }

  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, invite.tenantId))
    .limit(1);

  // Does the invited email already have an account? Lets the accept page
  // offer the right primary action (sign in vs create account) instead of
  // both. Safe to reveal here: the caller already holds the invite token
  // for this exact address (the inviter chose it), so this isn't account
  // enumeration — it's the same trust boundary as the rest of this endpoint.
  const [account] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, invite.email.toLowerCase()))
    .limit(1);

  return Response.json({
    valid: true,
    invite: {
      email: invite.email,
      role: invite.role,
      workspace: tenant?.name || "the workspace",
      expiresAt: invite.expiresAt.toISOString(),
      hasAccount: !!account,
    },
  });
}
