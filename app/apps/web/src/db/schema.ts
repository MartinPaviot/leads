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
import type { AdapterAccountType } from "next-auth/adapters";

// ============================================================
// AUTH.JS REQUIRED TABLES (for DrizzleAdapter)
// ============================================================

export const authUsers = pgTable("auth_user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // H12 — dedicated bcrypt hash storage. Historically the credentials
  // provider re-used `authAccounts.access_token`, which mixed OAuth
  // tokens and password hashes in a single column. Any future code
  // that read `access_token` for an OAuth flow could have grabbed a
  // bcrypt hash by accident; keeping them apart removes the footgun.
  // Read/write sites use the helpers in `src/lib/password-hash.ts`.
  // Old rows are migrated opportunistically on successful sign-in.
  passwordHash: text("password_hash"),
});

export const authAccounts = pgTable(
  "auth_account",
  {
    userId: text("userId")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const authSessions = pgTable("auth_session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const authVerificationTokens = pgTable(
  "auth_verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
);

// Saved filter / sort / column views per user per resource (T1-F4).
// Each row is a named view like "My high-intent SaaS" that combines a
// filter tree + sort + columns. The `is_default` flag picks which view
// auto-loads for the user on navigation.
export const savedViews = pgTable(
  "saved_views",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    name: text("name").notNull(),
    filters: jsonb("filters").notNull(),
    sort: jsonb("sort"),
    columns: jsonb("columns"),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("saved_views_user_resource_idx").on(table.userId, table.resource),
  ]
);

// Per-user, per-resource preferences (T1-F5). Keyed by userId + resource
// (e.g. "accounts" | "contacts" | "opportunities") + key name. Stores
// JSONB so callers own their schema. Used by the DisplayPanel to
// remember column visibility / order / density between sessions.
export const userPreferences = pgTable(
  "user_preferences",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_preferences_user_resource_key_idx").on(
      table.userId,
      table.resource,
      table.key
    ),
  ]
);

// Password reset tokens for the Credentials provider (T0.8). The raw token
// is never stored — only a SHA-256 hex digest — so a DB leak can't be used
// to hijack pending resets.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    requestedIp: text("requested_ip"),
    requestedUserAgent: text("requested_user_agent"),
  },
  (table) => [
    index("password_reset_tokens_token_hash_idx").on(table.tokenHash),
    index("password_reset_tokens_user_id_idx").on(table.userId),
    index("password_reset_tokens_expires_at_idx").on(table.expiresAt),
  ]
);

// Email-verification tokens for the Credentials sign-up flow (S2). Same
// security model as `passwordResetTokens`: the raw token is emailed to
// the user and only its SHA-256 digest is stored, so a DB leak can't be
// replayed to verify someone else's email. 24-hour TTL, one outstanding
// token per user (older ones get marked used at issue time).
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    requestedIp: text("requested_ip"),
    requestedUserAgent: text("requested_user_agent"),
  },
  (table) => [
    index("email_verification_tokens_token_hash_idx").on(table.tokenHash),
    index("email_verification_tokens_user_id_idx").on(table.userId),
    index("email_verification_tokens_expires_at_idx").on(table.expiresAt),
  ]
);

// Sign-in failure log for I6 brute-force protection. We never store the
// raw email — only `sha256(normalized_email)` — so an attacker who reads
// this table can't enumerate registered accounts. The window is small
// (15 min) so the table stays tiny; old rows are pruned opportunistically
// during writes.
export const failedSignInAttempts = pgTable(
  "failed_signin_attempts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    identifierHash: text("identifier_hash").notNull(),
    ip: text("ip"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("failed_signin_attempts_identifier_idx").on(table.identifierHash),
    index("failed_signin_attempts_attempted_at_idx").on(table.attemptedAt),
  ]
);

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
  "website_visited",
  "form_submitted",
  "enrichment_updated",
  "score_changed",
  "system_event",
]);

export const channelEnum = pgEnum("channel", [
  "email",
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

// === CORE TABLES ===

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  plan: text("plan").default("trial"),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    clerkId: text("clerk_id").notNull(),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    avatarUrl: text("avatar_url"),
    role: text("role").default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("users_clerk_id_idx").on(table.clerkId),
    index("users_tenant_id_idx").on(table.tenantId),
  ]
);

