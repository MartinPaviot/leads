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
import { activityTypeEnum, channelEnum, directionEnum, sentimentEnum, dealStageEnum } from "./enums";

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
    // SOC2 T5 — offboarding. Set => the member can no longer authenticate
    // (login rejected + live sessions revoked via lib/auth/session-guard).
    // Null => active. Reversible by clearing it.
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
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
    // Anti-ICP exclusion (B1, _specs/pilae-machine). When set, the
    // company matched the tenant's anti-ICP rules and must NOT be
    // enrolled into outbound sequences. NULL means eligible. Reason
    // is a free-form tag (e.g. "anti_icp_industry", "anti_icp_size",
    // "do_not_contact_request").
    excludedReason: text("excluded_reason"),
    excludedAt: timestamp("excluded_at", { withTimezone: true }),
    // Priority score (B3, _specs/pilae-machine).
    // Composite of signal lift multiplier × ICP fit score × contact
    // accessibility. Recomputed by the `signal.score.daily` Inngest
    // cron. Range ~0.0 - 2.5. NULL until first compute. Used as the
    // primary sort key for the call queue and the priority view in
    // the dashboard. See `lib/scoring/priority-score.ts`.
    priorityScore: real("priority_score"),
    priorityScoreComputedAt: timestamp("priority_score_computed_at", {
      withTimezone: true,
    }),
    // TAM freshness + origin (tam-lifecycle). lastEnrichedAt: when
    // enrichment last wrote this row — the refresh queue sorts the
    // stalest first; NULL = never enriched. sourceSystem: the system the
    // record originated from (apollo|csv|manual|inbound|...), denormalised
    // from properties.source for the accounts "Source" column + filters.
    lastEnrichedAt: timestamp("last_enriched_at", { withTimezone: true }),
    sourceSystem: text("source_system"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("companies_tenant_id_idx").on(table.tenantId),
    index("companies_domain_idx").on(table.domain),
    index("companies_logo_resolved_at_idx").on(table.logoResolvedAt),
    index("companies_excluded_at_idx").on(table.excludedAt),
    index("companies_priority_score_idx").on(
      table.tenantId,
      table.priorityScore,
    ),
    index("companies_tenant_last_enriched_idx").on(
      table.tenantId,
      table.lastEnrichedAt,
    ),
  ]
);

// Durable suppression ledger — the persistent "memory" of accounts the user
// removed (deleted) or marked not-a-fit (excluded). Unlike the flags ON the
// companies row (deletedAt / excludedReason), this survives even if the row is
// later hard-deleted, and is keyed by STABLE IDENTITY (domain + normalized
// name + native registry id such as SIREN / Zefix UID) so every discovery
// source — Apollo, SIRENE, Zefix, Pappers — can skip a suppressed account
// even when it has no domain. Reversible: restoring an account (or re-including
// an excluded one) removes its ledger row. See lib/accounts/suppression.ts.
export const accountSuppressions = pgTable(
  "account_suppressions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    // Which entity this suppresses: 'company' or 'contact'. The same ledger
    // covers both so neither is ever re-sourced after removal.
    entityType: text("entity_type").notNull().default("company"),
    // The row this came from (nullable — kept for restore + audit, but the
    // suppression stands even if the row is later removed). For contacts this
    // holds the contact id.
    companyId: text("company_id"),
    kind: text("kind").notNull(), // 'deleted' | 'excluded'
    reason: text("reason"),
    // Company identity (any may be null).
    domain: text("domain"),
    nameNormalized: text("name_normalized"),
    nativeId: text("native_id"), // SIREN / Zefix UID / Apollo id
    nativeIdType: text("native_id_type"),
    // Contact identity (any may be null).
    email: text("email"),
    linkedin: text("linkedin"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("account_suppressions_tenant_idx").on(table.tenantId),
    index("account_suppressions_tenant_domain_idx").on(table.tenantId, table.domain),
    index("account_suppressions_tenant_native_idx").on(table.tenantId, table.nativeId),
    index("account_suppressions_tenant_name_idx").on(table.tenantId, table.nameNormalized),
    index("account_suppressions_tenant_email_idx").on(table.tenantId, table.email),
    index("account_suppressions_tenant_linkedin_idx").on(table.tenantId, table.linkedin),
    index("account_suppressions_company_idx").on(table.companyId),
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
    // TAM freshness + origin (tam-lifecycle) — same semantics as companies.
    lastEnrichedAt: timestamp("last_enriched_at", { withTimezone: true }),
    sourceSystem: text("source_system"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("contacts_tenant_id_idx").on(table.tenantId),
    index("contacts_company_id_idx").on(table.companyId),
    index("contacts_email_idx").on(table.email),
    index("contacts_tenant_last_enriched_idx").on(
      table.tenantId,
      table.lastEnrichedAt,
    ),
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
    // Legacy single-bag amount. Kept for backward compatibility with
    // deals created before the split (B2). New deals should populate
    // `projectAmount` and/or `platformArr` instead; consumers must
    // route through `lib/deals/amount.ts#getDealAmountDisplay()` to
    // avoid implicit blending of the two bookings types.
    value: integer("value"),
    currency: text("currency").default("USD"),
    // Deal split (B2, _specs/pilae-machine).
    // projectAmount = one-time project booking (consulting, build,
    //   delivery — recognised on delivery).
    // platformArr   = recurring platform booking, annualised — the
    //   ARR-eligible portion.
    // NEVER sum these into `value`. Display total via the helper.
    projectAmount: integer("project_amount"),
    platformArr: integer("platform_arr"),
    expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
    properties: jsonb("properties").default({}),
    score: real("score"),
    scoreReasons: jsonb("score_reasons").default([]),
    summary: text("summary"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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

// Human-in-the-loop capture approval (gap E / Lightfield-parity). Holds
// pending auto-captured interactions awaiting review when a tenant sets
// settings.captureApprovalMode = 'review'. On approval the proposedActivity
// is inserted verbatim into `activities`. See lib/capture/approval.ts.
export const captureApprovals = pgTable(
  "capture_approvals",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    kind: text("kind").notNull(), // "email" | "meeting" | "call"
    // idempotency key (gmailMessageId / meetingId / callId)
    sourceRef: text("source_ref"),
    // the activities row to insert verbatim on approval
    proposedActivity: jsonb("proposed_activity").notNull(),
    summary: text("summary"),
    status: text("status").notNull().default("pending"), // pending|approved|rejected
    appliedActivityId: text("applied_activity_id"),
    reviewedByUserId: text("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("capture_approvals_tenant_status_idx").on(table.tenantId, table.status),
  ],
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
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("notes_tenant_id_idx").on(table.tenantId),
    index("notes_entity_idx").on(table.entityType, table.entityId),
  ]
);

// Live thread presence for the team inbox (INBOX-X03): who is viewing/drafting a
// conversation right now. One row per (tenant, conversation, user), refreshed by
// a heartbeat; a viewer is "active" while last_seen_at is recent. Read defensively
// (try/catch) so the inbox runs identically until this table is migrated in.
export const inboxPresence = pgTable(
  "inbox_presence",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    conversationKey: text("conversation_key").notNull(),
    userId: text("user_id").notNull(),
    state: text("state").notNull().default("viewing"), // "viewing" | "drafting"
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("inbox_presence_uniq").on(table.tenantId, table.conversationKey, table.userId),
    index("inbox_presence_key_idx").on(table.tenantId, table.conversationKey),
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
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
