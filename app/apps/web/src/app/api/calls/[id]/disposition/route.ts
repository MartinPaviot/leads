/**
 * POST /api/calls/[id]/disposition  { outcome }
 *
 * The rep's one-tap disposition at hang-up. Sets the call outcome immediately,
 * feeds it into the campaign cadence (reschedule / terminal), and runs the CRM
 * auto-loop (open/close a deal, tasks) right away — so the rep taps once and
 * moves to the next contact. The async post-call worker still runs on the
 * transcript and enriches the same deal (idempotent), so nothing is lost.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { calls } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { callOutcomeLiteral, type CallNotes } from "@/lib/voice/extraction-schema";
import { recordCallOutcomeForCampaigns } from "@/lib/voice/campaign";
import { applyCallToCrm } from "@/lib/voice/post-call-crm";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withAuthRLS(async (authCtx) => {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { outcome?: string };
    const parsed = callOutcomeLiteral.safeParse(body.outcome);
    if (!parsed.success) {
      return Response.json({ error: "Invalid outcome" }, { status: 400 });
    }
    const outcome = parsed.data;

    const [row] = await db
      .select()
      .from(calls)
      .where(and(eq(calls.id, id), eq(calls.tenantId, authCtx.tenantId)))
      .limit(1);
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });

    const now = new Date();
    const reached = outcome === "connected" || outcome === "meeting_booked" || outcome === "callback_requested";
    await db
      .update(calls)
      .set({
        outcome,
        endedAt: row.endedAt ?? now,
        connectedAt: row.connectedAt ?? (reached ? now : null),
        updatedAt: now,
      })
      .where(eq(calls.id, id));

    // Feed the cadence immediately (reschedule a miss, end on reached/terminal).
    await recordCallOutcomeForCampaigns({
      tenantId: authCtx.tenantId,
      contactId: row.contactId,
      outcome,
      occurredAt: now,
      ownerId: row.userId, // per-user Call Mode: feed the calling rep's cadence
    }).catch(() => {});

    // Immediate CRM routing from the disposition (the transcript worker later
    // enriches the same deal). Minimal notes; idempotent.
    const minimalNotes: CallNotes = {
      summary: "Disposition set by rep at hang-up.",
      outcome,
      sentiment: outcome === "meeting_booked" || outcome === "connected" ? "positive" : outcome === "not_interested" ? "negative" : "neutral",
      keyPoints: [],
      actionItems: [],
      buyingSignals: { budget: null, timeline: null, currentStack: [], painPoints: [], objections: [], nextSteps: [], competitors: [], teamSize: null },
      callbackRequest: outcome === "callback_requested" ? { requested: true, whenIso: null, note: null } : null,
    };
    const crm = await applyCallToCrm({
      tenantId: authCtx.tenantId,
      callId: row.id,
      contactId: row.contactId,
      companyId: null,
      ownerId: row.userId,
      notes: minimalNotes,
      occurredAt: now,
    }).catch(() => null);

    return Response.json({
      ok: true,
      outcome,
      dealId: crm?.dealId ?? null,
      dealAction: crm?.dealAction ?? null,
      tasksCreated: crm?.tasksCreated ?? 0,
    });
  });
}
