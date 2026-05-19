/**
 * Standalone Node WebSocket server for Twilio Media Streams.
 *
 * Twilio's `<Start><Stream url="wss://..." />` opens a WS to this
 * process; we open a Deepgram Nova-3 live connection per call, pipe
 * audio through, and persist final transcript chunks to
 * `calls.transcript`. The SSE in /api/calls/[id]/events polls the
 * jsonb column and surfaces chunks to the UI.
 *
 * Run locally:
 *   pnpm voice:stream
 *
 * In dev you also need to expose the port via ngrok (or another
 * tunnel) so Twilio can reach it from the public internet. See
 * docs/voice-bootstrap.md for the full setup.
 */

import { WebSocketServer, type WebSocket } from "ws";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

// Env: run with `node --env-file=.env.local --import tsx scripts/voice-stream-server.ts`
// (Node 22+). The `voice:stream` script in package.json wires this up.

import {
  openBridge,
  type BridgeHandle,
  type ListenLiveLike,
  type TwilioMediaStreamEvent,
} from "../src/lib/voice/deepgram-bridge";
import { createCoachingTap } from "../src/lib/voice/coaching-tap";
import { anthropic } from "../src/lib/ai/ai-provider";

const PORT = Number(process.env.VOICE_STREAM_PORT ?? 3001);
const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY;
if (!DEEPGRAM_KEY) {
  console.error(
    "[voice-stream] DEEPGRAM_API_KEY missing — set it in .env.local before starting.",
  );
  process.exit(1);
}

const deepgram = createClient(DEEPGRAM_KEY);

// Coaching tap — disabled when ANTHROPIC_API_KEY is missing so the
// bridge degrades to "transcript only" instead of crashing. Phase 3
// flag VOICE_COACHING_LIVE=off lets ops disable coaching in prod
// without removing the env entirely.
const coachingEnabled =
  process.env.VOICE_COACHING_LIVE !== "off" &&
  !!process.env.ANTHROPIC_API_KEY;
const coachingTap = coachingEnabled
  ? createCoachingTap({
      model: anthropic("claude-haiku-4-5-20251001"),
    })
  : undefined;
if (coachingEnabled) {
  console.log("[voice-stream] live coaching ON (Haiku 4.5)");
} else {
  console.log(
    "[voice-stream] live coaching OFF (set ANTHROPIC_API_KEY + VOICE_COACHING_LIVE!=off to enable)",
  );
}

const wss = new WebSocketServer({ port: PORT });

wss.on("listening", () => {
  console.log(
    `[voice-stream] WebSocket bridge listening on ws://0.0.0.0:${PORT}`,
  );
  console.log(
    "[voice-stream] Twilio <Stream url=\"wss://<your-tunnel>/?callId=<id>\" /> points here.",
  );
});

wss.on("connection", async (socket: WebSocket, req) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const callId =
    url.searchParams.get("callId") ?? url.pathname.split("/").pop() ?? null;
  if (!callId) {
    socket.close(1008, "Missing callId");
    return;
  }

  let bridge: BridgeHandle | null = null;
  try {
    bridge = await openBridge(callId, {
      coachingTap,
      openDeepgram: async (opts) => {
        const dg = deepgram.listen.live({
          model: "nova-3",
          encoding: "mulaw",
          sample_rate: 8000,
          channels: 1,
          language: opts.language ?? "fr",
          punctuate: opts.punctuate ?? true,
          diarize: opts.diarize ?? true,
          interim_results: opts.interimResults ?? false,
          smart_format: true,
        });
        return new Promise<ListenLiveLike>((resolve, reject) => {
          const adapter: ListenLiveLike = {
            send: (audio) => dg.send(audio as Buffer),
            finish: () => dg.requestClose?.(),
            on: (event, handler) => {
              // Map our generic event name to the SDK enum.
              if (event === "Results") {
                dg.on(LiveTranscriptionEvents.Transcript, handler);
              } else if (event === "Error") {
                dg.on(LiveTranscriptionEvents.Error, handler);
              } else if (event === "Close") {
                dg.on(LiveTranscriptionEvents.Close, handler);
              }
            },
            removeAllListeners: () => {
              dg.removeAllListeners();
            },
          };
          dg.on(LiveTranscriptionEvents.Open, () => resolve(adapter));
          dg.on(LiveTranscriptionEvents.Error, (err) => reject(err));
        });
      },
    });
  } catch (err) {
    console.error(
      `[voice-stream] bridge open failed for call=${callId}:`,
      err instanceof Error ? err.message : err,
    );
    socket.close(1011, "Bridge open failed");
    return;
  }

  socket.on("message", async (raw) => {
    if (!bridge) return;
    try {
      const text = raw.toString();
      const msg = JSON.parse(text) as TwilioMediaStreamEvent;
      await bridge.onTwilioEvent(msg);
    } catch (err) {
      console.warn(
        `[voice-stream] malformed Twilio frame for call=${callId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  });

  socket.on("close", async () => {
    await bridge?.close();
    bridge = null;
  });

  socket.on("error", (err) => {
    console.warn(
      `[voice-stream] socket error for call=${callId}:`,
      err.message,
    );
  });
});

process.on("SIGINT", () => {
  console.log("[voice-stream] shutting down");
  wss.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  console.log("[voice-stream] shutting down");
  wss.close(() => process.exit(0));
});
