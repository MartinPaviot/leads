/**
 * Bridges a Twilio Media Stream WebSocket for a single call to a
 * Deepgram Nova-3 live transcription connection.
 *
 * Twilio sends μ-law 8 kHz mono frames as base64-encoded payloads on
 * `media` events. Deepgram accepts that codec natively (`encoding=mulaw`,
 * `sample_rate=8000`), so no resampling is needed. Final transcript
 * chunks are appended to `calls.transcript` jsonb — the SSE on
 * /api/calls/[id]/events polls that and surfaces chunks to the UI.
 *
 * The bridge is intentionally not Twilio-WS-aware: the caller owns the
 * Twilio socket and feeds parsed events into `onTwilioEvent`. That keeps
 * this module pure and unit-testable (see voice-deepgram-bridge.test.ts).
 */

import { db } from "@/db";
import { calls } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export interface BridgeDeps {
  /** Open a fresh Deepgram live connection (one per call). */
  openDeepgram: (opts: DeepgramOpenOpts) => Promise<ListenLiveLike>;
  /** Persist a final chunk. Override for tests. */
  appendChunk?: (callId: string, chunk: TranscriptChunk) => Promise<void>;
  /** Optional clock injection for deterministic timestamps in tests. */
  now?: () => Date;
  /** Phase 3 — invoked on each FINAL prospect chunk. The tap owns its
   *  own debounce + prefilter and may return a coaching card to
   *  persist + surface to the UI. Returning null is the common path. */
  coachingTap?: (input: {
    callId: string;
    chunk: TranscriptChunk;
    recentAgentText: string;
  }) => Promise<CoachingCardPersisted | null>;
  /** Persist a coaching card. Override for tests. */
  appendCoachingCard?: (
    callId: string,
    card: CoachingCardPersisted,
  ) => Promise<void>;
}

export interface CoachingCardPersisted {
  ts: number;
  objectionClass: string;
  label: string;
  prospectQuote: string;
  suggestedResponses: string[];
}

export interface DeepgramOpenOpts {
  language?: string;
  diarize?: boolean;
  punctuate?: boolean;
  interimResults?: boolean;
}

export type TranscriptChunk = {
  speaker: "agent" | "prospect" | "unknown";
  text: string;
  tsMs: number;
};

// Minimal Deepgram surface this module relies on. Mirrors the v5 SDK
// shape but keeps the dependency loose so a future provider swap (e.g.
// AssemblyAI) is one adapter file.
export interface ListenLiveLike {
  send: (audio: Buffer | ArrayBufferLike | Uint8Array) => void;
  finish: () => void;
  on: (event: string, handler: (data: unknown) => void) => void;
  removeAllListeners: () => void;
}

// Shape of Deepgram v5 streaming transcript payloads.
interface DeepgramTranscriptPayload {
  is_final?: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript: string;
      words?: Array<{ word: string; speaker?: number; start?: number }>;
    }>;
  };
  start?: number;
}

export interface TwilioMediaStreamEvent {
  event: "connected" | "start" | "media" | "stop" | "mark" | string;
  sequenceNumber?: string;
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    mediaFormat: { encoding: string; sampleRate: number; channels: number };
    customParameters?: Record<string, string>;
  };
  media?: {
    track: "inbound" | "outbound" | string;
    chunk: string;
    timestamp: string;
    payload: string; // base64 μ-law
  };
  stop?: { accountSid: string; callSid: string };
}

export interface BridgeHandle {
  /** Push a parsed Twilio Media Stream JSON message through the bridge. */
  onTwilioEvent: (evt: TwilioMediaStreamEvent) => Promise<void>;
  /** Tear down the Deepgram connection cleanly. */
  close: () => Promise<void>;
}

/**
 * Open the bridge. `callId` is the Elevay `calls.id` (carried over by
 * Twilio's `customParameters.callId` in the start event — we also accept
 * it via the WS URL query string for redundancy).
 */
