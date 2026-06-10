/**
 * POST /api/calls/transcription?callId=<id>
 *
 * Twilio real-time transcription webhook (the serverless replacement for the
 * Media Streams WS bridge). Twilio's <Start><Transcription> POSTs transcript
 * events here; we persist final chunks to `calls.transcript` (same jsonb shape
 * the SSE /api/calls/[id]/events reads) and run the objection classifier on
 * prospect chunks into `calls.coachingCards`. Fully durable — no WS server,
 * tunnel, or extra host.
 *
 * Twilio sends form-urlencoded params; we HMAC-validate the signature.
 */

import { db } from "@/db";
import { calls } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { validateTwilioSignature } from "@/lib/voice/twilio-signature";
import { looksLikeObjection } from "@/lib/voice/coaching-playbook";
import { classifyObjection } from "@/lib/voice/coaching-classifier";
import { getTenantPlaybook } from "@/lib/voice/tenant-playbook";
import { anthropic } from "@/lib/ai/ai-provider";
import { logger } from "@/lib/observability/logger";

type Chunk = { speaker: "agent" | "prospect" | "unknown"; text: string; tsMs: number };
type Card = { ts: number; objectionClass: string; label: string; prospectQuote: string; suggestedResponses: string[] };

const COACH_DEBOUNCE_MS = 5_000;
const SAME_CLASS_SUPPRESS_MS = 60_000;
const AGENT_CONTEXT_CHUNKS = 4;

export async function POST(req: Request) {
  const url = new URL(req.url);
  const callId = url.searchParams.get("callId");
  if (!callId) return new Response("Missing callId", { status: 400 });

  const formText = await req.text();
  const params = Object.fromEntries(new URLSearchParams(formText));

  // Signature — Twilio signs the exact URL it called (incl. query) + params.
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const publicBase =
    process.env.VOICE_PUBLIC_BASE_URL ??
    process.env.AUTH_URL ??
    `${url.protocol}//${url.host}`;
  const fullUrl = `${publicBase}${url.pathname}${url.search}`;
  const valid = validateTwilioSignature({
    authToken,
    url: fullUrl,
    params,
    signature: req.headers.get("x-twilio-signature"),
  });
  if (!valid) {
    logger.warn?.("calls/transcription: invalid signature", { callId });
    return new Response("Invalid signature", { status: 403 });
  }

  const event = params.TranscriptionEvent;
  // We only persist final content frames. started/stopped/error are no-ops
  // (200 so Twilio doesn't retry); partials are dropped (partialResults=false
  // in the TwiML anyway).
  if (event !== "transcription-content" || params.Final !== "true") {
    return new Response(null, { status: 200 });
  }

  // TranscriptionData is a JSON string: { transcript, confidence }.
  let text = "";
  try {
    text = String(JSON.parse(params.TranscriptionData ?? "{}").transcript ?? "").trim();
  } catch {
    /* malformed — ignore */
  }
  if (!text) return new Response(null, { status: 200 });

  // Outbound call: inbound_track = the called party (prospect), outbound_track
  // = our caller-id leg (agent). Labels are also set in the TwiML for clarity.
  const speaker: Chunk["speaker"] =
    params.Track === "inbound_track" ? "prospect" : params.Track === "outbound_track" ? "agent" : "unknown";

  // One read: call-start (for relative tsMs) + recent context + coaching state.
  const [row] = await db
    .select({
      tenantId: calls.tenantId,
      createdAt: calls.createdAt,
      connectedAt: calls.connectedAt,
      transcript: calls.transcript,
      coachingCards: calls.coachingCards,
    })
    .from(calls)
    .where(eq(calls.id, callId))
    .limit(1);
  if (!row) return new Response("Call not found", { status: 404 });

  const startMs = (row.connectedAt ?? row.createdAt ?? new Date()).getTime();
  const tsMs = Math.max(0, Date.now() - startMs);
  const chunk: Chunk = { speaker, text, tsMs };

  await db
    .update(calls)
    .set({
      transcript: sql`COALESCE(${calls.transcript}, '[]'::jsonb) || ${JSON.stringify([chunk])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(calls.id, callId));

  // Coaching — only prospect utterances, keyword-prefiltered, with DB-backed
  // debounce (stateless webhook can't hold the in-memory tap state).
  if (speaker === "prospect" && looksLikeObjection(text) && process.env.ANTHROPIC_API_KEY && process.env.VOICE_COACHING_LIVE !== "off") {
    try {
      const cards: Card[] = Array.isArray(row.coachingCards) ? (row.coachingCards as Card[]) : [];
      const now = Date.now();
      const lastTs = cards.length ? cards[cards.length - 1].ts : Number.NEGATIVE_INFINITY;
      if (now - lastTs >= COACH_DEBOUNCE_MS) {
        const priorChunks: Chunk[] = Array.isArray(row.transcript) ? (row.transcript as Chunk[]) : [];
        const recentAgentText = priorChunks
          .filter((c) => c.speaker === "agent")
          .slice(-AGENT_CONTEXT_CHUNKS)
          .map((c) => c.text)
          .join(" ");
        // Per-tenant objection bank (cached 5 min) — the rep hears responses
        // about THEIR product, or the neutral methodology fallback. Never
        // another vendor's pitch.
        const playbook = await getTenantPlaybook(row.tenantId);
        const card = await classifyObjection(
          { prospectWindow: text, agentContext: recentAgentText },
          { model: anthropic("claude-haiku-4-5-20251001"), playbook },
        );
        if (card) {
          const sameClassRecent = cards.some(
            (c) => c.objectionClass === card.objectionClass && now - c.ts < SAME_CLASS_SUPPRESS_MS,
          );
          if (!sameClassRecent) {
            const persisted: Card = {
              ts: now,
              objectionClass: card.objectionClass,
              label: card.label,
              prospectQuote: card.prospectQuote,
              suggestedResponses: card.suggestedResponses,
            };
            await db
              .update(calls)
              .set({
                coachingCards: sql`COALESCE(${calls.coachingCards}, '[]'::jsonb) || ${JSON.stringify([persisted])}::jsonb`,
                updatedAt: new Date(),
              })
              .where(eq(calls.id, callId));
          }
        }
      }
    } catch (err) {
      logger.warn?.("calls/transcription: coaching failed", { callId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return new Response(null, { status: 200 });
}