export const companies = pgTable(
  "companies",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    name: text("name").notNull(),
    domain: text("domain"),
    industry: text("industry"),
    size: text("size"),
    revenue: text("revenue"),
    description: text("description"),
    properties: jsonb("properties").default({}),
    score: real("score"),
    scoreReasons: jsonb("score_reasons").default([]),
    ownerId: text("owner_id").references(() => users.id),
    resolvedLogoUrl: text("resolved_logo_url"),
    resolvedLogoTier: integer("resolved_logo_tier"),
    logoResolvedAt: timestamp("logo_resolved_at", { withTimezone: true }),
    userUploadedLogoUrl: text("user_uploaded_logo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("companies_tenant_id_idx").on(table.tenantId),
    index("companies_domain_idx").on(table.domain),
    index("companies_logo_resolved_at_idx").on(table.logoResolvedAt),
  ]
);

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    companyId: text("company_id").references(() => companies.id),
    email: text("email"),
    phone: text("phone"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    title: text("title"),
    linkedinUrl: text("linkedin_url"),
    properties: jsonb("properties").default({}),
    score: real("score"),
    scoreReasons: jsonb("score_reasons").default([]),
    ownerId: text("owner_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("contacts_tenant_id_idx").on(table.tenantId),
    index("contacts_company_id_idx").on(table.companyId),
    index("contacts_email_idx").on(table.email),
  ]
);

export const deals = pgTable(
  "deals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    companyId: text("company_id").references(() => companies.id),
    contactId: text("contact_id").references(() => contacts.id),
    ownerId: text("owner_id").references(() => users.id),
    name: text("name").notNull(),
    stage: dealStageEnum("stage").default("lead"),
    value: integer("value"),
    currency: text("currency").default("USD"),
    expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
    properties: jsonb("properties").default({}),
    score: real("score"),
    scoreReasons: jsonb("score_reasons").default([]),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("deals_tenant_id_idx").on(table.tenantId),
    index("deals_company_id_idx").on(table.companyId),
    index("deals_stage_idx").on(table.stage),
  ]
);

export const activities = pgTable(
  "activities",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    actorType: text("actor_type").notNull(), // "user" | "contact" | "system"
    actorId: text("actor_id"),
    entityType: text("entity_type").notNull(), // "contact" | "company" | "deal"
    entityId: text("entity_id").notNull(),
    activityType: activityTypeEnum("activity_type").notNull(),
    channel: channelEnum("channel"),
    direction: directionEnum("direction"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow(),
    metadata: jsonb("metadata").default({}),
    summary: text("summary"),
    rawContent: text("raw_content"),
    sentiment: sentimentEnum("sentiment"),
    threadId: text("thread_id"),
    intent: text("intent").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("activities_tenant_id_idx").on(table.tenantId),
    index("activities_entity_idx").on(table.entityType, table.entityId),
    index("activities_occurred_at_idx").on(table.occurredAt),
    index("activities_type_idx").on(table.activityType),
    index("activities_thread_id_idx").on(table.threadId),
  ]
);

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    authorId: text("author_id").references(() => users.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    title: text("title"),
    content: text("content"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("notes_tenant_id_idx").on(table.tenantId),
    index("notes_entity_idx").on(table.entityType, table.entityId),
  ]
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    assigneeId: text("assignee_id").references(() => users.id),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: text("status").default("pending"), // "pending" | "completed" | "cancelled"
    priority: text("priority").default("medium"), // "low" | "medium" | "high"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("tasks_tenant_id_idx").on(table.tenantId),
    index("tasks_assignee_idx").on(table.assigneeId),
    index("tasks_due_date_idx").on(table.dueDate),
    index("tasks_status_idx").on(table.status),
  ]
);

// Chat threads for the AI agent
export const chatThreads = pgTable(
  "chat_threads",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    userId: text("user_id").references(() => users.id).notNull(),
    title: text("title"),
    contextType: text("context_type"), // "global" | "account" | "contact" | "deal"
    contextId: text("context_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("chat_threads_tenant_id_idx").on(table.tenantId),
    index("chat_threads_user_id_idx").on(table.userId),
  ]
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    threadId: text("thread_id").references(() => chatThreads.id).notNull(),
    role: text("role").notNull(), // "user" | "assistant" | "system"
    content: text("content").notNull(),
    metadata: jsonb("metadata").default({}),
    // CHAT-05: Tree/fork conversation. parentMessageId references the
    // message in the same thread that preceded this one. branchId
    // groups messages that belong to a specific branch (editing a
    // prior user message regenerates in a new branch rather than
    // overwriting). Legacy linear messages keep parentMessageId=NULL
    // and branchId='main'.
    parentMessageId: text("parent_message_id"),
    branchId: text("branch_id").notNull().default("main"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("chat_messages_thread_id_idx").on(table.threadId),
    index("chat_messages_branch_idx").on(table.threadId, table.branchId),
    index("chat_messages_parent_idx").on(table.parentMessageId),
  ]
);

