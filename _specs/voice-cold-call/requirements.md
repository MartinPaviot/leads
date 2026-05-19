# Requirements — voice-cold-call

## User story

As an Elevay founder doing cold call from my laptop, I want every task except the actual conversation to be automated, so that I spend my time on the voice and the relationship — and so that no insight from any call is ever lost.

## Acceptance criteria (GIVEN / WHEN / THEN)

### Phase 1 — vertical slice (this spec)

#### R1.1 — Call from the browser
- GIVEN a contact with a phone number and a provisioned Twilio number for the tenant,
- WHEN I click `Appeler` on the contact card in `/call-mode`,
- THEN a WebRTC call connects within 3 seconds via Twilio Voice SDK,
- AND the outbound `from` number matches the contact's country (and area code when possible).

#### R1.2 — Live transcription
- GIVEN a connected call,
- WHEN either party speaks,
- THEN the transcript appears in the UI within 600ms,
- AND speakers are diarised (`agent` vs `prospect`),
- AND the transcript persists to `calls.transcript` jsonb.

#### R1.3 — Post-call structured notes
- GIVEN a call has ended (Twilio `recording-status` webhook fired),
- WHEN the post-call worker runs,
- THEN `calls.summary`, `calls.buyingSignals`, `calls.actionItems`, `calls.sentiment` are populated using the schema from `api/meetings/process-transcript`,
- AND an `activities` row of type `call_completed` is created with the right channel/direction/sentiment,
- AND the transcript is indexed in `transcript_chunks` for coaching RAG.

#### R1.4 — Recording disclosure
- GIVEN a tenant in a two-party consent region (France + US states CA, IL, FL, PA, MA, MD, NV, NH, WA),
- WHEN the call connects,
- THEN a pre-recorded disclosure plays first ("Cet appel est susceptible d'être enregistré pour amélioration produit"),
- AND `calls.recordingConsent` is set to `given` after disclosure.

#### R1.5 — Call activity in contact timeline
- GIVEN a completed call,
- WHEN I open the contact detail page,
- THEN the call appears in the activity timeline with duration, outcome, sentiment, and a link to the recording player.

#### R1.6 — DNC respect
- GIVEN a phone number on the tenant's `do_not_call_list`,
- WHEN it would be enqueued in the call queue,
- THEN it is filtered out,
- AND if a transcript contains "remove me from your list" / "ne me rappelez plus", the worker adds the number to the DNC list automatically.

#### R1.7 — Queue priority
- GIVEN a set of contacts eligible to call,
- WHEN `/api/calls/queue` is requested,
- THEN contacts are returned sorted by composite score = `intent × accessibility × deal_value`,
- AND filtered by quiet hours (8h-19h locale weekdays in the contact's timezone),
- AND filtered by DNC.

### Phase 2 — voicemail + local presence + power dial (next PR)

#### R2.1 — Voicemail drop
#### R2.2 — Local presence number matching
#### R2.3 — AMD (Answering Machine Detection)
#### R2.4 — Power dial 3-line parallel

### Phase 3 — live coaching (PR after that)

#### R3.1 — Objection classifier real-time
#### R3.2 — Coaching cards non-intrusive
#### R3.3 — Playbook learns from accepted responses
#### R3.4 — Sentiment overlay live

### Phase 4 — compliance + dashboard

#### R4.1 — Recording disclosure auto-play per region (Phase 1 has skeleton, Phase 4 hardens)
#### R4.2 — Audit log per call (who called whom, when, consent, retention)
#### R4.3 — Connect rate / talk ratio / conversion dashboard
#### R4.4 — Per-tenant minute cap with overage tracking

## Edge cases (Phase 1)

| Case | Behaviour |
|---|---|
| Contact has no phone number | Hide `Appeler` button, show `Trouver le numéro` (triggers enrichment waterfall) |
| Twilio not configured for tenant | `/call-mode` shows empty state with link to Settings |
| Twilio call fails (network, busy, invalid number) | Show inline error, log to `calls` with `outcome = failed`, no retry burst |
| Browser denies microphone | Show explainer, link to browser docs (no fallback — WebRTC is required) |
| Recording webhook arrives but no matching call row | Log warning, drop silently (idempotency) |
| Same call SID arrives twice on `recording-status` | Idempotent: upsert by `twilioCallSid` |
| Call ended before disclosure finished | `recordingConsent = declined`, do not store recording |
| Transcript empty (< 30 chars) | Skip post-call LLM, mark `outcome = no_answer` |
| User on call when next contact loaded in queue | Disable `Appeler` on others until current call hangs up |
| Two tenants share a phone number (should never happen) | Hard error at provisioning time, unique constraint on `phone_number_pool.e164` global |

## Evaluation steps (Phase 6)

1. With Twilio test credentials + a real test phone, dial the test phone from `/call-mode`. Verify connect <3s.
2. Speak 30s on each side. Verify transcript appears with diarisation. Sentiment > 0.
3. Hang up. Verify post-call worker populates summary + signals + actions within 30s.
4. Verify `activities` row created with channel `call`, direction `outbound`, type `call_completed`.
5. Open the contact timeline, click the call, verify recording plays from `/calls/[id]`.
6. Add the dialed number to the DNC list. Try to call again. Verify it's not in the queue and `Appeler` is blocked.
7. Disable Twilio creds. Verify `/call-mode` empty state appears with link to Settings.

## Non-goals (Phase 1)

- Mobile native app
- SMS (separate spec)
- Call coaching live (Phase 3)
- Voicemail drop (Phase 2)
- Power dial (Phase 2)
- Multilingual transcription beyond FR/EN
- Spam-likely number rotation (Phase 4)
- WhatsApp/voice apps (out of scope, separate channel)
