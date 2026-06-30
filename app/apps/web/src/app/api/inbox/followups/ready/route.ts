import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { inboxFollowupNudges } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

/**
 * GET /api/inbox/followups/ready (P2 — inbox-deal-closer roadmap)
 *
 * Lists the current user's drafted-but-unreviewed follow-up nudges
 * (status "pending_review"), oldest first. Tenant + user scoped — a
 * connected mailbox is personal, so this never surfaces a teammate's
 * drafts. Read-only; the founder approves via the send/dismiss routes.
 */
export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await db
      .select({
        id: inboxFollowupNudges.id,
        conversationKey: inboxFollowupNudges.conversationKey,
        contactId: inboxFollowupNudges.contactId,
        toAddress: inboxFollowupNudges.toAddress,
        subject: inboxFollowupNudges.subject,
        bodyText: inboxFollowupNudges.bodyText,
        stage: inboxFollowupNudges.stage,
        generatedAt: inboxFollowupNudges.generatedAt,
        version: inboxFollowupNudges.version,
      })
      .from(inboxFollowupNudges)
      .where(
        and(
          eq(inboxFollowupNudges.tenantId, authCtx.tenantId),
          eq(inboxFollowupNudges.userId, authCtx.userId),
          eq(inboxFollowupNudges.status, "pending_review"),
        ),
      )
      .orderBy(asc(inboxFollowupNudges.generatedAt));
    return NextResponse.json({ nudges: rows });
  } catch (err) {
    console.error("inbox/followups/ready failed", err);
    // Same posture as warm-leads/scan — an empty list is a normal state,
    // never a hard failure surfaced to the dashboard card.
    return NextResponse.json({ nudges: [] });
  }
}