// CHAT-05: Shared prompts — reusable prompt templates scoped to user,
// team, or workspace. Exposes `/` palette in the chat input for quick
// invocation of codified queries.
export const sharedPrompts = pgTable(
  "shared_prompts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    authorId: text("author_id").references(() => users.id).notNull(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    // Visibility scope: 'user' (private to author), 'workspace' (all
    // members). 'team' reserved for future team support.
    scope: text("scope").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("shared_prompts_tenant_scope_idx").on(table.tenantId, table.scope),
    index("shared_prompts_author_idx").on(table.authorId),
  ]
);

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
    campaignConfig: jsonb("campaign_config"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("sequences_tenant_id_idx").on(table.tenantId),
    index("sequences_status_idx").on(table.status),
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
    emailAddress: text("email_address").notNull(),
    displayName: text("display_name"),
    provider: text("provider").notNull(), // gmail, outlook, smtp_custom
    eeAccountId: text("ee_account_id").notNull().unique(),
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

// ============================================================
// CHAT MEMORY (persistent cross-session memory for AI agent)
// ============================================================

export const chatMemories = pgTable(
  "chat_memories",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    userId: text("user_id").references(() => users.id).notNull(),
    // Memory category: user_preference, decision, learned_context, relationship_note
    category: text("category").notNull().default("learned_context"),
    // CHAT-07: scope of visibility — 'user' (private), 'workspace' (all
    // members of the tenant see it). 'team' reserved for CHAT-07 team
    // scopes once the teams table lands.
    scope: text("scope").notNull().default("user"),
    // Short key for retrieval (e.g. "communication_style", "deal_strategy_acme")
    key: text("key").notNull(),
    // The actual memory content
    content: text("content").notNull(),
    // Relevance metadata for retrieval
    metadata: jsonb("metadata").default({}),
    // Auto-expire stale memories
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("chat_memories_tenant_user_idx").on(table.tenantId, table.userId),
    index("chat_memories_category_idx").on(table.category),
    index("chat_memories_scope_idx").on(table.tenantId, table.scope),
  ]
);

// CHAT-01 Wave 3: Comments — threadable notes on any entity.
// Polymorphic on entityType/entityId so contacts, companies, deals,
// meetings, sequences, etc. can all be commented on. parentCommentId
// supports threaded replies (listCommentReplies).
export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    authorId: text("author_id").references(() => users.id).notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    parentCommentId: text("parent_comment_id"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("comments_tenant_entity_idx").on(
      table.tenantId,
      table.entityType,
      table.entityId
    ),
    index("comments_parent_idx").on(table.parentCommentId),
    index("comments_author_idx").on(table.authorId),
  ]
);

// CHAT-04: Tool-call audit + undo support.
// Every tool executed by the chat records an event here. Reversible
// tools (create/update with snapshot) can be rolled back via
// undoLastAction. Destructive tools (merge/delete) are gated on this
// log's presence + reversal support.
export const toolCallEvents = pgTable(
  "tool_call_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    userId: text("user_id").references(() => users.id).notNull(),
    // Which chat thread fired the tool (nullable for non-chat origins)
    threadId: text("thread_id"),
    messageId: text("message_id"),
    // Tool identity
    toolName: text("tool_name").notNull(),
    // Tool invocation inputs (validated zod input)
    args: jsonb("args").default({}),
    // Tool return value (serialized)
    result: jsonb("result").default({}),
    // Lifecycle: proposed | executed | failed | reverted
    status: text("status").notNull().default("executed"),
    // Pre-mutation snapshot for reversal. Shape varies by tool:
    // - createX: { createdId } → reverse = soft/hard delete by id
    // - updateX: { id, before: <row> } → reverse = restore before
    // - deleteX: { before: <row> } → reverse = re-insert
    // - mergeContacts: { survivor: <row>, merged: [<rows>] } → reverse = un-merge
    snapshot: jsonb("snapshot"),
    // If this event was reverted, the id of the undo event that did it
    reverseOpId: text("reverse_op_id"),
    // When the reversal happened
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    // Error message if status=failed
    errorMessage: text("error_message"),
    // Surface context from CHAT-02 (stored for forensics/eval)
    surfaceType: text("surface_type"),
    executedAt: timestamp("executed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("tool_call_events_tenant_user_idx").on(table.tenantId, table.userId),
    index("tool_call_events_tool_name_idx").on(table.toolName),
    index("tool_call_events_thread_idx").on(table.threadId),
    index("tool_call_events_executed_at_idx").on(table.executedAt),
  ]
);

