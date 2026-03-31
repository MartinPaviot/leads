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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("activities_tenant_id_idx").on(table.tenantId),
    index("activities_entity_idx").on(table.entityType, table.entityId),
    index("activities_occurred_at_idx").on(table.occurredAt),
    index("activities_type_idx").on(table.activityType),
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
