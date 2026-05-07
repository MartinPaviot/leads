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
import { tenants } from "./core";
import { authUsers } from "./auth";

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

// ============================================================
// CROSS-TENANT ANONYMIZED SIGNAL BENCHMARKS (#96)
// ============================================================

/**
 * Aggregated, anonymized signal outcome rates across tenants. Each row
 * is a "bucket" keyed by (industry, companySize, signalType). Only
 * buckets where >=10 distinct tenants contributed are materialized
 * (k-anonymity guarantee). Refreshed weekly by the
 * `cron-anonymized-signal-aggregation` Inngest function.
 *
 * No company names, contact names, or email addresses are stored —
 * only aggregate counts and rates.
 */
export const anonymizedSignalBenchmarks = pgTable(
  "anonymized_signal_benchmarks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    industry: text("industry").notNull(),
    companySize: text("company_size").notNull(),
    signalType: text("signal_type").notNull(),
    /** % of signals in this bucket that led to won deals (0.0 - 1.0). */
    outcomeRate: real("outcome_rate").notNull(),
    /** Number of distinct tenants contributing to this bucket. */
    tenantCount: integer("tenant_count").notNull(),
    /** Total number of signal outcome observations across all tenants. */
    totalObservations: integer("total_observations").notNull(),
    /** Average deal cycle in days for won deals in this bucket. */
    avgDealCycleDays: real("avg_deal_cycle_days"),
    /** ISO timestamp of the aggregation run that produced this row. */
    aggregatedAt: timestamp("aggregated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("asb_industry_size_idx").on(table.industry, table.companySize),
    index("asb_signal_type_idx").on(table.signalType),
    uniqueIndex("asb_bucket_unique_idx").on(table.industry, table.companySize, table.signalType),
  ]
);

// ============================================================
// DISTILLATION PIPELINE (#97) — Training data from production
// ============================================================

/**
 * High-quality (input, output) pairs captured from production agent runs
 * for future fine-tuning. Sources of quality signal:
 * - User approved output without editing (trust score: approved_no_edit)
 * - Eval score >= 0.85 on a traced run
 * - User gave explicit positive feedback
 *
 * Privacy: all PII is stripped before storage. Tenant-specific data
 * (company names, contact names, emails) is replaced with placeholders.
 * The resulting dataset is safe for cross-tenant model training.
 */
export const distillationSamples = pgTable(
  "distillation_samples",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    agentId: text("agent_id").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    userInput: text("user_input").notNull(),
    assistantOutput: text("assistant_output").notNull(),
    toolCalls: jsonb("tool_calls").default([]).notNull(), // tool names only, no args
    qualitySource: text("quality_source").notNull(), // "user_approved" | "eval_high_score" | "explicit_feedback"
    qualityScore: real("quality_score").notNull(),
    tenantId: text("tenant_id").references(() => tenants.id),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ds_agent_idx").on(table.agentId),
    index("ds_quality_source_idx").on(table.qualitySource),
    index("ds_quality_score_idx").on(table.qualityScore),
    index("ds_created_idx").on(table.createdAt),
  ]
);

// ============================================================
// PROMPT EXPERIMENTS — A/B testing for prompt variations
// ============================================================

export const promptExperimentStatusEnum = pgEnum("prompt_experiment_status", [
  "active", "concluded", "canceled",
]);

/**
 * Prompt A/B experiments — test prompt variations in production
 * and measure their impact on eval scores and user approval rates.
 *
 * An experiment defines a base prompt and a variant prompt delta,
 * a traffic split, and duration. The system assigns tenants to
 * base or variant using a deterministic hash, then records per-
 * variant metrics (eval_score, approved, rejected) in the
 * prompt_experiment_metrics table. When the experiment ends, the
 * winner is computed from aggregate scores.
 */
export const promptExperiments = pgTable(
  "prompt_experiments",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    agentId: text("agent_id").notNull(), // "chat", "draft-email", etc.
    name: text("name").notNull(),
    basePromptHash: text("base_prompt_hash").notNull(), // SHA-256 of current prompt
    variantPromptDelta: text("variant_prompt_delta").notNull(), // what changed in the variant
    trafficPercent: integer("traffic_percent").notNull().default(50), // 0-100, variant gets this %
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: promptExperimentStatusEnum("status").notNull().default("active"),
    /** Aggregated results computed when the experiment concludes. */
    results: jsonb("results"), // { baseEvalScore, variantEvalScore, baseApprovalRate, variantApprovalRate, sampleSize, winner }
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("prompt_experiments_agent_idx").on(table.agentId),
    index("prompt_experiments_status_idx").on(table.status),
    index("prompt_experiments_dates_idx").on(table.startsAt, table.endsAt),
  ]
);

/**
 * Per-request metrics for prompt experiments. Each row records a single
 * observation (one chat turn, one email draft) and which variant arm
 * served it. Aggregated at conclusion time to produce experiment.results.
 */