// ============================================================
// CONTEXT GRAPH — Bi-temporal knowledge graph for agent memory
// ============================================================

export const contextGraphNodes = pgTable(
  "context_graph_nodes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    entityType: text("entity_type").notNull(), // person, company, deal, email, meeting, event, topic
    entityId: text("entity_id"), // FK to existing CRM record (contacts.id, companies.id, etc.) — null for external/extracted entities
    name: text("name").notNull(),
    summary: text("summary"),
    properties: jsonb("properties").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("cgn_tenant_idx").on(table.tenantId),
    index("cgn_entity_idx").on(table.tenantId, table.entityType, table.entityId),
    index("cgn_name_idx").on(table.tenantId, table.name),
  ]
);

/**
 * Inbound module — pixel write keys (primitive ⑥).
 *
 * Each pixel ping carries `x-leadsens-write-key: lk_<secret>`; the
 * server SHA-256s it and joins on `key_hash`. Raw keys are shown to
 * the user once at generation time and never stored in the clear.
 */
export const inboundWriteKeys = pgTable(
  "inbound_write_keys",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("inbound_write_keys_tenant_idx").on(table.tenantId),
  ]
);

/**
 * Inbound pixel visitors (primitive ⑥).
 *
 * De-identified pings from the pixel JS snippet on a customer's
 * marketing site. Enrichment via RB2B / Snitcher / Clearbit Reveal
 * lands in identified_company_id + identified_person_email when a
 * provider comes online; until then rows hold raw IP + UA for later
 * backfill. `event_count` counts pageviews within the same session.
 */
export const inboundVisitors = pgTable(
  "inbound_visitors",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    sessionId: text("session_id").notNull(),
    pageUrl: text("page_url"),
    referrer: text("referrer"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    country: text("country"),
    identifiedCompanyId: text("identified_company_id"),
    identifiedPersonEmail: text("identified_person_email"),
    identifiedVia: text("identified_via"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    eventCount: integer("event_count").default(1).notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
  },
  (table) => [
    index("inbound_visitors_tenant_idx").on(table.tenantId),
    index("inbound_visitors_session_idx").on(table.tenantId, table.sessionId),
    index("inbound_visitors_last_seen_idx").on(table.tenantId, table.lastSeenAt),
    index("inbound_visitors_identified_idx").on(table.tenantId, table.identifiedCompanyId),
  ]
);

/**
 * Signal → outcome attribution (primitive ④).
 *
 * Every time a deal closes (won/lost), we record which signals had
 * fired on that deal's company in the observation window. Aggregating
 * by signal_type + outcome gives us a per-tenant lift multiplier
 * ("funding signals predict won with 2.1× lift here"). The scoring
 * library reads those multipliers to weight live signals.
 *
 * Bias note: this is a pragmatic approximation, not a supervised ML
 * model. It recovers gracefully from low sample size by falling back
 * to a uniform 1.0× multiplier until N ≥ 10 per signal type.
 */
export const signalOutcomes = pgTable(
  "signal_outcomes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    dealId: text("deal_id").references(() => deals.id).notNull(),
    companyId: text("company_id").references(() => companies.id),
    signalType: text("signal_type").notNull(),
    signalFiredAt: timestamp("signal_fired_at", { withTimezone: true }),
    outcome: text("outcome").notNull(), // 'won' | 'lost'
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata").default({}),
  },
  (table) => [
    index("signal_outcomes_tenant_idx").on(table.tenantId),
    index("signal_outcomes_tenant_signal_idx").on(table.tenantId, table.signalType, table.outcome),
    index("signal_outcomes_deal_idx").on(table.dealId),
  ]
);

export const contextGraphEdges = pgTable(
  "context_graph_edges",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    sourceNodeId: text("source_node_id").references(() => contextGraphNodes.id).notNull(),
    targetNodeId: text("target_node_id").references(() => contextGraphNodes.id).notNull(),
    relationType: text("relation_type").notNull(), // WORKS_AT, INVOLVED_IN, DISCUSSED, ATTENDED, SENT_EMAIL, MENTIONED, etc.
    fact: text("fact").notNull(), // Human-readable fact description
    confidence: real("confidence").default(1.0),
    // Bi-temporal model
    tValid: timestamp("t_valid", { withTimezone: true }).defaultNow(), // When the fact became true in reality
    tInvalid: timestamp("t_invalid", { withTimezone: true }), // When the fact stopped being true (null = still valid)
    tCreated: timestamp("t_created", { withTimezone: true }).defaultNow(), // When we ingested this edge
    tExpired: timestamp("t_expired", { withTimezone: true }), // When this edge was superseded by new info
    // Source provenance
    sourceType: text("source_type"), // email, meeting, note, enrichment, manual
    sourceId: text("source_id"), // activity.id, note.id, etc.
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("cge_tenant_idx").on(table.tenantId),
    index("cge_source_idx").on(table.sourceNodeId),
    index("cge_target_idx").on(table.targetNodeId),
    index("cge_relation_idx").on(table.tenantId, table.relationType),
    index("cge_valid_idx").on(table.tenantId, table.tValid, table.tInvalid),
  ]
);

