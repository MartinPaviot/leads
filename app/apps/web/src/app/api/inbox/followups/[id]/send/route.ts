import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { inboxFollowupNudges } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { deliverInteractiveEmail } from "@/lib/emails/deliver-interactive";

/**
 * POST /api/inbox/followups/[id]/send (P2 — inbox-deal-closer roadmap)
 *
 * The ONLY path that turns a drafted nudge into a real email — every row
 * this feature creates starts and stays at "pending_review" until a human
 * hits this button. Routes through deliverInteractiveEmail (source:
 * "followup_nudge") so the existing sending-identity gate, opt-out
 * suppression, plan limits, and the P3/P4 rate-limit + outcome-watching
 * protections all apply exactly as they do for a manually-typed reply —
 * this feature adds no new send path, it only adds a draft surface on top
 * of the one that already exists.
 *
 * Body: { subject?, body?, version? } — the founder may edit the draft
 * inline before sending; omitted fields fall back to what was generated.
 * Optimistic lock on `version` (same contract as
 * /api/sequences/drafts/[id]/approve): a stale version, or a row already
 * sent/dismissed/expired, refuses with 409 rather than double-sending.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: { subject?: string; body?: string; version?: number } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — send the draft as-generated.
  }

  const [row] = await db
    .select()
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
  if (typeof body.version === "number" && body.version !== row.version) {
    return NextResponse.json(
      { error: "Version mismatch — refresh and retry", currentVersion: row.version },
      { status: 409 },
    );
  }

  const subject = (body.subject ?? row.subject).trim();
  const text = (body.body ?? row.bodyText).trim();
  if (!text) {
    return NextResponse.json({ error: "Body cannot be empty" }, { status: 400 });
  }

  const result = await deliverInteractiveEmail({
    tenantId: authCtx.tenantId,
    ownerAppUserId: authCtx.appUserId,
    to: row.toAddress,
    subject,
    body: text,
    contactId: row.contactId,
    source: "followup_nudge",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 422 });
  }

  // Atomic transition — the WHERE re-asserts version so a parallel send
  // attempt that passed the in-memory check still race-fails at the SQL
  // level (the email already went out via the check above either way; this
  // only protects the row's bookkeeping from a double-write).
  const now = new Date();
  await db
    .update(inboxFollowupNudges)
    .set({ status: "sent", sentAt: now, reviewedAt: now, version: row.version + 1, updatedAt: now })
    .where(
      and(
        eq(inboxFollowupNudges.id, id),
        eq(inboxFollowupNudges.tenantId, authCtx.tenantId),
        eq(inboxFollowupNudges.userId, authCtx.userId),
        eq(inboxFollowupNudges.version, row.version),
      ),
    );

  return NextResponse.json({ ok: true, messageId: result.messageId });
}
