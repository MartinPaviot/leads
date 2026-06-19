# Tasks — Sovereign meeting recording

Ordered. App-code tasks (T1–T8) are a boilable lake and ship behind
`SOVEREIGN_RECORDING_ENABLED=false`. Infra tasks (I1–I3) are ops (the ocean) and
are Martin's call; the app is inert until they exist.

## App code

- [ ] **T1 — Persist roomName on booking.**
  `calendar-write.ts`: add `roomName` to `BookResult`. `book/route.ts` + chat `bookMeeting`: write `roomName` into the `meeting_scheduled` activity metadata.
  *Verify:* book a visio in dev; assert `metadata.roomName` present.
  *Test:* unit on the metadata assembly (roomName threaded from `createSovereignMeeting`).

- [ ] **T2 — STT seam.**
  `lib/integrations/transcribe.ts`: `transcribeAudio(file|url)` via OpenAI SDK with `baseURL = WHISPER_BASE_URL ?? default`. Refactor `upload-transcript` to use it.
  *Verify:* `upload-transcript` still works with unset env (OpenAI default).
  *Test:* unit — baseURL resolution (set vs unset); upload-transcript regression green.

- [ ] **T3 — Jibri webhook (signature + resolve + idempotency).**
  `app/api/webhooks/jibri/route.ts`: verify `JIBRI_WEBHOOK_SECRET` (fail-closed 503), resolve activity by `metadata->>'roomName'`, idempotency guard.
  *Verify:* signed POST resolves; unsigned → 401; no-secret → 503.
  *Test:* unit on signature verify + resolution + idempotent re-fire (mirror recall webhook tests).

- [ ] **T4 — Finalize → transcript → process-transcript.**
  In the webhook: VTT path (reuse `parseVTTorSRT`) or `audioUrl` → `transcribeAudio` → call `process-transcript` internally; set `transcriptSource: "jibri"`, `recordingStatus`, `recordingUrl`. Run async + `.catch` (don't block the 200), mirroring `processTranscriptFromBot`.
  *Verify:* sample VTT POST → activity gets `structuredNotes` + deal `extractedIntel`.
  *Test:* integration with a fixture transcript; assert parity with recall path output shape.

- [ ] **T5 — Consent gate.**
  Apply `meetingOptOuts` check + pre-record consent notification + `getCaptureApprovalMode` before processing.
  *Verify:* opted-out attendee → skipped, asserted in metadata.
  *Test:* unit — opt-out short-circuits; review-mode parks CRM write but still indexes.

- [ ] **T6 — Suppress Recall for Jitsi.**
  `createBotForActivity`: skip with `reason: "sovereign_path"` when `SOVEREIGN_RECORDING_ENABLED` and the activity is Jitsi-hosted.
  *Verify:* Jitsi activity → no Recall call; non-Jitsi → unchanged.
  *Test:* unit on the branch.

- [ ] **T7 — Feature flag + graceful degradation.**
  `SOVEREIGN_RECORDING_ENABLED` gate; booking never fails if recording infra is down; errors recorded on the activity, not thrown.
  *Verify:* flag off → zero side effects; Whisper down → audio retained, error status, call/calendar intact.
  *Test:* unit — degradation paths.

- [ ] **T8 — Meeting UI source label.**
  Meeting detail (`call-intel.tsx` / meetings page): show "Visio souveraine — enregistrée sur votre infrastructure" for `transcriptSource: "jibri"`. No emoji; lucide icon.
  *Verify:* recorded Jitsi meeting renders the sovereign label + transcript + intel.
  *Test:* render assertion.

## Infra (ops — flagged ocean, not app code)

- [ ] **I1 — Jibri.** Stand up Jibri on CH/EU infra next to Jitsi; recordings to tenant-isolated storage; `finalize.sh` → `POST /api/webhooks/jibri` with `roomName` + signed secret.
- [ ] **I2 — Whisper endpoint.** Self-hosted faster-whisper/whisper.cpp/Speaches (OpenAI-compatible `/audio/transcriptions`); set `WHISPER_BASE_URL`. GPU optional but speeds long calls.
- [ ] **I3 — (Full level only) EU LLM.** Point `lib/ai/ai-provider` at Mistral/EU for the intel extraction.

## Acceptance gate
All of requirements.md R1–R7 pass + the 7 hostile-QA eval steps + `regression.sh` green. Merge to main behind the flag (off in prod until I1–I2 exist).
