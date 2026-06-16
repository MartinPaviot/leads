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
import { tenants, users, companies, contacts, deals, activities } from "./core";

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

/**
 * Score snapshots — a prospect's grade/score AT a funnel-entry event (call
 * attempt, sequence enroll, email send). Calibration joins the OUTCOME back to
 * the grade that was live at the touch, not the current re-scored grade —
 * removing look-ahead bias (_specs/propensity-scoring A1).
 */
export const scoreSnapshots = pgTable(
  "score_snapshots",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id).notNull(),
    entityType: text("entity_type").notNull(), // 'contact' | 'company'
    entityId: text("entity_id").notNull(),
    grade: text("grade").notNull(), // A+ … F at the event
    score: real("score").notNull(),
    event: text("event").notNull(), // 'call_attempt' | 'sequence_enroll' | 'email_sent'
    eventRef: text("event_ref"), // the call / enrollment / email id, when known
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("score_snapshots_tenant_idx").on(table.tenantId),
    index("score_snapshots_tenant_event_idx").on(table.tenantId, table.event),
    index("score_snapshots_event_ref_idx").on(table.eventRef),
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
    /** Canary traffic percentage (0-100). 0 = inactive canary, 100 = full rollout.
     * When two versions are active for the same agent, tenants are routed
     * via consistent hashing on tenantId. See lib/prompt-canary.ts. */
    canaryPercent: integer("canary_percent").default(0).notNull(),
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
    category: text("category").notNull(),
    description: text("description").notNull(),
    scope: text("scope").notNull().default("workspace"),
    trigger: text("trigger"),
    contextRequired: jsonb("context_required"),
    outputFormat: text("output_format"),
    guidelines: text("guidelines").notNull(),
    steps: jsonb("steps").$type<Array<{ order: number; instruction: string; toolHint?: string }>>().default([]),
    constraints: jsonb("constraints").$type<Array<{ instruction: string }>>().default([]),
    parameters: jsonb("parameters").$type<Array<{ name: string; description: string; required: boolean; defaultValue?: string }>>().default([]),
    examples: jsonb("examples"),
    version: integer("version").default(1),
    isActive: boolean("is_active").default(true),
    forkedFromId: text("forked_from_id"),
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("custom_skill_templates_tenant_idx").on(table.tenantId),
    index("custom_skill_templates_slug_idx").on(table.tenantId, table.slug),
    index("custom_skill_templates_scope_idx").on(table.tenantId, table.scope),
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
    // Multi-ICP binding (Phase 3, _specs/multi-icp R9). Nullable: a
    // signal can be scoped to one ICP (e.g. "HDS mention" matters for
    // the Santé ICP only) or stay tenant-wide (null). ON DELETE SET
    // NULL via the migration.
    icpId: text("icp_id"),
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
    index("custom_signals_icp_idx").on(table.icpId),
    uniqueIndex("custom_signals_tenant_name_idx").on(
      table.tenantId,
      table.name,
    ),
  ],
);

// ── Playbook entries (B4, _specs/pilae-machine) ─────────
// Captures the operational learnings from every conversation: the
// objections heard, the accroches that landed, the questions worth
// asking next time. Fed by the post-call extraction Inngest fn
// (`playbook-capture-post-call.ts`). Read by the dashboard
// "Playbook" tab and by the message-generation prompt as exemplars.
// `perf_score` lets the team rank what actually moves deals.
export const playbookEntries = pgTable(
  "playbook_entries",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    /** "objection" | "accroche" | "question". Constrained at the
     *  helper validation layer to keep the storage column flexible
     *  while the team explores new entry kinds. */
    type: text("type").notNull(),
    content: text("content").notNull(),
    /** Source activity (a call or meeting in `activities`) the
     *  entry was distilled from. Null when the founder typed it
     *  in directly via the playbook UI. */
    sourceActivityId: text("source_activity_id").references(
      () => activities.id,
    ),
    /** Free-form outcome the team observed when this entry surfaced
     *  in a conversation (e.g. "led to deep-dive", "stalled deal",
     *  "champion reaction"). Aggregated with perf_score for ranking. */
    outcomeLabel: text("outcome_label"),
    /** 0..1 scalar: how well did this entry work when used?
     *  Either set manually by the founder during review or computed
     *  by the LLM judge from the deal outcome over time. NULL until
     *  the entry has been seen at least once in a follow-up
     *  conversation. */
    perfScore: real("perf_score"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("playbook_entries_tenant_type_idx").on(table.tenantId, table.type),
    index("playbook_entries_source_idx").on(table.sourceActivityId),
    index("playbook_entries_perf_idx").on(table.tenantId, table.perfScore),
  ],
);

// ── Pending Invitations ────────────────────────────────
export const pendingInvites = pgTable(
  "pending_invites",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"), // "admin" | "member" | "viewer"
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
