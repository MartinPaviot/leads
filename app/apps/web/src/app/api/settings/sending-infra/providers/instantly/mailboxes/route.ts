import { NextResponse } from "next/server";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { connectedMailboxes, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * GET/PATCH the imported Instantly mailboxes for the workspace + their rep
 * assignment. Admin-only — assignment is a workspace-management action.
 *
 * Ownership note: `connected_mailboxes.user_id` stores the rep's AUTH id
 * (`users.clerk_id`), which is what `getInboxScope` matches against. The UI
 * works in app `users.id`, so GET resolves owner → app id and PATCH translates
 * the chosen member (app id) → clerk_id before writing. Get this wrong and an
 * assigned box shows up in nobody's inbox.
 */

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const rows = await db
    .select({
      id: connectedMailboxes.id,
      emailAddress: connectedMailboxes.emailAddress,
      displayName: connectedMailboxes.displayName,
      ownerId: users.id,
      ownerEmail: users.email,
    })
    .from(connectedMailboxes)
    .leftJoin(
      users,
      and(eq(users.clerkId, connectedMailboxes.userId), eq(users.tenantId, authCtx.tenantId)),
    )
    .where(
      and(
        eq(connectedMailboxes.tenantId, authCtx.tenantId),
        eq(connectedMailboxes.provider, "instantly"),
      ),
    )
    .orderBy(connectedMailboxes.emailAddress);

  return NextResponse.json({
    mailboxes: rows.map((r) => ({
      id: r.id,
      emailAddress: r.emailAddress,
      displayName: r.displayName,
      ownerId: r.ownerId ?? null,
      ownerEmail: r.ownerEmail ?? null,
    })),
  });
}

export async function PATCH(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const body = (await req.json().catch(() => ({}))) as {
    mailboxId?: unknown;
    ownerId?: unknown; // app users.id, or null to unassign
  };
  const mailboxId = typeof body.mailboxId === "string" ? body.mailboxId : "";
  if (!mailboxId) {
    return NextResponse.json({ error: "mailboxId required" }, { status: 400 });
  }
  const ownerAppId =
    body.ownerId === null || body.ownerId === undefined
      ? null
      : typeof body.ownerId === "string"
        ? body.ownerId
        : "";
  if (ownerAppId === "") {
    return NextResponse.json({ error: "ownerId must be a member id or null" }, { status: 400 });
  }

  // Resolve the chosen member (app id) → their auth id (clerk_id), scoped to
  // this tenant. Null clears the assignment.
  let ownerClerkId: string | null = null;
  if (ownerAppId) {
    const [member] = await db
      .select({ clerkId: users.clerkId })
      .from(users)
      .where(and(eq(users.id, ownerAppId), eq(users.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!member?.clerkId) {
      return NextResponse.json({ error: "That member isn't in this workspace" }, { status: 400 });
    }
    ownerClerkId = member.clerkId;
  }

  const [updated] = await db
    .update(connectedMailboxes)
    .set({ userId: ownerClerkId, updatedAt: new Date() })
    .where(
      and(
        eq(connectedMailboxes.id, mailboxId),
        eq(connectedMailboxes.tenantId, authCtx.tenantId),
        eq(connectedMailboxes.provider, "instantly"),
      ),
    )
    .returning({ id: connectedMailboxes.id });

  if (!updated) {
    return NextResponse.json({ error: "mailbox not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, mailboxId, ownerId: ownerAppId });
}
