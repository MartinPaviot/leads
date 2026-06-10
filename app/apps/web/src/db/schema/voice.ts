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

    // What the script panel showed at dial time, so outcomes can be segmented
    // by script variant. Shape (lib/voice/script-context.ts ScriptContext):
    //   { reasonSource: "signal"|"hiring"|"funding"|null,
    //     matchedEnjeu: boolean, viaTool: boolean, tool: string|null }
    scriptContext: jsonb("script_context"),

    // Deterministic post-call lever execution scores (lever-scoring.ts
    // LeverScores): talkRatioPct, opener/reason/de-risk/slot booleans, drill.
    leverScores: jsonb("lever_scores"),

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

// === GOAL-DRIVEN CALL CAMPAIGNS ===
//
// "This week I want 1000 calls over 5 days" -> a campaign with a daily
// quota. Each morning a cron tops up `call_campaign_targets` to the quota
// from the tenant's enriched, callable contacts, and reschedules no-answers
// per the cadence (retry up to maxAttempts over windowDays). The morning
// call list = targets surfaced today; the call-mode cockpit dials them and
// the post-call worker feeds the outcome back into the cadence.

export const callCampaignStatusEnum = pgEnum("call_campaign_status", [
  "active",
  "paused",
  "completed",
  "archived",
]);

export const callCampaigns = pgTable(
  "call_campaigns",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    ownerId: text("owner_id").references(() => users.id),
    name: text("name").notNull(),
    status: callCampaignStatusEnum("status").notNull().default("active"),
    // Goal: weeklyTarget calls spread over daysPerWeek -> dailyQuota.
    weeklyTarget: integer("weekly_target").notNull().default(0),
    daysPerWeek: integer("days_per_week").notNull().default(5),
    dailyQuota: integer("daily_quota").notNull().default(0),
    // Cadence: retry a no-answer up to maxAttempts over windowDays.
    maxAttempts: integer("max_attempts").notNull().default(8),
    windowDays: integer("window_days").notNull().default(15),
    // Targeting snapshot used to top up targets; empty -> tenant ICP at run time.
    targetFilter: jsonb("target_filter").default({}),
    startDate: timestamp("start_date", { withTimezone: true }).defaultNow(),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("call_campaigns_tenant_idx").on(t.tenantId),
    index("call_campaigns_status_idx").on(t.tenantId, t.status),
  ],
);

export const callTargetStatusEnum = pgEnum("call_target_status", [
  "queued", // due / waiting to be called
  "in_progress", // dialed, awaiting disposition
  "connected", // reached the human (terminal)
  "converted", // meeting booked / positive (terminal)
  "exhausted", // hit maxAttempts or window without an answer (terminal)
  "dnc", // do-not-call / not interested (terminal)
]);

// One row per (campaign, contact): the cadence state machine. attemptCount
// + nextAttemptAt + status drive both the morning list (status 'queued' and
// nextAttemptAt <= today, capped at dailyQuota) and the retry logic fed by
// call outcomes.
export const callCampaignTargets = pgTable(
  "call_campaign_targets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    campaignId: text("campaign_id").references(() => callCampaigns.id, { onDelete: "cascade" }).notNull(),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    contactId: text("contact_id").references(() => contacts.id).notNull(),
    status: callTargetStatusEnum("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastOutcome: callOutcomeEnum("last_outcome"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow(),
    // yyyy-mm-dd this target was last surfaced on a morning list, so the
    // same prospect isn't listed twice in one day.
    listedOn: text("listed_on"),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("call_target_campaign_contact_idx").on(t.campaignId, t.contactId),
    index("call_target_due_idx").on(t.tenantId, t.status, t.nextAttemptAt),
    index("call_target_campaign_idx").on(t.campaignId, t.status),
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

// Editable, per-tenant call script (replaces the hardcoded SECTOR_SCRIPTS).
// One default row per tenant (sector = ''); optional per-sector variants keyed
// by a lowercased sector label. Generated by LLM from the tenant's product +
// ICP, then editable by the rep. The cockpit reads this; nothing is hardcoded.
export const callScripts = pgTable(
  "call_scripts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    // '' = the tenant default; otherwise a lowercased sector/segment label.
    sector: text("sector").notNull().default(""),
    // Opener template (may contain {name}, {sector}, {geo} placeholders).
    opener: text("opener").notNull(),
    problems: jsonb("problems").$type<string[]>().notNull().default([]),
    permissionCheck: text("permission_check").notNull(),
    bookingAsk: text("booking_ask").notNull(),
    guidance: jsonb("guidance").$type<string[]>().notNull().default([]),
    // Provenance: 'generated' | 'edited' | 'default'.
    origin: text("origin").notNull().default("edited"),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex("call_scripts_tenant_sector_idx").on(t.tenantId, t.sector)],
);
