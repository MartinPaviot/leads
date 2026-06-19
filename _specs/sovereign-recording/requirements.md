# Requirements — Sovereign meeting recording

## User story
As a Pilae rep running a sovereign Jitsi visio with a prospect, I want the call
recorded and transcribed on our own infrastructure and turned into the same
CRM intel as a recorded phone call (summary, buying signals, coaching, deal
update), so that I keep the full meeting-intelligence value without sending the
prospect's voice to a US processor.

## Acceptance criteria (EARS / GIVEN-WHEN-THEN)

### R1 — Sovereign capture, no US processor
- WHEN a visio booked via `bookSovereignMeeting` is recorded, THE SYSTEM SHALL capture audio via a self-hosted recorder (Jibri) and SHALL NOT deploy a Recall.ai bot for that meeting.
- GIVEN `SOVEREIGN_RECORDING_ENABLED` is on, WHEN `createBotForActivity` would run for a Jitsi-hosted activity, THEN it SHALL be skipped in favour of the Jibri path.

### R2 — Room ↔ activity correlation
- WHEN a meeting is booked, THE SYSTEM SHALL persist the Jitsi `roomName` on the `meeting_scheduled` activity metadata.
- WHEN the Jibri finalize webhook fires with a `roomName`, THE SYSTEM SHALL resolve the owning activity by `metadata->>'roomName'` (mirroring how the Recall webhook resolves by `recallBotId`).

### R3 — Transcript → existing intel pipeline
- WHEN a recording finalizes, THE SYSTEM SHALL obtain a transcript (self-hosted Whisper for audio, or a provided VTT/transcript) and feed it into the EXISTING `process-transcript` flow unchanged.
- THEN the activity SHALL carry `structuredNotes`, `transcriptSource: "jibri"`, `hasTranscript: true`, and the linked deal SHALL receive `extractedIntel` exactly as the Recall path produces today.

### R4 — Consent (CH/RGPD)
- BEFORE recording starts, THE SYSTEM SHALL apply the existing consent path: opt-out check (`meetingOptOuts`), pre-meeting consent notification to known contacts, and tenant capture-approval mode (`getCaptureApprovalMode`).
- IF any attendee has opted out, THE SYSTEM SHALL NOT record.

### R5 — Configurable sovereignty levels
- THE SYSTEM SHALL read the STT endpoint from `WHISPER_BASE_URL` (OpenAI-compatible); unset = the current OpenAI default.
- THE intel LLM SHALL remain swappable via `lib/ai/ai-provider` so the analysis model can move to an EU/self-hosted model without touching the pipeline.

### R6 — Graceful degradation
- IF `SOVEREIGN_RECORDING_ENABLED` is off OR the Jibri/Whisper endpoints are unreachable, THE booking flow SHALL still succeed (recording is additive); the failure SHALL be recorded on the activity (`recordingStatus: "error"`) and never break the call or the calendar event.

### R7 — Webhook security
- THE Jibri webhook SHALL verify a shared secret (HMAC or bearer) and fail-closed when unconfigured (mirroring the Recall webhook's 503-when-no-secret posture).

## Edge cases
- Recording finalizes but transcript < 50 chars → mark `hasTranscript: false`, no LLM call (parity with Recall path).
- Two finalize callbacks for one room (retry) → idempotent: guard on `metadata.postCallProcessedAt` / existing `structuredNotes`.
- Room booked but never recorded → no activity mutation; nothing to do.
- Whisper endpoint down → store audio reference + `recordingStatus: "transcription_failed"`, retriable; do not lose the file.
- Prospect joined from phone browser only (no rep tab) → Jibri (server-side) still captures the full room; unaffected.

## Evaluation steps (hostile QA)
1. Book a visio (Jitsi), confirm `roomName` is on the activity.
2. Simulate a Jibri finalize POST (signed) with a sample VTT → assert activity gets `structuredNotes`, `transcriptSource: "jibri"`, deal `extractedIntel` populated.
3. Unsigned/!secret POST → 401/503, no DB mutation.
4. Opt-out attendee → recording skipped, asserted in metadata.
5. Flag off → booking works, zero recording side effects.
6. Whisper unreachable → audio retained, `recordingStatus` error, no crash.
7. Duplicate finalize → single set of notes, no double tasks.