export const promptExperimentMetrics = pgTable(
  "prompt_experiment_metrics",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    experimentId: text("experiment_id").references(() => promptExperiments.id, { onDelete: "cascade" }).notNull(),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    variant: text("variant").notNull(), // "base" | "variant"
    metric: text("metric").notNull(), // "eval_score" | "approved" | "rejected"
    value: real("value").notNull(), // score (0-1) or count (1.0 per event)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("pem_experiment_idx").on(table.experimentId),
    index("pem_experiment_variant_idx").on(table.experimentId, table.variant),
    index("pem_tenant_idx").on(table.tenantId),
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

export const knowledgeEntries = pgTable(
  "knowledge_entries",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("workspace"),
    title: text("title").notNull(),
    category: text("category").notNull().default("custom"),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("knowledge_entries_tenant_idx").on(table.tenantId),
    index("knowledge_entries_scope_idx").on(table.tenantId, table.scope),
    index("knowledge_entries_category_idx").on(table.tenantId, table.category),
  ]
);

export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("queued"),
    progressCurrent: integer("progress_current").notNull().default(0),
    progressTotal: integer("progress_total"),
    progressMessage: text("progress_message"),
    result: jsonb("result"),
    error: text("error"),
    chatThreadId: text("chat_thread_id"),
    chatMessageId: text("chat_message_id"),
    inngestEventId: text("inngest_event_id"),
    checkpoint: jsonb("checkpoint"),
    dependsOn: jsonb("depends_on").$type<string[]>().default([]),
    queuedAt: timestamp("queued_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_tasks_tenant_status_idx").on(table.tenantId, table.status),
    index("agent_tasks_user_active_idx").on(table.userId, table.status),
    index("agent_tasks_thread_idx").on(table.chatThreadId),
  ]
);

// ============================================================
// F001 — AGENT EVENT LOOP: Reactor decisions
// ============================================================

export const agentReactions = pgTable(
  "agent_reactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    deduplicationKey: text("deduplication_key").notNull(),
    contextSnapshot: jsonb("context_snapshot").notNull().default({}),
    decision: jsonb("decision").notNull().default({}),
    actionsTaken: integer("actions_taken").notNull().default(0),
    actionsDeferred: integer("actions_deferred").notNull().default(0),
    actionsSkipped: integer("actions_skipped").notNull().default(0),
    processingTimeMs: integer("processing_time_ms"),
    modelUsed: text("model_used"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_reactions_dedup_idx").on(table.tenantId, table.deduplicationKey),
    index("agent_reactions_entity_idx").on(table.tenantId, table.entityType, table.entityId),
    index("agent_reactions_created_idx").on(table.tenantId, table.createdAt),
  ]
);

// ============================================================
// F002 — AGENT STATE MACHINE: Persistent work items
// ============================================================

export const agentWorkItems = pgTable(
  "agent_work_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    entityLabel: text("entity_label").notNull(),

    strategy: text("strategy").notNull(),
    strategyReasoning: text("strategy_reasoning").notNull(),
    strategySetAt: timestamp("strategy_set_at", { withTimezone: true }).notNull(),

    priority: text("priority").notNull().default("medium"),
    priorityReasoning: text("priority_reasoning"),

    nextAction: text("next_action"),
    nextActionDetail: text("next_action_detail"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),

    lastAgentActionId: text("last_agent_action_id"),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
    evaluationCount: integer("evaluation_count").notNull().default(0),

    status: text("status").notNull().default("active"),
    archivedReason: text("archived_reason"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),

    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_work_items_tenant_priority_idx").on(table.tenantId, table.priority),
    index("agent_work_items_entity_idx").on(table.tenantId, table.entityType, table.entityId),
    index("agent_work_items_next_action_idx").on(table.tenantId, table.nextActionAt),
  ]
);

// ============================================================
// F003 — OUTCOME TRACKING: Action→result feedback loop
// ============================================================

export const actionOutcomes = pgTable(
  "action_outcomes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    actionId: text("action_id").notNull(),
    reactionId: text("reaction_id"),

    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    actionType: text("action_type").notNull(),
    expectedOutcome: text("expected_outcome").notNull(),
    observationWindowHours: integer("observation_window_hours").notNull().default(168),

    status: text("status").notNull().default("watching"),
    outcomeType: text("outcome_type"),
    positivity: real("positivity"),
    timeToOutcomeHours: real("time_to_outcome_hours"),
    outcomeMetadata: jsonb("outcome_metadata").default({}),

    triggerType: text("trigger_type"),
    entitySnapshot: jsonb("entity_snapshot").default({}),

    watchingSince: timestamp("watching_since", { withTimezone: true }).defaultNow().notNull(),
    windowExpiresAt: timestamp("window_expires_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("action_outcomes_watching_idx").on(table.tenantId, table.status, table.windowExpiresAt),
    index("action_outcomes_action_idx").on(table.actionId),
    index("action_outcomes_entity_idx").on(table.tenantId, table.entityType, table.entityId),
    index("action_outcomes_stats_idx").on(table.tenantId, table.actionType, table.status),
  ]
);

// ============================================================
// CODE EXECUTIONS
// ============================================================

export const codeExecutions = pgTable(
  "code_executions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    chatThreadId: text("chat_thread_id"),
    code: text("code").notNull(),
    dataQuery: text("data_query"),
    mode: text("mode").notNull().default("read"),
    status: text("status").notNull().default("running"),
    output: jsonb("output"),
    error: text("error"),
    executionTimeMs: integer("execution_time_ms"),
    iteration: integer("iteration").notNull().default(1),
    parentExecutionId: text("parent_execution_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("code_executions_tenant_idx").on(table.tenantId),
    index("code_executions_thread_idx").on(table.chatThreadId),
  ]
);
