# Tasks — voice-cold-call Phase 1

Each task: code → write test → verify → commit → mark done. Branch `feat/voice-cold-call`. Merge to main on full PASS only.

## P1.0 — Spec + memory + branch (done)
- [x] Project memory `project_voice-cold-call.md`
- [x] Spec files (office-hours, requirements, design, tasks)
- [x] Branch `feat/voice-cold-call`

## P1.1 — Schema
- [ ] Create `db/schema/voice.ts` with: `callOutcomeEnum`, `calls`, `voicemailTemplates`, `doNotCallList`, `phoneNumberPool`
- [ ] Export from `db/schema.ts` barrel
- [ ] Create `db/ensure-voice-tables.ts` (idempotent runtime ensure, mirrors `ensure-coaching-tables.ts`)
- [ ] Wire into the startup ensure chain (find where `ensureCoachingTables` is called)
- [ ] Unit test: `__tests__/voice-schema.test.ts` — insert + query + DNC unique constraint
- **Verify**: `npm run db:push` (or equivalent) creates the tables; vitest green.

## P1.2 — Provider abstraction
- [ ] `lib/voice/provider.ts` — `VoiceProvider` interface
- [ ] `lib/voice/twilio.ts` — Twilio impl using `twilio` npm package
  - `createCall({ tenantId, fromNumber, toNumber, callId })`
  - `signWebRtcToken({ userId, tenantId })` — JWT capability token
  - `validateWebhookSignature({ url, params, signature })`
  - `getRecordingUrl(callSid)`
  - `buyNumber({ countryCode, areaCode? })`
- [ ] `lib/voice/number-selector.ts` — pick best `from` number from pool given prospect country/area
- [ ] `lib/voice/usage-cap.ts` — read/write tenant monthly minute usage; enforce cap before `createCall`
- [ ] Unit test: `__tests__/voice-twilio.test.ts` — mock the twilio sdk, validate signature logic, token shape
- **Verify**: vitest green.

## P1.3 — DNC + quiet hours + queue
- [ ] `lib/voice/dnc.ts` — check single + batch
- [ ] `lib/voice/quiet-hours.ts` — given contact's timezone, return `inQuietHours` + next window opens
- [ ] `lib/voice/queue.ts` — composite score (`intent × accessibility × deal_value`), with filters DNC + quiet
- [ ] Route `GET /api/calls/queue` — uses queue.ts
- [ ] Unit test: queue ordering + DNC filter + quiet hours filter
- **Verify**: hit `/api/calls/queue` from curl returns sorted list.

## P1.4 — API routes — start + twiml + recording-status
- [ ] `POST /api/calls/start` — auth → contact lookup → DNC check → number selector → cap check → insert `calls` row → return `{ callId, capabilityToken, fromNumber, toNumber, twoPartyConsentRegion }`
- [ ] `POST /api/calls/twiml` — Twilio webhook → validate signature → return TwiML with `<Play>` disclosure (if needed) + `<Dial>` + `<Start><Stream>` + `<Record>`
- [ ] `POST /api/calls/recording-status` — validate signature → trigger Inngest `calls/post-process` → 200 OK
- [ ] Unit test: each route — auth, signature validation, idempotency on duplicate webhook
- **Verify**: ngrok local + Twilio test creds → can initiate a real test call to a verified number.

## P1.5 — Finalize worker (Inngest)
- [ ] `inngest/calls-post-process.ts` — handler for `calls/post-process` event:
  1. Fetch call row + recording URL
  2. If transcript empty in DB, batch Deepgram from recording
  3. LLM extract reusing meetings/process-transcript schema (export the Zod schema from there for reuse)
  4. Update `calls` row with summary/signals/actions/outcome/sentiment
  5. Insert `activities` row
  6. Index transcript chunks via `coaching/index-transcript`
  7. Ingest context-graph episode
  8. Detect DNC keywords ("remove me", "ne me rappelez plus") → add to `do_not_call_list`
- [ ] Wire event in `inngest/client.ts` or wherever events are registered
- [ ] Unit test: golden transcript → expected summary/signals shape; DNC keyword detection
- **Verify**: simulate webhook → activity appears in contact timeline.

