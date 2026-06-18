import { getAuthContext } from "@/lib/auth/auth-utils";
import { requireCapabilityForRequest } from "@/lib/auth/permissions";
import { db } from "@/db";
import {
  users,
  tenants,
  contacts,
  companies,
  deals,
  activities,
  notes,
  tasks,
  chatThreads,
  chatMessages,
  sequences,
  sequenceSteps,
  sequenceEnrollments,
  outboundEmails,
  emailOptouts,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logAudit } from "@/lib/infra/audit-log";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // CLE-12 — unified matrix gate on the fresh DB role. A workspace-wide GDPR
  // purge is admin-only (settings:write); previously this route had NO role
  // gate, so any member could trigger it (gap closed, access NARROWED).
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));

    if (body.confirm !== "DELETE_ALL_DATA") {
      return Response.json(
        {
          error: "Confirmation required",
          message:
            'Send { "confirm": "DELETE_ALL_DATA" } to proceed with permanent deletion.',
        },
        { status: 400 }
      );
    }

    const tenantId = authCtx.tenantId;

    // Get user record for deletion
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.clerkId, authCtx.userId), eq(users.tenantId, tenantId)));
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // H7 — log the GDPR delete BEFORE the cascading deletes execute.
    // Once we wipe the tenant's tables (including `activities`, where
    // the audit entry lives), the trail is gone. The entry is tiny
    // and survives in the tenant's activity feed up to the moment
    // the feed itself is deleted — which is exactly when the user
    // asked us to forget them, so this is the right semantics.
    await logAudit({
      tenantId,
      userId: authCtx.appUserId,
      action: "delete",
      entityType: "tenant",
      entityId: tenantId,
      metadata: {
        event: "gdpr_delete_initiated",
        ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
      },
    });

    // Delete in dependency order (children before parents)

    // 1. Chat messages (depends on chatThreads)
    const tenantThreads = await db
      .select({ id: chatThreads.id })
      .from(chatThreads)
      .where(eq(chatThreads.tenantId, tenantId));
    for (const thread of tenantThreads) {
      await db
        .delete(chatMessages)
        .where(eq(chatMessages.threadId, thread.id));
    }

    // 2. Chat threads
    await db.delete(chatThreads).where(eq(chatThreads.tenantId, tenantId));

    // 3. Outbound emails (depends on sequenceEnrollments, contacts, connectedMailboxes)
    await db
      .delete(outboundEmails)
      .where(eq(outboundEmails.tenantId, tenantId));

    // 4. Sequence enrollments (depends on sequences, contacts)
    const tenantSequences = await db
      .select({ id: sequences.id })
      .from(sequences)
      .where(eq(sequences.tenantId, tenantId));
    for (const seq of tenantSequences) {
      await db
        .delete(sequenceEnrollments)
        .where(eq(sequenceEnrollments.sequenceId, seq.id));
    }

    // 5. Sequence steps (depends on sequences)
    for (const seq of tenantSequences) {
      await db
        .delete(sequenceSteps)
        .where(eq(sequenceSteps.sequenceId, seq.id));
    }

    // 6. Sequences
    await db.delete(sequences).where(eq(sequences.tenantId, tenantId));

    // 7. Email optouts
    await db.delete(emailOptouts).where(eq(emailOptouts.tenantId, tenantId));

    // 8. Activities
    await db.delete(activities).where(eq(activities.tenantId, tenantId));

    // 9. Notes
    await db.delete(notes).where(eq(notes.tenantId, tenantId));

    // 10. Tasks
    await db.delete(tasks).where(eq(tasks.tenantId, tenantId));

    // 11. Deals (depends on contacts, companies)
    await db.delete(deals).where(eq(deals.tenantId, tenantId));

    // 12. Contacts (depends on companies)
    await db.delete(contacts).where(eq(contacts.tenantId, tenantId));

    // 13. Companies
    await db.delete(companies).where(eq(companies.tenantId, tenantId));

    // 14. User record
    await db.delete(users).where(eq(users.id, user.id));

    // 15. Tenant record
    await db.delete(tenants).where(eq(tenants.id, tenantId));

    return Response.json({
      success: true,
      message:
        "All data has been permanently deleted. Your account and tenant have been removed.",
      deletedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GDPR deletion failed:", error);
    return Response.json({ error: "Deletion failed" }, { status: 500 });
  }
}