// Community clusters for the context graph
export const contextGraphCommunities = pgTable(
  "context_graph_communities",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    name: text("name").notNull(),
    summary: text("summary"),
    nodeIds: jsonb("node_ids").default([]), // array of node IDs in this community
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("cgc_tenant_idx").on(table.tenantId),
  ]
);

// ============================================================
// EVAL SYSTEM — Automated agent evaluation pipeline
// ============================================================

export const evalRunStatusEnum = pgEnum("eval_run_status", [
  "pending", "running", "completed", "failed",
]);

export const evalDatasets = pgTable(
  "eval_datasets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("ed_tenant_idx").on(table.tenantId),
  ]
);

export const evalCases = pgTable(
  "eval_cases",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    datasetId: text("dataset_id").references(() => evalDatasets.id, { onDelete: "cascade" }).notNull(),
    input: text("input").notNull(), // The user query / prompt
    expectedOutput: text("expected_output"), // What the agent should produce (null = open-ended, graded by rubric)
    context: text("context"), // Additional context injected for this case
    tags: jsonb("tags").default([]), // string[] for categorization: "recall", "reasoning", "tool_use", etc.
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("ec_dataset_idx").on(table.datasetId),
  ]
);

export const evalRuns = pgTable(
  "eval_runs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    datasetId: text("dataset_id").references(() => evalDatasets.id).notNull(),
    model: text("model").notNull(), // Model being evaluated (e.g. "claude-sonnet-4-6")
    graderModel: text("grader_model").notNull(), // Model used for grading (cross-model per Anthropic)
    status: evalRunStatusEnum("status").notNull().default("pending"),
    summary: jsonb("summary").default({}), // { passRate, meanScore, totalCases, regressions, perTagScores }
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("er_tenant_idx").on(table.tenantId),
    index("er_dataset_idx").on(table.datasetId),
  ]
);

export const evalResults = pgTable(
  "eval_results",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    runId: text("run_id").references(() => evalRuns.id, { onDelete: "cascade" }).notNull(),
    caseId: text("case_id").references(() => evalCases.id).notNull(),
    agentOutput: text("agent_output"), // What the agent actually produced
    score: real("score"), // 0.0 - 1.0
    pass: boolean("pass"),
    graderReasoning: text("grader_reasoning"), // LLM judge's reasoning
    latencyMs: integer("latency_ms"),
    toolCallsCount: integer("tool_calls_count"),
    metadata: jsonb("metadata").default({}), // Full transcript, tool calls, etc.
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("eres_run_idx").on(table.runId),
    index("eres_case_idx").on(table.caseId),
  ]
);

// ============================================================
// AGENT OBSERVABILITY — Traces for every AI call
// ============================================================

export const agentTraceStatusEnum = pgEnum("agent_trace_status", [
  "ok", "error", "timeout", "corrected",
]);

export const agentTraces = pgTable(
  "agent_traces",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id),
    agentId: text("agent_id").notNull(), // e.g. "chat", "enrich-company", "draft-email"
    agentCategory: text("agent_category").notNull(), // "conversational", "background", "api", "classification", "extraction"
    traceId: text("trace_id"), // parent trace for multi-step chains
    parentSpanId: text("parent_span_id"), // for nested agent calls
    input: text("input"), // truncated prompt/input
    output: text("output"), // truncated response
    model: text("model"), // "claude-sonnet-4-6", "gpt-4o-mini"
    status: agentTraceStatusEnum("status").notNull().default("ok"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    estimatedCost: real("estimated_cost"),
    latencyMs: integer("latency_ms"),
    toolCalls: jsonb("tool_calls").default([]), // [{name, args, result, latencyMs}]
    toolCallsCount: integer("tool_calls_count").default(0),
    errorMessage: text("error_message"),
    correctionApplied: text("correction_applied"), // describes what correction was made
    evalScore: real("eval_score"), // online eval score (0.0-1.0) if sampled
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("at_tenant_idx").on(table.tenantId),
    index("at_agent_idx").on(table.agentId),
    index("at_trace_idx").on(table.traceId),
    index("at_created_idx").on(table.createdAt),
    index("at_status_idx").on(table.status),
  ]
);