export async function openBridge(
  callId: string,
  deps: BridgeDeps,
  options: DeepgramOpenOpts = {},
): Promise<BridgeHandle> {
  const startedAt = (deps.now ?? (() => new Date()))().getTime();
  const dg = await deps.openDeepgram({
    language: options.language ?? "fr",
    diarize: options.diarize ?? true,
    punctuate: options.punctuate ?? true,
    interimResults: options.interimResults ?? false,
  });

  let closed = false;
  let buffered = 0;

  const appendChunk =
    deps.appendChunk ??
    (async (id: string, chunk: TranscriptChunk) => {
      // jsonb_build_array + array concat keeps the append atomic. Using
      // the raw SQL escape hatch because Drizzle's array helpers don't
      // cover jsonb mutation yet.
      await db
        .update(calls)
        .set({
          transcript: sql`COALESCE(${calls.transcript}, '[]'::jsonb) || ${JSON.stringify([chunk])}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(calls.id, id));
    });

  const appendCoachingCard =
    deps.appendCoachingCard ??
    (async (id: string, card: CoachingCardPersisted) => {
      await db
        .update(calls)
        .set({
          coachingCards: sql`COALESCE(${calls.coachingCards}, '[]'::jsonb) || ${JSON.stringify([card])}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(calls.id, id));
    });

  // Rolling buffer of the agent's last few utterances so the classifier
  // has conversational context. Capped — we don't need full history.
  const agentBuffer: string[] = [];
  const AGENT_BUFFER_MAX = 4;

  dg.on("Results", async (raw: unknown) => {
    if (closed) return;
    const payload = raw as DeepgramTranscriptPayload;
    // We only persist final chunks (is_final or speech_final). Interim
    // results would flood the DB; live UI polling sees the finals.
    if (!(payload.is_final || payload.speech_final)) return;
    const alt = payload.channel?.alternatives?.[0];
    const text = alt?.transcript?.trim();
    if (!text) return;
    const speaker = pickSpeaker(alt?.words);
    const tsMs = payload.start
      ? Math.round(payload.start * 1000)
      : Date.now() - startedAt;
    const chunk: TranscriptChunk = { speaker, text, tsMs };
    try {
      await appendChunk(callId, chunk);
    } catch (err) {
      // Swallow — Deepgram should never crash the bridge over a DB hiccup.
      // The next chunk will retry on the same row.
      console.warn("[voice-bridge] appendChunk failed", err);
    }
    // Maintain the rolling agent context for the coaching tap.
    if (speaker === "agent") {
      agentBuffer.push(text);
      if (agentBuffer.length > AGENT_BUFFER_MAX) agentBuffer.shift();
    }
    // Phase 3 — only prospect chunks feed the classifier. The tap owns
    // its own debounce + keyword prefilter so we don't gate that here.
    if (speaker === "prospect" && deps.coachingTap) {
      try {
        const card = await deps.coachingTap({
          callId,
          chunk,
          recentAgentText: agentBuffer.join(" "),
        });
        if (card) await appendCoachingCard(callId, card);
      } catch (err) {
        console.warn("[voice-bridge] coachingTap failed", err);
      }
    }
  });

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    try {
      dg.finish();
    } catch {
      /* ignore */
    }
    try {
      dg.removeAllListeners();
    } catch {
      /* ignore */
    }
    // Diagnostic: log total μ-law bytes piped — useful in dev.
    if (process.env.VOICE_STREAM_DEBUG === "1") {
      console.log(`[voice-bridge] closed call=${callId} bytes=${buffered}`);
    }
  };

  return {
    async onTwilioEvent(evt: TwilioMediaStreamEvent) {
      if (closed) return;
      if (evt.event === "media" && evt.media?.payload) {
        const buf = Buffer.from(evt.media.payload, "base64");
        dg.send(buf);
        buffered += buf.length;
      } else if (evt.event === "stop") {
        await close();
      }
    },
    close,
  };
}

/**
 * Map Deepgram's speaker indices (0,1,...) to our two-role labels.
 * Twilio Media Streams gives `inbound` (the prospect) and `outbound`
 * (us) on separate tracks when `dual_channel=true` is configured —
 * but our TwiML uses single-channel for cost; we lean on Deepgram's
 * diarisation. Speaker 0 in Nova-3 is whoever spoke first, which for
 * outbound calls is reliably the agent ("Bonjour, Martin de Elevay...").
 */
function pickSpeaker(
  words?: Array<{ word: string; speaker?: number }>,
): "agent" | "prospect" | "unknown" {
  if (!words || words.length === 0) return "unknown";
  // Pick the modal speaker over the chunk's words — robust against the
  // very-first-word being a backchannel ("yeah, mhm") from the wrong
  // party.
  const counts = new Map<number, number>();
  for (const w of words) {
    if (typeof w.speaker !== "number") continue;
    counts.set(w.speaker, (counts.get(w.speaker) ?? 0) + 1);
  }
  if (counts.size === 0) return "unknown";
  let max = -1;
  let bestSpeaker = -1;
  for (const [s, c] of counts) {
    if (c > max) {
      max = c;
      bestSpeaker = s;
    }
  }
  return bestSpeaker === 0 ? "agent" : "prospect";
}
