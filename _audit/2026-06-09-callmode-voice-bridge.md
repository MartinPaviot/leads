# Call Mode — live voice bridge rebuild (2026-06-09)

User ask: during a Call Mode call, (#2) connect the rep's mic to the prospect,
(#3) show the transcript in real time, (#4) access the transcript afterward.
(#1 "How did it go?" → modal is a separate UI ticket, deferred.)

## Root-cause diagnosis (verified against live Twilio + code)

Twilio TwiML App "Elevay Voice" `AP85cf3925a51104793c106c27107e8dbb`:
- voiceUrl = https://www.elevay.dev/api/calls/twiml (POST), fallback /api/calls/twiml-fallback

Current (broken) flow:
1. `POST /api/calls/start` → `provider.createCall({from:Lausanne, to:prospect, url:/api/calls/twiml?callId=X})`
   → Twilio rings the PROSPECT. On answer, `/api/calls/twiml` returns
   `<Start><Transcription/></Start><Dial callerId=from><Number>prospect</Number></Dial>`
   → **re-dials the prospect (self-dial)**. No agent audio path.
2. Browser `device.connect({params:{callId,toNumber}})` → agent leg hits the SAME
   `/api/calls/twiml` whose handler reads `callId` from the **query string**, but the
   App-connect sends params in the **POST body** → `Missing callId` → **400**. Agent
   leg dies. No mic bridge.
3. `VOICE_PUBLIC_BASE_URL` unset → webhook base falls back to `AUTH_URL`
   (=localhost in .env.local; prod uses its own AUTH_URL).

Net: prospect rings, answers, hears nothing; transcript empty. Matches observed
(answeredBy=human, 10s, empty transcript, "vérifiez que le bridge de streaming…").

Two transcription mechanisms exist: (a) `deepgram-bridge.ts` Media-Streams WS
(needs a hosted WS server, VOICE_STREAM_PUBLIC_URL — NOT deployed); (b) Twilio-native
`<Start><Transcription>` → POST /api/calls/transcription (serverless, current). We
standardise on (b).

## Target architecture — browser-agent-dials-prospect (standard Twilio softphone)

Single bridged call. The browser client IS the agent leg; its TwiML dials the prospect.

1. `POST /api/calls/start` — keep DNC + quiet-hours + usage + number resolution +
   insert the `calls` row, but **do NOT place the prospect call here**. Return
   `{callId, capabilityToken, fromNumber, toNumber}`.
2. Browser `device.connect({params:{callId, To:prospect, From:Lausanne}})`.
3. **New agent TwiML route** (point App voiceUrl here, or make /api/calls/twiml read
   body params when query is absent): read `callId/To/From` from the POST body,
   return:
   `<Start><Transcription statusCallbackUrl=…/api/calls/transcription?callId=X track=both_tracks engine=deepgram model=nova-3 lang=fr-FR/></Start>`
   `<Dial callerId=From record=…><Number statusCallback=…>prospect</Number></Dial>`
   → bridges agent(browser mic) ↔ prospect, with live transcription. Persist the
   provider call SID from the status callback.
4. `/api/calls/transcription` — on each final chunk: append to `calls.transcript`
   jsonb AND publish an SSE `transcript` event on /api/calls/[id]/events.
5. Status callbacks (initiated/ringing/answered/completed) → SSE ringing/connected/
   ended so the softphone UI transitions correctly (today it half-works off Voice SDK).
6. **Persistence + post-call access (#4)**: `calls.transcript` already exists. Add a
   transcript viewer on the call record / contact fiche (load persisted transcript on
   revisit, not just live SSE). The "transcription figée" panel already renders chunks;
   feed it the persisted transcript when reopening a past call.
7. Env: set `VOICE_PUBLIC_BASE_URL=https://www.elevay.dev` in prod (Vercel) so every
   webhook/transcription callback URL is correct and reachable.
8. Twilio App voiceUrl: update via REST if we add a dedicated agent route
   (`/api/calls/agent-twiml`); otherwise keep /api/calls/twiml and branch on body vs query.

## Files
- src/app/api/calls/start/route.ts (stop placing the call; issue token only)
- src/lib/voice/twilio.ts (signWebRtcToken ok; add buildAgentTwiml; createCall usage)
- src/app/api/calls/agent-twiml/route.ts (NEW — body-param TwiML, dial + transcription)
- src/app/api/calls/transcription/route.ts (persist + SSE publish)
- src/app/api/calls/[id]/events/route.ts (SSE: transcript + status)
- src/app/(dashboard)/call-mode/page.tsx (device.connect params To/From; lifecycle off
  Voice SDK connect/disconnect events; load persisted transcript for past calls)
- src/app/(dashboard)/call-mode/_panels.tsx (LiveTranscript: persisted + live)
- Vercel env VOICE_PUBLIC_BASE_URL; Twilio App voiceUrl via REST.

## Constraints / testing
- Mic↔prospect two-way can only be FINAL-validated from Martin's real browser
  (Playwright headless has no microphone). Server side (TwiML, call status,
  transcription rows, SSE) is verifiable headless + via Twilio API.
- Production telephony + money: build on a branch, verify server-side, then a single
  guided live test from Martin's browser.
- Two-party consent (CH/FR): recording stays opt-in; transcription is allowed but the
  disclosure rules already in code must be honoured.
