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
import { tenants, users, contacts } from "./core";

// === SEQUENCE TABLES ===

export const sequenceStatusEnum = pgEnum("sequence_status", [
  "draft",
  "active",
  "paused",
  "archived",
]);

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "active",
  "paused",
  "completed",
  "replied",
  "bounced",
  "unsubscribed",
]);

export const sequences = pgTable(
  "sequences",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: sequenceStatusEnum("status").default("draft"),
    // Owner (B): a sequence is personal — its outbound sends go from the
    // creator's connected mailbox. Auth-user id (= connected_mailboxes.user_id
    // / authCtx.userId). Nullable: legacy + agent-created fall back to the pool.
    createdBy: text("created_by"),
    campaignConfig: jsonb("campaign_config"),
    // Multi-ICP binding (Phase 3, _specs/multi-icp R9). Nullable: a
    // sequence may target a specific ICP (its message/cadence tuned to
    // that segment) or stay tenant-wide (null). FK is ON DELETE SET
    // NULL — deleting an ICP unbinds its sequences rather than
    // cascading them away.
    icpId: text("icp_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("sequences_tenant_id_idx").on(table.tenantId),
    index("sequences_created_by_idx").on(table.createdBy),
    index("sequences_status_idx").on(table.status),
    index("sequences_icp_idx").on(table.icpId),
  ]
);

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sequenceId: text("sequence_id").references(() => sequences.id, { onDelete: "cascade" }).notNull(),
    stepNumber: integer("step_number").notNull(),
    // Channel discriminator. Existing rows default to "email" via the SQL
    // default so back-compat holds; new channels (linkedin_message, sms,
    // gift, phone_task) dispatch through their own adapter. See
    // lib/sequence-dispatch/registry.ts for the per-channel contract.
    stepType: text("step_type").notNull().default("email"),
    subjectTemplate: text("subject_template").notNull(),
    bodyTemplate: text("body_template").notNull(),
    delayDays: integer("delay_days").default(2),
    // Channel-specific config — e.g. LinkedIn needs a connection note
    // template, physical gifts need a Sendoso product SKU. Keep the column
    // schemaless so adding a channel never blocks on a migration.
    channelConfig: jsonb("channel_config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("sequence_steps_sequence_id_idx").on(table.sequenceId),
    index("sequence_steps_step_type_idx").on(table.sequenceId, table.stepType),
  ]
);

export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sequenceId: text("sequence_id").references(() => sequences.id, { onDelete: "cascade" }).notNull(),
    contactId: text("contact_id").references(() => contacts.id).notNull(),
    status: enrollmentStatusEnum("status").default("active"),
    currentStep: integer("current_step").default(1),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).defaultNow(),
    lastStepAt: timestamp("last_step_at", { withTimezone: true }),
    nextStepAt: timestamp("next_step_at", { withTimezone: true }),
  },
  (table) => [
    index("enrollments_sequence_id_idx").on(table.sequenceId),
    index("enrollments_contact_id_idx").on(table.contactId),
    index("enrollments_next_step_idx").on(table.nextStepAt),
  ]
);

// === SEQUENCE DRAFTS QUEUE (P0-1) ===
//
// Per-email approval queue. The autopilot generates one row per
// scheduled step ; the founder reviews via /sequences/review and
// transitions to approved / rejected / edited. The expiry cron
// reaps stale pendings past 24h. State machine enforced at the
// API layer (`/api/sequences/drafts/:id/approve|reject|edit`)
// with optimistic-locking via the `version` column to prevent
// double-approve races.

export const sequenceDraftStatusEnum = pgEnum("sequence_draft_status", [
  "pending_approval",
  "approved",
  "rejected",
  "expired",
  "sent",
]);

