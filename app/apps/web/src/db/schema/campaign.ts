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
import { tenants, companies, contacts, deals } from "./core";
import { sequenceEnrollments } from "./outbound";

// ============================================================
// CAMPAIGN ENGINE 1000X
// ============================================================

export const intelligenceBriefs = pgTable(
  "intelligence_briefs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    websiteSummary: text("website_summary"),
    recentNews: jsonb("recent_news").default([]),
    jobPostings: jsonb("job_postings").default([]),
    techStack: jsonb("tech_stack").default([]),
    linkedinActivity: jsonb("linkedin_activity"),
    publicContent: jsonb("public_content").default([]),
    competitorDetected: text("competitor_detected"),
    communicationStyle: jsonb("communication_style"),
    painPoints: jsonb("pain_points").default([]),
    bestAngle: text("best_angle"),
    warmthSignals: jsonb("warmth_signals").default([]),
    publicContentDepth: integer("public_content_depth").default(0),
    sourcesAttempted: integer("sources_attempted").default(0),
    sourcesSucceeded: integer("sources_succeeded").default(0),
    sourceErrors: jsonb("source_errors").default([]),
    // P1-10 — firmographic/funding facts + per-field provenance from the waterfall.
    firmographics: jsonb("firmographics"),
    firmographicProvenance: jsonb("firmographic_provenance").default([]),
    researchedAt: timestamp("researched_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("intelligence_briefs_tenant_idx").on(table.tenantId),
    index("intelligence_briefs_company_idx").on(table.companyId),
    index("intelligence_briefs_expires_idx").on(table.expiresAt),
    uniqueIndex("intelligence_briefs_tenant_company_contact_idx").on(table.tenantId, table.companyId, table.contactId),
  ]
);

export const outreachPlaybooks = pgTable(
  "outreach_playbooks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    strategyType: text("strategy_type").notNull(),
    isActive: boolean("is_active").default(true),
    customSystemPrompt: text("custom_system_prompt"),
    activationOverrides: jsonb("activation_overrides"),
    totalSent: integer("total_sent").default(0),
    totalReplied: integer("total_replied").default(0),
    totalPositive: integer("total_positive").default(0),
    avgReplyRate: real("avg_reply_rate"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("outreach_playbooks_tenant_type_idx").on(table.tenantId, table.strategyType),
  ]
);

export const enrollmentStrategy = pgTable(
  "enrollment_strategy",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    enrollmentId: text("enrollment_id").notNull().references(() => sequenceEnrollments.id, { onDelete: "cascade" }),
    playbookId: text("playbook_id").notNull().references(() => outreachPlaybooks.id),
    variantId: text("variant_id"),
    selectionScore: real("selection_score").notNull(),
    selectionReason: text("selection_reason").notNull(),
    alternativesConsidered: jsonb("alternatives_considered").default([]),
    warmPathUsed: boolean("warm_path_used").default(false),
    connectorContactId: text("connector_contact_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("enrollment_strategy_enrollment_idx").on(table.enrollmentId),
  ]
);

export const autonomyConfig = pgTable("autonomy_config", {
  tenantId: text("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  level: text("level").notNull().default("copilot"),
  permissions: jsonb("permissions").notNull().default({
    coldEmailSend: "manual",
    replyPositive: "manual",
    replyObjection: "manual",
    replyNegative: "auto_stop",
    warmIntroSend: "manual",
    linkedInActions: "draft_only",
    newProspectAdd: "manual",
    strategySwitch: "ask",
    sequencePause: "ask",
  }),
  guardrails: jsonb("guardrails").notNull().default({
    maxEmailsPerDay: 40,
    maxNewProspectsPerWeek: 25,
    maxEmailsPerProspect: 5,
    maxEmailsPerProspectDays: 21,
    neverContact: [],
    alwaysEscalateWhen: [],
    sendWindow: { start: "08:00", end: "18:00", days: ["mon", "tue", "wed", "thu", "fri"], timezone: "recipient" },
    language: "auto",
    maxDailySpend: 5.0,
  }),
  brand: jsonb("brand").notNull().default({
    writingStyle: "Direct and concise",
    forbiddenWords: [],
    signatureTemplate: "",
    formalityLevel: "match_prospect",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const systemTrustScore = pgTable("system_trust_score", {
  tenantId: text("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  overall: real("overall").notNull().default(50.0),
  perPlaybook: jsonb("per_playbook").default({}),
  perAction: jsonb("per_action").default({}),
  actionsCount: integer("actions_count").default(0),
  approvalsWithoutEdit: integer("approvals_without_edit").default(0),
  rejections: integer("rejections").default(0),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastDowngradeAt: timestamp("last_downgrade_at", { withTimezone: true }),
  lastUpgradeAt: timestamp("last_upgrade_at", { withTimezone: true }),
});

export const contentVariants = pgTable(
  "content_variants",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    playbookId: text("playbook_id").notNull().references(() => outreachPlaybooks.id, { onDelete: "cascade" }),
    segment: text("segment"),
    promptHash: text("prompt_hash").notNull(),
    mutationType: text("mutation_type"),
    isBaseline: boolean("is_baseline").default(false),
    isActive: boolean("is_active").default(true),
    sent: integer("sent").default(0),
    opened: integer("opened").default(0),
    replied: integer("replied").default(0),
    positiveReplied: integer("positive_replied").default(0),
    meetingsBooked: integer("meetings_booked").default(0),
    replyRate: real("reply_rate"),
    positiveRate: real("positive_rate"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("content_variants_playbook_idx").on(table.playbookId, table.isActive),
    index("content_variants_tenant_idx").on(table.tenantId),
  ]
);

// ============================================================
// PIPELINE OBSERVABILITY
// ============================================================

export const pipelineStageEnum = pgEnum("pipeline_stage", [
  "enriched",
  "signal_detected",
  "enrolled",
  "email_generated",
  "email_queued",
  "email_sent",
  "email_delivered",
  "email_opened",
  "email_clicked",
  "email_replied",
  "email_bounced",
  "meeting_booked",
  "deal_created",
  "deal_won",
  "deal_lost",
]);

export const pipelineEvents = pgTable(
  "pipeline_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    traceId: text("trace_id").notNull(),
    tenantId: text("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    companyId: text("company_id").references(() => companies.id),
    contactId: text("contact_id").references(() => contacts.id),
    dealId: text("deal_id").references(() => deals.id),
    enrollmentId: text("enrollment_id"),
    outboundEmailId: text("outbound_email_id"),
    stage: pipelineStageEnum("stage").notNull(),
    sourceSystem: text("source_system").notNull(),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("pe_trace_idx").on(table.traceId),
    index("pe_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("pe_company_created_idx").on(table.companyId, table.createdAt),
    index("pe_stage_created_idx").on(table.stage, table.createdAt),
    index("pe_contact_idx").on(table.contactId),
    index("pe_enrollment_idx").on(table.enrollmentId),
  ],
);
