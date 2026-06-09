/**
 * GET /api/contacts/[id]/calls
 *
 * Past calls for a contact, newest first — the durable record of every cold
 * call: outcome, sentiment, summary, buying signals, the speaker-labelled
 * transcript, and a proxied recording link. Powers the post-call transcript
 * viewer on the contact fiche (the transcript persisted by the live bridge is
 * surfaced here long after the call). Tenant-scoped read.
 */

import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { calls } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return withAuthRLS(async (authCtx) => {
    const { id } = await ctx.params;
    const rows = await db
      .select({
        id: calls.id,
        createdAt: calls.createdAt,
        connectedAt: calls.connectedAt,
        endedAt: calls.endedAt,
        durationSec: calls.durationSec,
        outcome: calls.outcome,
        sentiment: calls.sentiment,
        summary: calls.summary,
        fromNumber: calls.fromNumber,
        buyingSignals: calls.buyingSignals,
        transcript: calls.transcript,
        recordingUrl: calls.recordingUrl,
      })
      .from(calls)
      .where(and(eq(calls.contactId, id), eq(calls.tenantId, authCtx.tenantId)))
      .orderBy(desc(calls.createdAt))
      .limit(50);

    const result = rows.map((r) => {
      const transcript = Array.isArray(r.transcript)
        ? (r.transcript as Array<{ speaker?: string; text?: string; tsMs?: number }>)
        : [];
      return {
        id: r.id,
        createdAt: r.createdAt,
        connectedAt: r.connectedAt,
        endedAt: r.endedAt,
        durationSec: r.durationSec ?? null,
        outcome: r.outcome ?? null,
        sentiment: r.sentiment ?? null,
        summary: r.summary ?? null,
        fromNumber: r.fromNumber ?? null,
        buyingSignals: r.buyingSignals ?? null,
        transcriptChunkCount: transcript.length,
        transcript,
        // Raw Twilio recording URL needs basic auth — only expose the proxy.
        recordingUrl: r.recordingUrl ? `/api/calls/${r.id}/recording` : null,
      };
    });

    return Response.json({ calls: result });
  });
}