export const sequenceDrafts = pgTable(
  "sequence_drafts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull(),
    sequenceId: text("sequence_id").notNull(),
    stepId: text("step_id").notNull(),
    enrollmentId: text("enrollment_id").notNull(),
    contactId: text("contact_id").notNull(),
    /** Snapshot at generation time — the founder approves what they
     *  see, not whatever the step template happens to say later. */
    subject: text("subject").notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text").notNull(),
    /** Why the autopilot generated this draft now — surfaced in the
     *  "Why this draft?" panel of the approval UI. e.g.
     *  `"scheduled_step_2"`, `"post_funding_signal"`. */
    triggerReason: text("trigger_reason").notNull(),
    /** Citations the personalisation step used. Each entry is an
     *  object `{ kind, label, href, quote? }` matching the
     *  AI-UI primitive shape so the panel renders consistently. */
    personalizationSources: jsonb("personalization_sources")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    status: sequenceDraftStatusEnum("status")
      .notNull()
      .default("pending_approval"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** userId of the founder who approved/rejected. Null on auto-mode
     *  approves and on expiry. */
    reviewedBy: text("reviewed_by"),
    /** User-provided rejection reason. 3-200 chars enforced at the
     *  API layer. Feeds the evaluator-optimizer learner that builds
     *  preventive rules for the next-draft prompt. */
    reviewReason: text("review_reason"),
    /** When the email should fly. Set on approve ; null while pending
     *  / rejected / expired. */
    scheduledSendAt: timestamp("scheduled_send_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Optimistic-lock counter — increment on every state change.
     *  API layer rejects updates whose version stamp doesn't match
     *  the row's current version, preventing two parallel approves
     *  from both queueing the email. */
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sequence_drafts_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.generatedAt,
    ),
    index("sequence_drafts_enrollment_idx").on(table.enrollmentId),
    index("sequence_drafts_sequence_idx").on(
      table.sequenceId,
      table.generatedAt,
    ),
  ],
);

// === OUTBOUND EMAIL TABLES ===

export const mailboxStatusEnum = pgEnum("mailbox_status", [
  "warming_up",
  "active",
  "paused",
  "disabled",
  "error",
]);

export const outboundStatusEnum = pgEnum("outbound_status", [
  "draft",
  "queued",
  "sending",
  "sent",
  "delivered",
  "bounced",
  "failed",
  "skipped",
]);

export const connectedMailboxes = pgTable(
  "connected_mailboxes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    // Per-user owner (B): a connected mailbox is PERSONAL — only its owner
    // sees, manages and holds the credentials for it. Stores the auth-user id
    // (same space as auth_account.userId / authCtx.userId). Nullable so legacy
    // rows survive the migration; backfilled by matching email_address.
    userId: text("user_id"),
    emailAddress: text("email_address").notNull(),
    displayName: text("display_name"),
    provider: text("provider").notNull(), // gmail, outlook, smtp_custom
    eeAccountId: text("ee_account_id").notNull().unique(),
    // Direct IMAP/SMTP (provider "smtp_custom", no EmailEngine): connection
    // details + the AES-256-GCM-encrypted password (via lib/crypto/
    // settings-encryption), plus the last IMAP UID captured so the poll cron
    // only fetches new mail.
    imapHost: text("imap_host"),
    imapPort: integer("imap_port"),
    smtpHost: text("smtp_host"),
    smtpPort: integer("smtp_port"),
    secretEncrypted: text("secret_encrypted"),
    imapLastUid: integer("imap_last_uid"),
    // CalDAV calendar for "smtp_custom" mailboxes (the IMAP/SMTP path has no
    // OAuth calendar). The collection URL is discovered on connect (or supplied
    // by the user); the same encrypted password (secret_encrypted) authenticates
    // it. caldav_last_sync_at lets the cron page incrementally like imap_last_uid.
    caldavUrl: text("caldav_url"),
    caldavLastSyncAt: timestamp("caldav_last_sync_at", { withTimezone: true }),
    domain: text("domain").notNull(),
    status: mailboxStatusEnum("status").default("warming_up"),
    dailyLimit: integer("daily_limit").notNull().default(50),
    sentToday: integer("sent_today").notNull().default(0),
    sentTotal: integer("sent_total").notNull().default(0),
    bounceCount7d: integer("bounce_count_7d").notNull().default(0),
    replyCount7d: integer("reply_count_7d").notNull().default(0),
    healthScore: integer("health_score").notNull().default(100),
    warmupStartedAt: timestamp("warmup_started_at", { withTimezone: true }),
    warmupDailyTarget: integer("warmup_daily_target").default(5),
    warmupCompletedAt: timestamp("warmup_completed_at", { withTimezone: true }),
    sendWindowStart: text("send_window_start").default("08:00"),
    sendWindowEnd: text("send_window_end").default("18:00"),
    sendDays: jsonb("send_days").default(["mon", "tue", "wed", "thu", "fri"]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("mailbox_tenant_idx").on(table.tenantId),
    index("mailbox_user_idx").on(table.userId),
    index("mailbox_status_idx").on(table.status),
    index("mailbox_domain_idx").on(table.domain),
    uniqueIndex("mailbox_tenant_email_idx").on(table.tenantId, table.emailAddress),
  ]
);

