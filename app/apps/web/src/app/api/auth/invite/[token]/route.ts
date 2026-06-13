import { db } from "@/db";
import { tenants, authUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateInviteToken } from "@/lib/auth/invite-validate";

/**
 * Public endpoint — no auth required. Validates an invite token and returns
 * enough info for the accept-invite page to render. The token IS the auth.
 *
 * H5: `pending_invites.token` stores a SHA-256 hash of the real token;
 * validateInviteToken hashes the URL-provided token and looks it up that way.
 * (Same validation the sign-up gate uses — one source of truth.)
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const result = await validateInviteToken(token);
  if (!result.valid) {
    const status =
      result.reason === "missing_token" ? 400 : result.reason === "not_found" ? 404 : 410;
    return Response.json({ valid: false, reason: result.reason }, { status });
  }
  const invite = result.invite;

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
