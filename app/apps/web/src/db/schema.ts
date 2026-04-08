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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("companies_tenant_id_idx").on(table.tenantId),
    index("companies_domain_idx").on(table.domain),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("chat_messages_thread_id_idx").on(table.threadId),
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
    subjectTemplate: text("subject_template").notNull(),
    bodyTemplate: text("body_template").notNull(),
    delayDays: integer("delay_days").default(2),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("sequence_steps_sequence_id_idx").on(table.sequenceId),
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
