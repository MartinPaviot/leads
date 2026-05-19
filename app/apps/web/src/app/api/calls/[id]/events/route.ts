/**
 * GET /api/calls/[id]/events — Server-Sent Events for the live call.
 *
 * Phase 1 emits transition events derived from polling the `calls` row:
 *   - "ringing"     when the row gets a connectedAt that's still null
 *                   but the call is mid-flight (heuristic for early UI)
 *   - "connected"   when connectedAt is set
 *   - "ended"       when endedAt is set or processingState transitions
 *                   to "done"
 *
 * Streaming transcript chunks (Phase 1.5) will land here as
 * "transcript" events. Plumbing the channel today lets the UI work
 * end-to-end without WS infra.
 */

import { db } from "@/db";
import { calls } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 1000;
const MAX_DURATION_MS = 10 * 60 * 1000; // 10 min hard cap

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await ctx.params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      let lastConnected: Date | null = null;
      let lastEndedAt: Date | null = null;
      let lastProcessing: string | null = null;
      let lastTranscriptCount = 0;
      let lastAnsweredBy: string | null = null;
      let lastVoicemailDropped = false;
      let lastCoachingCardCount = 0;
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          closed = true;
        }
      };

      // Initial snapshot.
      const [initial] = await db
        .select()
        .from(calls)
        .where(and(eq(calls.id, id), eq(calls.tenantId, authCtx.tenantId)))
        .limit(1);
      if (!initial) {
        send("error", { code: "not_found" });
        controller.close();
        return;
      }
      send("snapshot", {
        callId: initial.id,
        outcome: initial.outcome,
        connectedAt: initial.connectedAt,
        endedAt: initial.endedAt,
        processingState: initial.processingState,
        answeredBy: initial.answeredBy,
        voicemailDropped: initial.voicemailDropped,
        coachingCardCount: Array.isArray(initial.coachingCards)
          ? (initial.coachingCards as unknown[]).length
          : 0,
      });
      // Seed transcript cursor with what's already on disk so we don't
      // re-emit chunks the client never saw if it (re)connects mid-call.
      {
        const existing = Array.isArray(initial.transcript)
          ? (initial.transcript as unknown[])
          : [];
        lastTranscriptCount = existing.length;
      }
      lastAnsweredBy = initial.answeredBy ?? null;
      lastVoicemailDropped = initial.voicemailDropped ?? false;
      {
        const cards = Array.isArray(initial.coachingCards)
          ? (initial.coachingCards as unknown[])
          : [];
        lastCoachingCardCount = cards.length;
      }

      const interval = setInterval(async () => {
        if (closed || Date.now() - startedAt > MAX_DURATION_MS) {
          clearInterval(interval);
          if (!closed) {
            send("timeout", { reason: "max_duration" });
            try { controller.close(); } catch { /* ignore */ }
            closed = true;
          }
          return;
        }
        try {
          const [row] = await db
            .select({
              connectedAt: calls.connectedAt,
              endedAt: calls.endedAt,
              outcome: calls.outcome,
              processingState: calls.processingState,
              transcript: calls.transcript,
              answeredBy: calls.answeredBy,
              voicemailDropped: calls.voicemailDropped,
              coachingCards: calls.coachingCards,
            })
            .from(calls)
            .where(and(eq(calls.id, id), eq(calls.tenantId, authCtx.tenantId)))
            .limit(1);
          if (!row) return;

          if (row.connectedAt && !lastConnected) {
            lastConnected = row.connectedAt;
            send("connected", { connectedAt: row.connectedAt });
          }

          if (row.answeredBy && row.answeredBy !== lastAnsweredBy) {
            lastAnsweredBy = row.answeredBy;
            if (row.answeredBy.startsWith("machine")) {
              send("amd_detected", { answeredBy: row.answeredBy });
            } else if (row.answeredBy === "human") {
              send("human_detected", { answeredBy: row.answeredBy });
            }
          }

          if (row.voicemailDropped && !lastVoicemailDropped) {
            lastVoicemailDropped = true;
            send("voicemail_dropped", {});
          }

          // Stream new transcript chunks as the bridge appends them.
          // We only emit suffix slices — clients reconnecting after a
          // tab refresh get the seeded count from the snapshot above.
          const chunks = Array.isArray(row.transcript)
            ? (row.transcript as Array<{
                speaker: string;
                text: string;
                tsMs?: number;
              }>)
            : [];
          if (chunks.length > lastTranscriptCount) {
            for (let i = lastTranscriptCount; i < chunks.length; i++) {
              send("transcript", chunks[i]);
            }
            lastTranscriptCount = chunks.length;
          }

          // Phase 3 — live coaching cards emitted as they land.
          const cards = Array.isArray(row.coachingCards)
            ? (row.coachingCards as Array<{
                ts: number;
                objectionClass: string;
                label: string;
                prospectQuote: string;
                suggestedResponses: string[];
              }>)
            : [];
          if (cards.length > lastCoachingCardCount) {
            for (let i = lastCoachingCardCount; i < cards.length; i++) {
              send("coaching_card", cards[i]);
            }
            lastCoachingCardCount = cards.length;
          }

          if (row.endedAt && !lastEndedAt) {
            lastEndedAt = row.endedAt;
            send("ended", {
              endedAt: row.endedAt,
              outcome: row.outcome,
            });
          }
          if (
            row.processingState &&
            row.processingState !== lastProcessing
          ) {
            lastProcessing = row.processingState;
            send("processing", { state: row.processingState });
            if (row.processingState === "done") {
              clearInterval(interval);
              try { controller.close(); } catch { /* ignore */ }
              closed = true;
            }
          }
        } catch (err) {
          send("error", {
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }, POLL_INTERVAL_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
