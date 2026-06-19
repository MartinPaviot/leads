# Design — Sovereign meeting recording

## System fit
The intel core is untouched. We add a **second capture path** that converges on
the same `process-transcript` pipeline the Recall webhook already feeds:

```
Booking (calendar-write.ts) ──stores roomName──▶ activity(meeting_scheduled)
        │
        ▼
Jitsi room (visio.pilae.ch/rdv-…)  ──rep starts recording──▶ Jibri (self-host)
        │ finalize.sh (post-recording)
        ▼
POST /api/webhooks/jibri  { roomName, audioUrl|transcriptVtt, signature }
        │  resolve activity by metadata->>'roomName'  (mirror recall webhook)
        │  consent gate (meetingOptOuts + capture-approval)   [R4]
        ▼
transcript  ──(audio? → Whisper @ WHISPER_BASE_URL)──▶  text
        │
        ▼
POST /api/meetings/process-transcript   (EXISTING — unchanged)
        ▼
structuredNotes + buyingSignals + coaching + deal extractedIntel + post-call
```

This mirrors `app/api/webhooks/recall/route.ts::processTranscriptFromBot` step
for step, swapping the Recall fetch for a sovereign source. The LLM extraction,
contact matching, embeddings, context-graph ingest and `processPostCall` are
the same shared code.

## Data model (no migration)
Reuse `activities.metadata` (jsonb), as the Recall path does:
- Booking writes: `roomName` (NEW), alongside existing `joinUrl`, `eventId`, `calendarProvider`.
- Webhook writes: `recordingStatus` ("recording"|"done"|"error"|"transcription_failed"), `transcriptSource: "jibri"`, `hasTranscript`, `structuredNotes`, `recordingUrl` (the file on our infra), `processedAt`.
- Correlation index: query `metadata->>'roomName'` (same shape as the existing `metadata->>'recallBotId'` lookup — already a supported access pattern).

## API contracts

### NEW: `POST /api/webhooks/jibri`
- Auth: shared secret. `JIBRI_WEBHOOK_SECRET` → HMAC-SHA256 over the raw body (or bearer header). Fail-closed 503 when unset (parity with `RECALL_WEBHOOK_SECRET`). [R7]
- Body: `{ roomName: string, status: "started"|"finalized"|"failed", transcriptVtt?: string, audioUrl?: string, durationSec?: number }`.
- `finalized` →
  1. resolve activity by `roomName`; 404-safe (ack, no-op) if none.
  2. consent gate; if opted out → mark skipped, return.
  3. transcript = `transcriptVtt` (parse via the existing VTT cleaner) OR fetch `audioUrl` → Whisper.
  4. call `process-transcript` (internal) with `{ transcript, activityId, dealId, meetingTitle, meetingDate }`.
  5. set `transcriptSource: "jibri"`, `recordingStatus: "done"`, `recordingUrl`.
- Idempotent: if activity already has `structuredNotes`/`postCallProcessedAt`, ack and return.

### STT lever (sovereign transcription)
- `lib/integrations/transcribe.ts` (NEW thin wrapper): `transcribeAudio(fileOrUrl): Promise<string>` using the OpenAI SDK with `baseURL = process.env.WHISPER_BASE_URL ?? default`. Self-hosted faster-whisper / whisper.cpp / Speaches expose an OpenAI-compatible `/audio/transcriptions`, so this is a config swap, not a rewrite. `upload-transcript` is refactored to call this wrapper so both paths share one STT seam.

### Intel LLM lever
- No code change required: `lib/ai/ai-provider.ts` already abstracts the model. Moving the analysis to Mistral/EU is a provider swap there. Documented, not built in this spec.

### Booking change (tiny)
- `app/api/meetings/book/route.ts` + chat `bookMeeting`: persist `roomName` (from `createSovereignMeeting().roomName`, already returned) into the `meeting_scheduled` activity metadata so the webhook can correlate. `calendar-write.bookSovereignMeeting` already surfaces `roomName` internally — thread it out in the `BookResult`.

### Recall suppression
- `createBotForActivity`: when `SOVEREIGN_RECORDING_ENABLED` and the activity is Jitsi-hosted (`metadata.calendarProvider`/`joinUrl` host = our `VIDEO_MEET_BASE_URL`), return `{ status: "skipped", reason: "sovereign_path" }` instead of deploying Recall. [R1]

## Data flow — failure handling
- Whisper down → keep `recordingUrl`, `recordingStatus: "transcription_failed"`; an Inngest retry (`coaching/...` style) can re-attempt. Never throw out of the webhook (ack 200 so Jibri doesn't hammer retries; do the work async like the Recall path's `processTranscriptFromBot(...).catch`).
- process-transcript 5xx → `recordingStatus: "error"`, surfaced on the meeting page.
- Missing room↔activity link → ack with warning (parity with "no matching activity").

## Security / consent
- Webhook signature fail-closed [R7].
- Consent reuses `meetingOptOuts`, `notifyAttendeesBeforeBotJoins`-equivalent, and `getCaptureApprovalMode` review-mode parking (the transcript still indexes for coaching; CRM write waits on approval) — identical to today.
- The recording file lives on our infra (CH/EU); `recordingUrl` is an internal reference, access-controlled by tenant — never a third-party signed URL.

## Sovereignty levels (impl = config, per office-hours matrix)
- **Middle (recommended)**: `WHISPER_BASE_URL` → self-hosted Whisper; intel LLM stays Anthropic. Raw voice never leaves; only text transcript hits a US LLM.
- **Full**: also point `ai-provider` at Mistral/EU.
- **Pragmatic**: leave `WHISPER_BASE_URL` unset (OpenAI Whisper). Same code.

## What is explicitly out of scope (ops / ocean)
Provisioning + operating **Jibri** (own VM, headless Chrome, ALSA loopback, recordings storage) and a **Whisper** endpoint. The app ships behind `SOVEREIGN_RECORDING_ENABLED=false` and is inert until those endpoints exist. This is the heavy cost and is Martin's infra call.
