# Office hours — Sovereign meeting recording (Jibri → Whisper → process-transcript)

## Problem statement
A visio booked from Call Mode runs on a sovereign, open-source room (Jitsi, see
`feat/sovereign-visio`), but recording + transcript + intel (MEDDPICC/BANT/coaching)
still flows through US services — so the moment we record the prospect, the
sovereignty promise breaks.

## Premise challenge
"Just point the existing recorder at the Jitsi call." — Doesn't hold:
- The current bot is **Recall.ai** (`lib/integrations/recall.ts`, host `us-east-1.recall.ai`). It (a) is a US processor that ingests the prospect's voice, and (b) targets Zoom/Meet/Teams — it does **not** join a self-hosted Jitsi room. So it fails on both sovereignty and capability.
- The existing **in-browser recorder** (`_meeting-recorder.tsx`) captures the rep's **microphone only** (`getUserMedia({audio})`) — built for in-person. On a remote visio it would record only the rep, not the prospect. Unusable as-is for a remote call.

So this is not "swap a URL"; it is a new sovereign capture path. The good news: the **intel half already exists and is source-agnostic** — `POST /api/meetings/process-transcript` takes a transcript string from anywhere and produces summary + buyingSignals (budget/teamSize/stack/competitors/timeline/painPoints) + coaching + deal auto-update. We only need to feed it a transcript captured sovereignly.

## Alternatives explored
1. **Jibri (chosen for capture)** — Jitsi's own recorder (open source, Apache-2.0). Joins the room server-side, records to a file on our infra. Its `finalize.sh` hook fires post-recording → we POST to a new webhook that mirrors the Recall one. Sovereign, official, but real infra (its own VM, headless Chrome, ALSA loopback).
2. **Jigasi + Vosk/Whisper (live transcription)** — Jitsi's SIP/transcription gateway can emit a live transcript with an open-source STT backend. Lighter on storage (no video file) but more moving parts to run; defer.
3. **In-browser tab capture (`getDisplayMedia` w/ tab audio)** — rep shares the Jitsi tab with audio → MediaRecorder → existing `upload-transcript`. Lightest infra (no Jibri), reuses code, but rep-driven, single-tab, and clunky UX. Keep as a fallback, not the primary.
4. **Recall.ai** — rejected: US processor + no Jitsi support.

## Layer check
- Jibri, Whisper, Vosk, Mistral are all Layer-1/2 (established/popular OSS). No first-principles invention needed. The novel part is purely the wiring (a webhook + a room↔activity link) + the infra to host them.

## Completeness target
- App code: **9/10** — full webhook parity with the Recall path (status, transcript fetch, consent, error states, idempotency), behind a feature flag, with tests.
- Infra: explicitly **out of app scope** — provisioning Jibri + a Whisper endpoint is ops (flagged as an ocean below). The app must work the moment those endpoints exist, and degrade cleanly when they don't.

## Sovereignty matrix (the arbitrage for Martin)
Three honest levels — the voice path has three US-leaning stages today (capture, STT, intel LLM):

| Level | Room | Capture | Transcription (STT) | Intel LLM | Ops cost | Sovereignty |
|---|---|---|---|---|---|---|
| **1 — Full** | Jitsi self-host | Jibri self-host | Whisper self-host | Mistral (EU/self-host) | Highest (3 services + GPU helps) | Voice never touches a US cloud |
| **Middle (recommended)** | Jitsi self-host | Jibri self-host | Whisper self-host | Anthropic/OpenAI (existing) | Medium (Jitsi+Jibri+Whisper) | The **raw voice** never leaves; only the **text** transcript goes to a US LLM for analysis |
| **2 — Pragmatic** | Jitsi self-host | Jibri (or tab capture) | OpenAI Whisper (existing) | Anthropic/OpenAI (existing) | Lowest (Jitsi+Jibri only) | Room sovereign; voice file + transcript still transit US |

Recommendation: **Middle** — it's the honest sweet spot for the pitch ("the prospect's voice never leaves EU/CH infrastructure") without standing up an EU LLM on day one. The `WHISPER_BASE_URL` and `lib/ai/ai-provider` levers make moving between levels a config change, not a rewrite.
