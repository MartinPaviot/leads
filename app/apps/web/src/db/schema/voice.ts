import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  pgEnum,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import { tenants, users, contacts, deals } from "./core";
import { sequenceEnrollments } from "./outbound";
import { sentimentEnum } from "./enums";

// Outcome of a single outbound cold call. `connected` means we talked
// to the intended human; the other terminal states cover the long tail
// of what actually happens (machine, gatekeeper, opt-out, etc.) and
// drive both the activity timeline and the post-call routing rules.
export const callOutcomeEnum = pgEnum("call_outcome", [
  "connected",
  "voicemail_left",
  "no_answer",
  "busy",
  "gatekeeper",
  "wrong_number",
  "do_not_call",
  "meeting_booked",
  "callback_requested",
  "not_interested",
  "failed",
]);

// One row per outbound dial attempt — regardless of whether anything
// was said. The schema mirrors `meetings.process-transcript` for the
// content side (summary / buyingSignals / actionItems) so the same
// LLM extractor can be reused for both. See _specs/voice-cold-call.
export const calls = pgTable(
  "calls",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    contactId: text("contact_id").references(() => contacts.id).notNull(),
    userId: text("user_id").references(() => users.id).notNull(),
    dealId: text("deal_id").references(() => deals.id),
    enrollmentId: text("enrollment_id").references(() => sequenceEnrollments.id),

    // Twilio identifiers — set after `Voice.calls.create()` returns.
    // Nullable until the provider responds so we can persist the row
    // optimistically and survive a Twilio outage without losing the
    // intent to call.
    twilioCallSid: text("twilio_call_sid"),
    fromNumber: text("from_number").notNull(),
    toNumber: text("to_number").notNull(),

    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSec: integer("duration_sec"),
    // Computed at finalize() from the diarised transcript — total seconds
    // the prospect was speaking. Useful for talk-ratio benchmarks.
    talkTimeSec: integer("talk_time_sec"),

    outcome: callOutcomeEnum("outcome"),
    sentiment: sentimentEnum("sentiment"),

    recordingUrl: text("recording_url"),
    recordingDurationSec: integer("recording_duration_sec"),
    // Diarised transcript chunks. Shape:
    //   [{ speaker: "agent"|"prospect", text: string, tsMs: number, sentiment?: number }]
    transcript: jsonb("transcript").default([]),
    summary: text("summary"),
    buyingSignals: jsonb("buying_signals").default({}),
    actionItems: jsonb("action_items").default([]),

    voicemailDropped: boolean("voicemail_dropped").default(false),
    voicemailTemplateId: text("voicemail_template_id"),
    // "given" | "declined" | "n_a" — recorded only when the call was in
    // a two-party-consent region and the disclosure prompt was played.
    recordingConsent: text("recording_consent").default("n_a"),
    twoPartyConsentRegion: boolean("two_party_consent_region").default(false),
    // Mirrors Twilio's AnsweredBy field — "human" | "machine_start" |
    // "machine_end_beep" | "machine_end_silence" | "machine_end_other"
    // | "fax" | "unknown". Drives the auto-VM-drop and outcome
    // classification paths in Phase 2.
    answeredBy: text("answered_by"),

    // Live coaching cards appended by the Twilio↔Deepgram bridge as
    // objections are detected. Shape:
    //   [{ts, objectionClass, label, prospectQuote, suggestedResponses}]
    coachingCards: jsonb("coaching_cards").default([]),

    // Stamps the post-call worker writes; `null` until processed.
    processingState: text("processing_state").default("pending"),
    processingError: text("processing_error"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("calls_twilio_sid_idx").on(t.twilioCallSid),
    index("calls_tenant_idx").on(t.tenantId),
    index("calls_contact_idx").on(t.contactId),
    index("calls_started_idx").on(t.startedAt),
    index("calls_outcome_idx").on(t.tenantId, t.outcome),
  ],
);

// Per-tenant library of pre-recorded voicemail MP3s. The variables
// column lists Mustache tokens (`{{first_name}}`, `{{company}}`) that
// the worker substitutes at drop time. Phase 1 ships read-only; Phase 2
// adds in-browser MediaRecorder upload.
export const voicemailTemplates = pgTable(
  "voicemail_templates",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    name: text("name").notNull(),
    audioUrl: text("audio_url").notNull(),
    durationSec: integer("duration_sec"),
    language: text("language").default("fr"),
    variables: jsonb("variables").default([]),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("vm_templates_tenant_idx").on(t.tenantId)],
);

// DNC list: tenant-scoped + global. The composite unique key allows
// both layers without collisions (one global entry + one per tenant
// for the same number are both legitimate). `source` distinguishes a
// manual entry, an import, or an automatic extraction from a call
// transcript ("remove me from your list").
export const doNotCallList = pgTable(
  "do_not_call_list",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id),
    phoneNumber: text("phone_number").notNull(),
    reason: text("reason").notNull(),
    source: text("source").default("manual"),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("dnc_phone_tenant_idx").on(t.tenantId, t.phoneNumber),
    index("dnc_phone_idx").on(t.phoneNumber),
  ],
);

// Pool of Twilio numbers owned by a tenant, used by the local-presence
// selector. The e164 field is globally unique because two tenants
// cannot own the same Twilio SID — a hard guarantee from Twilio.
export const phoneNumberPool = pgTable(
  "phone_number_pool",
  {
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
  },
  (t) => [
    uniqueIndex("pool_e164_idx").on(t.e164),
    index("pool_tenant_idx").on(t.tenantId),
    index("pool_area_idx").on(t.countryCode, t.areaCode),
  ],
);

// Monthly usage counter per tenant — drives the 4000 min/seat cap.
// Stored as a separate table (rather than computed via SUM over calls)
// so the cap check at /api/calls/start is O(1).
export const voiceUsageMonthly = pgTable(
  "voice_usage_monthly",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    yearMonth: text("year_month").notNull(),
    minutesUsed: integer("minutes_used").default(0).notNull(),
    callsAttempted: integer("calls_attempted").default(0).notNull(),
    callsConnected: integer("calls_connected").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("voice_usage_tenant_month_idx").on(t.tenantId, t.yearMonth)],
);