// ============================================================
// FLYWHEEL — Self-improving agent system
// ============================================================

/** Versioned system prompts per agent — tracks every prompt change with eval scores */
export const agentPromptVersions = pgTable(
  "agent_prompt_versions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    agentId: text("agent_id").notNull(),
    version: integer("version").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    changeReason: text("change_reason"), // why was this prompt created
    parentVersionId: text("parent_version_id"), // which version was this derived from
    evalScore: real("eval_score"), // score when this prompt was evaluated
    evalPassRate: real("eval_pass_rate"),
    isActive: boolean("is_active").default(false), // only one active per agent
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("apv_agent_idx").on(table.agentId),
    index("apv_active_idx").on(table.agentId, table.isActive),
  ]
);

/** Curated few-shot examples per agent — best production outputs become examples */
export const agentFewShotExamples = pgTable(
  "agent_few_shot_examples",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    agentId: text("agent_id").notNull(),
    input: text("input").notNull(),
    output: text("output").notNull(),
    evalScore: real("eval_score").notNull(), // quality score of this example
    sourceTraceId: text("source_trace_id"), // trace that generated this
    isActive: boolean("is_active").default(true),
    tags: jsonb("tags").default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("afse_agent_idx").on(table.agentId),
    index("afse_score_idx").on(table.agentId, table.evalScore),
  ]
);

/** Failure patterns detected across agent traces */
export const agentFailurePatterns = pgTable(
  "agent_failure_patterns",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    agentId: text("agent_id").notNull(),
    patternType: text("pattern_type").notNull(), // "hallucination", "wrong_tool", "incomplete", "tone", "schema_violation"
    description: text("description").notNull(),
    frequency: integer("frequency").default(1),
    exampleTraceIds: jsonb("example_trace_ids").default([]), // traces exhibiting this pattern
    resolution: text("resolution"), // how was this fixed (prompt change, few-shot, etc.)
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("afp_agent_idx").on(table.agentId),
    index("afp_type_idx").on(table.agentId, table.patternType),
  ]
);

// ── Import History ────────────────────────────────────
export const importHistory = pgTable(
  "import_history",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    userId: text("user_id").references(() => users.id).notNull(),
    fileName: text("file_name").notNull(),
    recordType: text("record_type").notNull(), // "contacts", "companies"
    totalRows: integer("total_rows").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    companiesCreated: integer("companies_created").notNull().default(0),
    status: text("status").notNull().default("completed"), // "completed", "partial", "failed"
    errors: jsonb("errors").default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("import_history_tenant_idx").on(table.tenantId),
    index("import_history_created_idx").on(table.createdAt),
  ]
);

