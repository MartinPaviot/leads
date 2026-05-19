# Design — voice-cold-call

## System fit

```
[Browser]                        [Elevay Next.js]                 [Twilio Voice]            [Deepgram]
 │                                   │                                │                          │
 ├─ Voice SDK JS  ◄──── RTC token ───┤                                │                          │
 │   (capability token)              │                                │                          │
 │                                   │                                │                          │
 ├─ device.connect(to=+33...) ─────────────────────────────────────►  │                          │
 │                                   ◄── webhook /api/calls/twiml ────┤                          │
 │                                   ─── TwiML: <Dial>+<Start>      ► │                          │
 │                                       <Stream url="wss://elevay.../calls/stream">             │
 │                                                                    │  audio (μ-law 8k)        │
 │                                                                    ├──────────────────────────►│
 │                                                                    │                          │
 │  ◄── SSE /api/calls/[id]/events ── server pushes diarised chunks ──┤  transcript JSON         │
 │                                                                    │  ◄───────────────────────┤
 │                                                                    │                          │
 ├─ device.disconnect() ────────────────────────────────────────────► │                          │
 │                                   ◄── webhook /api/calls/recording-status ─┤                  │
 │                                       │
 │                                       └─► Inngest event calls.post-process
 │                                                  │
 │                                                  ├─ fetch recording
 │                                                  ├─ LLM extract (reuse meetings/process-transcript schema)
 │                                                  ├─ persist calls + activities + transcript_chunks
 │                                                  └─ trigger calls.follow-up-draft
```

## Data model

New file: `app/apps/web/src/db/schema/voice.ts`.

```ts
import {
  pgTable, text, timestamp, jsonb, integer, real, pgEnum,
  index, uniqueIndex, boolean,
} from "drizzle-orm/pg-core";
import { tenants, users, contacts, deals } from "./core";
import { sequenceEnrollments } from "./outbound";
import { sentimentEnum } from "./enums";

export const callOutcomeEnum = pgEnum("call_outcome", [
  "connected",          // talked to the intended human
  "voicemail_left",     // dropped a vm
  "no_answer",          // rang out
  "busy",
  "gatekeeper",         // talked to someone, not the target
  "wrong_number",
  "do_not_call",        // prospect asked to be removed
  "meeting_booked",     // outcome promotion
  "callback_requested",
  "not_interested",
  "failed",             // technical failure
]);

export const calls = pgTable("calls", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").references(() => tenants.id).notNull(),
  contactId: text("contact_id").references(() => contacts.id).notNull(),
  userId: text("user_id").references(() => users.id).notNull(),
  dealId: text("deal_id").references(() => deals.id),
  enrollmentId: text("enrollment_id").references(() => sequenceEnrollments.id),

  twilioCallSid: text("twilio_call_sid"),
  fromNumber: text("from_number").notNull(),
  toNumber: text("to_number").notNull(),

  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSec: integer("duration_sec"),
  talkTimeSec: integer("talk_time_sec"),

  outcome: callOutcomeEnum("outcome"),
  sentiment: sentimentEnum("sentiment"),

  recordingUrl: text("recording_url"),
  recordingDurationSec: integer("recording_duration_sec"),
  transcript: jsonb("transcript").default([]),   // [{speaker, text, tsMs, sentiment?}]
  summary: text("summary"),
  buyingSignals: jsonb("buying_signals").default({}),
  actionItems: jsonb("action_items").default([]),

  voicemailDropped: boolean("voicemail_dropped").default(false),
  voicemailTemplateId: text("voicemail_template_id"),
  recordingConsent: text("recording_consent").default("n_a"), // given/declined/n_a
  twoPartyConsentRegion: boolean("two_party_consent_region").default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, t => [
  uniqueIndex("calls_twilio_sid_idx").on(t.twilioCallSid),
  index("calls_tenant_idx").on(t.tenantId),
  index("calls_contact_idx").on(t.contactId),
  index("calls_started_idx").on(t.startedAt),
]);

export const voicemailTemplates = pgTable("voicemail_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull(),
  audioUrl: text("audio_url").notNull(),
  durationSec: integer("duration_sec"),
  language: text("language").default("fr"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, t => [index("vm_templates_tenant_idx").on(t.tenantId)]);

export const doNotCallList = pgTable("do_not_call_list", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").references(() => tenants.id),   // null = global
  phoneNumber: text("phone_number").notNull(),
  reason: text("reason").notNull(),
  source: text("source").default("manual"),   // manual / transcript_extract / import
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow(),
}, t => [
  uniqueIndex("dnc_phone_tenant_idx").on(t.tenantId, t.phoneNumber),
  index("dnc_phone_idx").on(t.phoneNumber),
]);

export const phoneNumberPool = pgTable("phone_number_pool", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").references(() => tenants.id).notNull(),
  e164: text("e164").notNull(),
  twilioSid: text("twilio_sid").notNull(),
  countryCode: text("country_code").notNull(),
  areaCode: text("area_code"),
  voiceCapability: boolean("voice").default(true),
  smsCapability: boolean("sms").default(false),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, t => [
  uniqueIndex("pool_e164_idx").on(t.e164),
  index("pool_tenant_idx").on(t.tenantId),
  index("pool_area_idx").on(t.countryCode, t.areaCode),
]);
```

Idempotent runtime ensure: `db/ensure-voice-tables.ts`, mirrors `ensure-coaching-tables.ts`.

## API contracts

### `POST /api/calls/start`
Reserves a call row, returns a Twilio capability token + the call id. Client uses the token with the Voice SDK to initiate the RTC connection.