## P1.6 — Streaming transcription (Twilio Media Streams → Deepgram)
- [ ] WebSocket route `app/api/calls/stream/route.ts` (Next.js 15 native WS handler or fallback to a Node http upgrade)
- [ ] Pipe Twilio μ-law 8k frames to Deepgram WS, parse JSON responses, push to SSE
- [ ] `app/api/calls/[id]/events/route.ts` — SSE stream that pushes transcript chunks to the open `/call-mode` page
- [ ] Persist chunks to `calls.transcript` as they arrive (batched every 2s)
- [ ] Unit test: mock Deepgram WS, verify chunks flow end-to-end
- **Verify**: live test call → transcript appears within 600ms in browser.

## P1.7 — Page `/call-mode`
- [ ] `app/(dashboard)/call-mode/page.tsx` — three-column layout
  - Left (320px): queue list, filters chips, hoverable cards, click `Appeler`
  - Center (700px): brief preview / softphone states (idle, dialing, ringing, connected, voicemail_drop, hangup)
  - Right (380px): account brain live
- [ ] `components/call-mode/queue-list.tsx`
- [ ] `components/call-mode/softphone.tsx` — wraps Twilio Voice SDK Device
- [ ] `components/call-mode/brief-preview.tsx`
- [ ] `components/call-mode/transcription-live.tsx` — consumes SSE
- [ ] `components/call-mode/account-brain-panel.tsx`
- [ ] Lucide `Phone` icon. No emoji. Test asserts `icon === ""` absent.
- [ ] e2e: Playwright stub — load page, see queue, click Appeler, expect dialing state (Twilio mocked)
- **Verify**: visual screenshot before/after, both states clean.

## P1.8 — Settings → Voice
- [ ] Extend `/settings/sending-infrastructure` with a "Voice" tab section
  - Twilio credentials input (Account SID, Auth Token, API Key SID, API Key Secret) — encrypted at rest reuse existing key vault pattern
  - Pool table with `Buy more` button
  - Voicemail templates listing (Phase 2 will add record UI; Phase 1 only lists existing rows)
  - Compliance toggle: "Auto-play recording disclosure in two-party consent regions" (default ON)
  - Quiet hours config
- [ ] API: `GET/PUT /api/settings/voice` to persist tenant config
- **Verify**: configure Twilio → /call-mode no longer shows empty state.

## P1.9 — Sidebar
- [ ] Add `Call Mode` entry above `Inbox` (or in the Outbound section), Lucide `Phone` icon
- [ ] Disabled state with tooltip "Configurez Twilio dans Settings → Voice" when no credentials
- **Verify**: visual check.

## P1.10 — .env.example + bootstrap doc
- [ ] Append to `.env.example`:
  ```
  # Voice (Twilio) — required for /call-mode
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_API_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_REGION=ie1   # eu media region; us1 / au1 / br1 available

  # Voice — Deepgram streaming transcription
  DEEPGRAM_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

  # Voice — phone number enrichment waterfall (Apollo already configured)
  KASPR_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  LUSHA_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

  # Voice — public base URL used for Twilio webhooks (ngrok in dev)
  VOICE_PUBLIC_BASE_URL=https://your-tenant.elevay.ai
  ```
- [ ] `docs/voice-bootstrap.md` — instructions to create Twilio + Deepgram accounts, buy first numbers, configure webhooks
- **Verify**: a fresh dev can follow the doc and reach a successful test call.

## P1.11 — Commit + PR
- [ ] Commit in logical chunks with the `Co-Authored-By: Rippletide <admin@rippletide.com>` trailer
- [ ] Push branch
- [ ] Open PR titled `feat(voice): cold call Phase 1 — softphone + transcription pipeline`
- [ ] PR body links the spec, lists what's covered + what's deliberately deferred to P2/P3/P4

## Acceptance gate (Phase 6 eval input)

All R1.* requirements pass. Regression suite green. Doc updated.

Phase 2/3/4 specs and tasks live in `_specs/voice-cold-call/phase-2/`, `phase-3/`, `phase-4/` — created when Phase 1 PR merges.