// ── Notetaker Channel (WS-1) ──────────────────────────
// Exposures recorded when the branded meeting bot joins a call with external
// participants. Enables attribution of new signups to the meetings where they
// were exposed to the Elevay brand, so the recorder becomes a measurable
// acquisition channel rather than just a feature.
export const notetakerExposures = pgTable(
  "notetaker_exposures",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    // The meeting activity this exposure belongs to.
    activityId: text("activity_id").notNull(), // FK defined in migration (activities table cascade delete)
    // Tenant whose bot generated the exposure.
    referringTenantId: text("referring_tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    participantEmail: text("participant_email").notNull(),
    participantEmailNormalized: text("participant_email_normalized").notNull(),
    exposureAt: timestamp("exposure_at", { withTimezone: true }).defaultNow().notNull(),
    brandingMode: text("branding_mode").notNull(), // 'full' | 'silent' — only 'full' counts for attribution
    botDisplayName: text("bot_display_name").notNull(),
    ctaClickedAt: timestamp("cta_clicked_at", { withTimezone: true }),
    signupAttributedTenantId: text("signup_attributed_tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    signupAttributedAt: timestamp("signup_attributed_at", { withTimezone: true }),
    metadata: jsonb("metadata").default({}).notNull(),
  },
  (table) => [
    index("notetaker_exposures_email_at_idx").on(table.participantEmailNormalized, table.exposureAt),
    index("notetaker_exposures_referring_at_idx").on(table.referringTenantId, table.exposureAt),
    index("notetaker_exposures_activity_idx").on(table.activityId),
    uniqueIndex("notetaker_exposures_activity_email_uniq").on(table.activityId, table.participantEmailNormalized),
  ]
);

export const tenantReferralCredits = pgTable("tenant_referral_credits", {
  tenantId: text("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  creditsEarnedCount: integer("credits_earned_count").default(0).notNull(),
  creditsConsumedCount: integer("credits_consumed_count").default(0).notNull(),
  lastCreditEarnedAt: timestamp("last_credit_earned_at", { withTimezone: true }),
  metadata: jsonb("metadata").default({}).notNull(),
});

export const referralCreditEvents = pgTable(
  "referral_credit_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    eventType: text("event_type").notNull(), // 'attribution_earned' | 'credit_granted' | 'credit_consumed'
    triggeredByAttributionTenantId: text("triggered_by_attribution_tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    triggeredByExposureId: text("triggered_by_exposure_id").references(() => notetakerExposures.id, { onDelete: "set null" }),
    amountCents: integer("amount_cents").default(0).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("referral_credit_events_tenant_created_idx").on(table.tenantId, table.createdAt),
  ]
);

// ── Coaching & Performance (C5/C7) ─────────────────────

export const coachingInsights = pgTable(
  "coaching_insights",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    userId: text("user_id").references(() => users.id),
    entityType: text("entity_type").notNull(), // "deal" | "email" | "meeting" | "call"
    entityId: text("entity_id").notNull(),
    activityId: text("activity_id").references(() => activities.id),
    insightType: text("insight_type").notNull(), // "pre_send" | "post_interaction" | "deal_risk" | "process_gap"
    category: text("category").notNull(), // "tone" | "completeness" | "objection_handling" | "next_step" | "process_adherence" | "timing"
    score: real("score"), // 0.0 - 1.0
    summary: text("summary").notNull(),
    detail: text("detail").notNull(),
    suggestion: text("suggestion"),
    acknowledged: boolean("acknowledged").default(false),
    applied: boolean("applied").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("coaching_insights_tenant_idx").on(table.tenantId),
    index("coaching_insights_user_idx").on(table.userId),
    index("coaching_insights_entity_idx").on(table.entityType, table.entityId),
    index("coaching_insights_created_at_idx").on(table.createdAt),
  ]
);

export const aePerformanceSnapshots = pgTable(
  "ae_performance_snapshots",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    userId: text("user_id").references(() => users.id).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    emailsSent: integer("emails_sent").default(0),
    emailsReplied: integer("emails_replied").default(0),
    meetingsBooked: integer("meetings_booked").default(0),
    meetingsCompleted: integer("meetings_completed").default(0),
    dealsCreated: integer("deals_created").default(0),
    dealsAdvanced: integer("deals_advanced").default(0),
    dealsWon: integer("deals_won").default(0),
    dealsLost: integer("deals_lost").default(0),
    avgToneScore: real("avg_tone_score"),
    avgCompletenessScore: real("avg_completeness_score"),
    avgObjectionHandlingScore: real("avg_objection_handling_score"),
    avgProcessAdherenceScore: real("avg_process_adherence_score"),
    avgResponseTimeMinutes: real("avg_response_time_minutes"),
    winRate: real("win_rate"),
    overallScore: real("overall_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ae_perf_tenant_user_idx").on(table.tenantId, table.userId),
    index("ae_perf_period_idx").on(table.periodStart, table.periodEnd),
  ]
);

export const customSkillTemplates = pgTable(
  "custom_skill_templates",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(), // "qualification" | "discovery" | "proposal" | "objection" | "closing" | "re_engage"
    description: text("description").notNull(),
    trigger: text("trigger"),
    contextRequired: jsonb("context_required"),
    outputFormat: text("output_format"),
    guidelines: text("guidelines").notNull(),
    examples: jsonb("examples"),
    version: integer("version").default(1),
    isActive: boolean("is_active").default(true),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("custom_skill_templates_tenant_idx").on(table.tenantId),
    index("custom_skill_templates_slug_idx").on(table.tenantId, table.slug),
  ]
);