export const outboundEmails = pgTable(
  "outbound_emails",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    campaignId: text("campaign_id"),
    enrollmentId: text("enrollment_id").references(() => sequenceEnrollments.id),
    contactId: text("contact_id").references(() => contacts.id),
    mailboxId: text("mailbox_id").references(() => connectedMailboxes.id),
    stepNumber: integer("step_number"),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text"),
    messageId: text("message_id"),
    eeMessageId: text("ee_message_id"),
    threadId: text("thread_id"),
    inReplyTo: text("in_reply_to"),
    status: outboundStatusEnum("status").default("draft"),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    replyClassification: text("reply_classification"),
    replySnippet: text("reply_snippet"),
    errorMessage: text("error_message"),
    bounceType: text("bounce_type"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("outbound_tenant_idx").on(table.tenantId),
    index("outbound_status_idx").on(table.status),
    index("outbound_mailbox_idx").on(table.mailboxId),
    index("outbound_contact_idx").on(table.contactId),
    index("outbound_thread_idx").on(table.threadId),
    index("outbound_enrollment_idx").on(table.enrollmentId),
    index("outbound_sent_idx").on(table.sentAt),
  ]
);

export const warmupEmails = pgTable(
  "warmup_emails",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    mailboxId: text("mailbox_id").references(() => connectedMailboxes.id).notNull(),
    targetMailboxId: text("target_mailbox_id").references(() => connectedMailboxes.id).notNull(),
    direction: text("direction").notNull(), // sent, received
    messageId: text("message_id"),
    status: text("status").notNull().default("pending"), // pending, sent, opened, replied
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  }
);

export const emailOptouts = pgTable(
  "email_optouts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    emailAddress: text("email_address").notNull(),
    reason: text("reason"), // unsubscribe, bounce_hard, manual
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("optout_tenant_email_idx").on(table.tenantId, table.emailAddress),
  ]
);

export const meetingOptOuts = pgTable(
  "meeting_opt_outs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    activityId: text("activity_id").notNull(),
    attendeeEmail: text("attendee_email").notNull(),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("meeting_optout_activity_email_idx").on(table.activityId, table.attendeeEmail),
    index("meeting_optout_tenant_idx").on(table.tenantId),
    index("meeting_optout_email_idx").on(table.attendeeEmail),
  ]
);

// === NOTIFICATION TABLES ===

export const notificationTypeEnum = pgEnum("notification_type", [
  "deal_risk",
  "deal_won",
  "deal_lost",
  "enrichment_done",
  "sequence_reply",
  "task_due",
  "task_assigned",
  "meeting_upcoming",
  "new_contact",
  "system",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    userId: text("user_id").references(() => users.id).notNull(),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    entityType: text("entity_type"), // contact, company, deal, task
    entityId: text("entity_id"),
    read: boolean("read").notNull().default(false),
    emailSent: boolean("email_sent").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("notifications_user_idx").on(table.userId),
    index("notifications_tenant_idx").on(table.tenantId),
    index("notifications_read_idx").on(table.read),
    index("notifications_created_at_idx").on(table.createdAt),
  ]
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id).notNull().unique(),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    // Per-type preferences stored as JSONB
    // e.g. { deal_risk: { email: true, inApp: true }, task_due: { email: false, inApp: true } }
    preferences: jsonb("preferences").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  }
);
