import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { pendingInvites, users } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  const [invite] = await db
    .select()
    .from(pendingInvites)
    .where(eq(pendingInvites.token, token))
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

  // Switch tenant + role
  await db
    .update(users)
    .set({
      tenantId: invite.tenantId,
      role: invite.role,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

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

  return Response.json({
    success: true,
    tenantId: invite.tenantId,
    role: invite.role,
    /** The session cookie still carries the OLD tenantId — caller must trigger
     *  a re-auth (sign-out/sign-in or token refresh) to pick up the new claims. */
    requiresReauth: true,
  });
}