// ── Custom TAM signals ─────────────────────────────────
// User-defined boolean signals that appear as chips alongside the
// four built-in TAM signals (investor_overlap, funding_recent,
// hiring_intent, yc_company). The user describes a signal in plain
// language ("Companies with a public Status page"); the generator
// produces a detection plan stored in `plan`; the detector runs
// that plan per company and writes the result to
// `companies.properties.customSignals[signalId]` as
// `{ value, reason, sources, confidence, computedAt }`.
export const customSignals = pgTable(
  "custom_signals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    /** Column header label and popover title. Kept short — the UI
     * rendering truncates past ~16 chars. */
    name: text("name").notNull(),
    /** Verbatim user description — fed to the judge LLM as part of
     * the detection prompt, and shown in the "Edit signal" modal so
     * the user can iterate on wording. */
    description: text("description").notNull(),
    /** JSON detection plan: `{ judgePrompt, keywords[], urlPatterns[] }`.
     * Produced by `lib/custom-signals/generator.ts` from the user's
     * description and kept immutable per-signal — editing the
     * description creates a new version rather than mutating. */
    plan: jsonb("plan").notNull(),
    /** Optional presentational accent — index into the color palette
     * used for chips and the column header. Defaults to a rotating
     * palette slot based on insertion order when null. */
    colorIndex: integer("color_index"),
    isActive: boolean("is_active").default(true).notNull(),
    /** ISO timestamp when the full-TAM backfill finished. The UI
     * shows a "Backfilling…" banner under the column header until
     * this is set. */
    backfilledAt: timestamp("backfilled_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("custom_signals_tenant_idx").on(table.tenantId),
    uniqueIndex("custom_signals_tenant_name_idx").on(
      table.tenantId,
      table.name,
    ),
  ],
);

// ── Pending Invitations ────────────────────────────────
export const pendingInvites = pgTable(
  "pending_invites",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"), // "admin" | "member"
    /** 24-byte base64url random token, unique across all tenants. */
    token: text("token").notNull().unique(),
    invitedByUserId: text("invited_by_user_id").references(() => users.id),
    /** "pending" | "accepted" | "cancelled" | "expired" */
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull().defaultNow(),
    resendCount: integer("resend_count").notNull().default(0),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: text("accepted_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("pending_invites_tenant_status_idx").on(table.tenantId, table.status),
    index("pending_invites_email_idx").on(table.tenantId, table.email),
  ]
);

// ============================================================
// WS-1 — Guardrail collection infrastructure
// ============================================================

/**
 * Manual-ops handoff queue for tenants who requested an Elevay-managed
 * sending domain. One active row per tenant; lifecycle
 * pending → in_progress → completed (or cancelled). Never deleted,
 * kept as an ops audit trail. See WS-1-spec §4.1.
 */
export const sendingInfraRequests = pgTable(
  "sending_infra_requests",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id").notNull().references(() => authUsers.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    /** pending | in_progress | completed | cancelled — enforced in SQL via CHECK. */
    status: text("status").notNull().default("pending"),
    assigneeEmail: text("assignee_email"),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sending_infra_requests_tenant_idx").on(table.tenantId),
    index("sending_infra_requests_status_idx").on(table.status),
  ]
);

/**
 * WS-7 — reversible agent actions. Every autonomous action the agent
 * takes creates a row BEFORE any external side-effect fires. Email
 * sends queue with `scheduledExecutionAt = now + 60s` so the user has
 * a grace window to undo before the send reaches SMTP.
 *
 * Lifecycle: scheduled → executed | reversed | failed.
 */
export const agentActions = pgTable(
  "agent_actions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => authUsers.id, { onDelete: "set null" }),
    actionType: text("action_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    scheduledExecutionAt: timestamp("scheduled_execution_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedByUserId: text("reversed_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    reversibleUntil: timestamp("reversible_until", { withTimezone: true }),
    status: text("status").notNull().default("scheduled"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_actions_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("agent_actions_status_idx").on(table.status),
  ]
);

/**
 * Append-only audit trail for every trustScore change. Visible to the
 * user via WS-8's Agent Memory panel (learned-preference category).
 * T2 mitigation in the master brief §8.1 — trustScore is never silent.
 * See WS-1-spec §4.2.
 */
export const trustEvents = pgTable(
  "trust_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    /** Null when the event is tenant-scoped (e.g. system correction); otherwise
     * the user whose action generated the score change. */
    userId: text("user_id").references(() => authUsers.id, { onDelete: "set null" }),
    /** approved_no_edit | approved_with_edit | rejected | undone_after_send |
     * nudge_offered | nudge_accepted | nudge_dismissed — free-form string
     * so WS-8 can add categories without a migration. */
    eventType: text("event_type").notNull(),
    /** Delta applied to settings.trustScore. Can be negative (undo, etc.). */
    scoreDelta: real("score_delta").notNull().default(0),
    /** Resulting score after the delta was applied. Stored for audit so we
     * can reconstruct the trajectory without replaying every event. */
    newScore: real("new_score").notNull(),
    /** Optional ref to the action that triggered this event (email id,
     * contact id, etc.). Free-form string so WS-7's undo layer can write
     * compound refs like `agent_action:xxxx`. */
    entityRef: text("entity_ref"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("trust_events_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("trust_events_event_type_idx").on(table.eventType),
  ]
);
