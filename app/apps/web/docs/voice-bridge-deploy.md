# Voice transcription bridge — deploy

`scripts/voice-stream-server.ts` is the Twilio Media Streams <-> Deepgram
Nova-3 bridge: a long-running WebSocket server. It **cannot run on Vercel**
(serverless kills long-lived WS). Deploy it on **Fly.io** (recommended) or
Railway. It reads `DEEPGRAM_API_KEY` + `DATABASE_URL` (writes `calls.transcript`)
and optionally `ANTHROPIC_API_KEY` (live coaching).

## Fly.io (~5 EUR/mo, shared-cpu-1x 256MB)
From `app/apps/web`:

```bash
fly apps create elevay-voice-bridge          # once (or edit `app` in fly.voice-bridge.toml)
fly secrets set -a elevay-voice-bridge \
  DEEPGRAM_API_KEY=...    \
  DATABASE_URL=...        \
  ANTHROPIC_API_KEY=...                       # optional — enables live coaching
fly deploy -c fly.voice-bridge.toml --dockerfile Dockerfile.voice-bridge
```

Then wire it to the web app — in Vercel (project `web`, Production env):

```
VOICE_STREAM_PUBLIC_URL = wss://elevay-voice-bridge.fly.dev
```

and **redeploy the web app** (the `/api/calls/twiml` route reads
`VOICE_STREAM_PUBLIC_URL` at runtime to build the `<Stream>` URL).

## Railway (alternative)
New service from this repo → Root Directory `app/apps/web`, Dockerfile
`Dockerfile.voice-bridge`. Set the same env vars. Use the service's public
`wss://` URL for `VOICE_STREAM_PUBLIC_URL`.

## Verify
- Place a test call from `/call-mode`. The bridge logs the `callId` on
  connect; transcript chunks should appear within ~600ms of speech.
- Set `VOICE_STREAM_DEBUG=1` in the host env to log byte counts + Deepgram events.

## Notes
- Internal port **8080** (`VOICE_STREAM_PORT`); Fly/Railway terminate TLS and
  proxy external `wss://` to it. Twilio connects to `wss://<host>/?callId=<id>`.
- Keep one machine **warm** (`auto_stop_machines = false`) — cold starts break
  the WS handshake mid-call.
- `DATABASE_URL` must point at the **same** database as the web app.
- The bridge is built standalone from `app/apps/web` (npm), so any package it
  imports must be in `app/apps/web/package.json` — same rule as the Vercel build.
