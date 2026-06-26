import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
  boolean,
  varchar,
} from "drizzle-orm/pg-core";

// Enums
export const activityTypeEnum = pgEnum("activity_type", [
  "email_sent",
  "email_received",
  "email_opened",
  "email_replied",
  "email_bounced",
  "meeting_scheduled",
  "meeting_completed",
  "meeting_cancelled",
  "call_completed",
  "note_created",
  "note_updated",
  "task_created",
  "task_completed",
  "deal_created",
  "deal_stage_changed",
  "deal_won",
  "deal_lost",
  "contact_created",
  "company_created",
  "sequence_enrolled",
  "sequence_step_sent",
  "sequence_completed",
  "sequence_replied",
  "linkedin_message_received",
  "website_visited",
  "form_submitted",
  "enrichment_updated",
  "score_changed",
  "system_event",
]);

export const channelEnum = pgEnum("channel", [
  "email",
  "linkedin",
  "meeting",
  "call",
  "web",
  "system",
  "manual",
]);

export const directionEnum = pgEnum("direction", [
  "inbound",
  "outbound",
  "internal",
]);

export const sentimentEnum = pgEnum("sentiment", [
  "positive",
  "neutral",
  "negative",
]);

export const dealStageEnum = pgEnum("deal_stage", [
  "lead",
  "qualification",
  "demo",
  "trial",
  "proposal",
  "negotiation",
  "won",
  "lost",
]);

// Spec 35 — reversible targeting state for an account (companies row). Distinct
// from suppression (irreversible consent). `unreviewed` is the default-deny
// state under SAFE_MODE; only `targeted` accounts are eligible for autonomous
// outbound. `archived` is a reversible "not now" — it can be re-targeted later.
export const targetingStatusEnum = pgEnum("targeting_status", [
  "unreviewed",
  "targeted",
  "archived",
]);