Request:
```ts
{ contactId: string, dealId?: string, enrollmentId?: string }
```

Response:
```ts
{
  callId: string,
  capabilityToken: string,        // JWT for Twilio Voice SDK
  fromNumber: string,             // selected from pool
  toNumber: string,               // contact.phone E.164
  twoPartyConsentRegion: boolean, // controls UI banner
  recordingConsentRequired: boolean,
}
```

Errors: 401 unauthorized, 404 contact, 409 no phone, 409 on DNC, 409 outside quiet hours, 503 Twilio not configured.

### `POST /api/calls/twiml`
Webhook from Twilio when the call legs the carrier. Returns TwiML that:
1. Plays the recording disclosure (if required by region)
2. `<Dial>`s the prospect number
3. `<Start><Stream>` to the WS endpoint for Deepgram piping
4. `<Record>` for asynchronous backup

Signature validation: HMAC of the body with `TWILIO_AUTH_TOKEN`.

### `POST /api/calls/recording-status`
Webhook from Twilio when the recording finishes. Triggers Inngest `calls.post-process` with the call id and recording URL.

### `POST /api/calls/[id]/finalize`
Manual/internal trigger to re-run the LLM extraction on an existing call. Useful for backfills and the eval suite.

### `GET /api/calls/queue`
Returns the prioritised call queue for the current user.

Response:
```ts
{
  calls: Array<{
    contactId: string,
    contactName: string,
    title: string | null,
    companyName: string | null,
    score: number,                  // composite
    intentScore: number,
    accessibilityScore: number,
    localTime: string,              // "13:42"
    localTimezone: string,
    latestSignal: { type: string, label: string } | null,
    onDnc: boolean,
    inQuietHours: boolean,
  }>
}
```

### `GET /api/calls/[id]`
Returns full call detail including transcript and recording URL.

### Server-Sent Events `GET /api/calls/[id]/events`
Pushes transcript chunks and outcome updates to the open `/call-mode` page.

## Data flow — post-call

```
recording-status webhook
  └─► Inngest event "calls/post-process" (callId, recordingUrl)
        ├─ fetch transcript chunks already accumulated (from streaming)
        ├─ if streaming gave nothing (e.g. AMD detected machine), fetch recording → Deepgram batch
        ├─ assemble final transcript JSON
        ├─ LLM extract (meetings schema): summary, signals, actions, sentiment, outcome class
        ├─ infer outcome: connected | voicemail_left | no_answer | gatekeeper | ...
        ├─ update calls row
        ├─ insert activities row (channel call, direction outbound, type call_completed)
        ├─ index transcript chunks (reuse coaching/index-transcript)
        ├─ ingest context-graph episode
        ├─ if "remove me from list" detected → add toNumber to DNC
        ├─ if meeting requested → trigger calls.follow-up-draft with Calendly link
        └─ if positive sentiment + buying signal → propose sequence draft
```

## Failure handling

| Failure | Behaviour |
|---|---|
| Twilio API down | `/api/calls/start` returns 503, UI shows offline state, no retry |
| Deepgram WS drops | Twilio still records → post-call falls back to batch transcription |
| Recording URL expired (>30d Twilio retention) | Background job backs up to Supabase Storage at T+25d |
| LLM extract fails | Mark `processingState = failed`, surface in `/calls/[id]` with a retry button, do not block the activity row |
| User refreshes mid-call | RTC drops; reconnect via fresh capability token; transcript chunks already persisted survive |

## Security

- Twilio webhook signature validation on every webhook (HMAC of full URL + form body, with `TWILIO_AUTH_TOKEN`)
- Recording URLs are short-lived signed URLs (24h) — the player fetches via `/api/calls/[id]/recording` which proxies after auth
- Recording disclosure mandatory for two-party-consent regions, enforced server-side in TwiML
- `do_not_call_list` checked twice: at enqueue (`/api/calls/queue`) and at start (`/api/calls/start`)
- Tenant isolation: every read filters by `tenantId` via existing `getAuthContext` pattern (`lib/auth/auth-utils.ts`)
- Recording storage region: when `GDPR_REGION=eu`, Twilio media region is `ie1` (Dublin); recordings backed up to Supabase Storage `eu-central-1`

## Cost envelope (per call, 4-min connected)

| Item | Cost |
|---|---|
| Twilio FR mobile out | 4 × $0.025 = $0.10 |
| Twilio recording | 4 × $0.0025 = $0.01 |
| Deepgram streaming | 4 × $0.0043 = $0.017 |
| LLM extract (Sonnet 4.6, ~3k tokens) | $0.012 |
| Storage (negligible) | ~$0.001 |
| **Total per call** | **~$0.14** |

At 60 calls/day × 22 days = 1320 calls/mo/seat → **$185/mo/seat variable cost**. Inside the $999/mo bracket.

## Migration path to Telnyx (Phase 4 evaluation)

The `VoiceProvider` interface in `lib/voice/provider.ts` abstracts:
- `createCall(opts)` → returns `{ callId, capabilityToken }`
- `signWebRtcToken(userId)`
- `getRecordingUrl(callSid)`
- `dropVoicemail(callSid, templateUrl)`
- `buyNumber(countryCode, areaCode?)`
- `validateWebhookSignature(headers, body)`

Twilio impl: `lib/voice/twilio.ts`. Telnyx impl ships only when:
- Tenant minutes/mo > 50 000 (savings cover the migration sprint)
- Phase 1-3 stable for 4 weeks
