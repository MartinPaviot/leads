import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { inboxFollowupNudges } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * POST /api/inbox/followups/[id]/dismiss (P2 — inbox-deal-closer roadmap)
 *
 * The founder doesn't want to send this one — terminal, not a snooze (a
 * genuinely later nudge for the same thread is a NEW stage, drafted fresh
 * by the next cron run; this never resurrects a dismissed row).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const [row] = await db
    .select({ id: inboxFollowupNudges.id, status: inboxFollowupNudges.status, version: inboxFollowupNudges.version })
    .from(inboxFollowupNudges)
    .where(
      and(
        eq(inboxFollowupNudges.id, id),
        eq(inboxFollowupNudges.tenantId, authCtx.tenantId),
        eq(inboxFollowupNudges.userId, authCtx.userId),
      ),
    )
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "Nudge not found" }, { status: 404 });
  }
  if (row.status !== "pending_review") {
    return NextResponse.json({ error: `Nudge is already ${row.status}` }, { status: 409 });
  }

  const now = new Date();
  await db
    .update(inboxFollowupNudges)
    .set({ status: "dismissed", dismissedAt: now, reviewedAt: now, version: row.version + 1, updatedAt: now })
    .where(
      and(
        eq(inboxFollowupNudges.id, id),
        eq(inboxFollowupNudges.tenantId, authCtx.tenantId),
        eq(inboxFollowupNudges.userId, authCtx.userId),
        eq(inboxFollowupNudges.version, row.version),
      ),
    );

  return NextResponse.json({ ok: true });
}
