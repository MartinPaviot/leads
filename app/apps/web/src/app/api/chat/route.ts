import { getAuthContext } from "@/lib/auth-utils";
import { clearTenantId } from "@/db/rls";
import { checkPlanLimit } from "@/lib/plan-limits";
import { trackUsage } from "@/lib/billing";
import { apiError } from "@/lib/api-errors";
import { anthropic } from "@/lib/ai-provider";
import { openai } from "@ai-sdk/openai";
import { isCircuitClosed, ANTHROPIC_CIRCUIT } from "@/lib/circuit-breaker";
import { UIMessage, convertToModelMessages, stepCountIs } from "ai";
import { tracedStreamText } from "@/lib/traced-ai";
import { searchSimilar } from "@/lib/embeddings";
import { searchContextGraph } from "@/lib/context-graph";
import { db } from "@/db";
import { companies, contacts, deals, activities, notes, chatMemories } from "@/db/schema";
import { and, eq, desc, sql, or } from "drizzle-orm";
import { getTenantSettings, deriveTargetRoles, type TenantSettings } from "@/lib/tenant-settings";
import { buildChatSystemPrompt } from "@/lib/prompts/chat-system-prompt";
import { buildAllChatTools, type ToolContext } from "@/lib/chat/tools";
import { resolveCapabilities, type SurfaceContext } from "@/lib/agents/capability-resolver";
import { routeTools } from "@/lib/chat/tool-router";
import { orchestrate } from "@/lib/agents/orchestrator";
import { getActivePromptVersion } from "@/lib/prompt-canary";
import { getChatExperimentDelta, applyPromptDelta, recordExperimentMetric } from "@/lib/prompt-experiments";

export const maxDuration = 60;

function inferSurface(contextType?: string, contextId?: string): SurfaceContext {
  if (!contextType) return { type: "global" };
  const t = contextType.toLowerCase();
  if (t === "contact") return { type: "contact", entityId: contextId };
  if (t === "account" || t === "company") return { type: "account", entityId: contextId };
  if (t === "deal" || t === "opportunity") return { type: "deal", entityId: contextId };
  if (t === "meeting") return { type: "meeting", entityId: contextId };
  if (t === "list") return { type: "list", listResource: contextId };
  return { type: "global" };
}

// ── Token estimation ────────────────────────────────────────────
/** Rough token count: ~4 chars per token for English text (conservative). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.25);
}

function estimateMessagesTokens(messages: UIMessage[]): number {
  return messages.reduce((sum, m) => {
    const text = m.parts
      ?.filter((p) => p.type === "text")
      .map((p) => ("text" in p ? p.text : ""))
      .join("") || "";
    return sum + estimateTokens(text) + 4; // +4 for message overhead (role, separators)
  }, 0);
}

// ── Context Management: compact long conversations ──────────────
const TOKEN_BUDGET = 8000;

/**
 * Compact a conversation when it exceeds the token budget or message count.
 *
 * Strategy:
 * - When messages > 20 OR estimated tokens > TOKEN_BUDGET, compact.
 * - Uses LLM (Haiku, cheap) to produce a concise summary of older messages.
 * - Falls back to text concatenation if LLM call fails or is unavailable.
 * - Keeps the first message (original context) + most recent 80% of maxMessages.
 */
async function compactMessages(messages: UIMessage[], maxMessages: number = 30): Promise<UIMessage[]> {
  const totalTokens = estimateMessagesTokens(messages);
  const needsCompaction = messages.length > Math.min(maxMessages, 20) || totalTokens > TOKEN_BUDGET;

  if (!needsCompaction) return messages;

  // Keep the first message (for context) and the most recent messages
  const keepRecent = Math.floor(maxMessages * 0.8);
  const older = messages.slice(1, messages.length - keepRecent);
  const recent = messages.slice(messages.length - keepRecent);

  if (older.length === 0) return messages;

  // Build text from older messages for summarization
  const olderTexts = older
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const text = m.parts
        ?.filter((p) => p.type === "text")
        .map((p) => ("text" in p ? p.text : ""))
        .join("") || "";
      return `[${m.role}]: ${text.slice(0, 300)}`;
    })
    .join("\n");

  // Attempt LLM-based summarization (Haiku = fast + cheap, ~$0.001 per call)
  let summaryText: string;
  try {
    const haiku = process.env.ANTHROPIC_API_KEY
      ? anthropic("claude-haiku-4-5-20251001")
      : null;
    const fallbackModel = process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
    const summaryModel = haiku || fallbackModel;

    if (summaryModel && older.length >= 4) {
      const { generateText } = await import("ai");
      const result = await generateText({
        model: summaryModel,
        prompt: `Summarize this conversation history into a concise paragraph (max 150 words). Preserve key facts: entity names, numbers, decisions made, and open questions. Do not add commentary.

${olderTexts}`,
        // @ts-expect-error maxTokens exists in AI SDK but type definition may lag
        maxTokens: 250,
      });
      summaryText = result.text.trim();
    } else {
      // Fallback: concatenate truncated messages
      summaryText = olderTexts;
    }
  } catch {
    // LLM unavailable — fall back to text concatenation
    summaryText = olderTexts;
  }

  const summaryMessage: UIMessage = {
    id: "context-summary",
    role: "user" as const,
    parts: [{
      type: "text" as const,
      text: `[CONTEXT SUMMARY - Earlier in this conversation:\n${summaryText}\n...End of summary. Continue from here.]`,
    }],
  };

  return [messages[0], summaryMessage, ...recent];
}

// ── Enhanced Citations: structure RAG results as numbered sources ──────
function formatCitedSources(
  ragResults: Array<{ entityType: string; entityId: string; content: string; similarity: number }>
): string {
  if (ragResults.length === 0) return "";

  const sources = ragResults.map((r, i) => {
    const link =
      r.entityType === "contact" ? `/contacts/${r.entityId}`
      : r.entityType === "company" ? `/accounts/${r.entityId}`
      : r.entityType === "deal" ? `/opportunities/${r.entityId}`
      : "";
    return `[Source ${i + 1}] (${r.entityType}:${r.entityId}) ${link}\n${r.content}`;
  });

  return `\n\n## Source Documents (cite these using [Source N] format)\n${sources.join("\n\n")}`;
}

/** Build a snapshot of the tenant's CRM data for the system prompt */
async function getCRMSnapshot(tenantId: string, settings: TenantSettings): Promise<string> {
  const [accountCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(companies)
    .where(eq(companies.tenantId, tenantId));

  const [contactCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId));

  const [dealCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(deals)
    .where(eq(deals.tenantId, tenantId));

  const [activityCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activities)
    .where(eq(activities.tenantId, tenantId));

  const recentAccounts = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain, industry: companies.industry, score: companies.score })
    .from(companies)
    .where(eq(companies.tenantId, tenantId))
    .orderBy(desc(companies.createdAt))
    .limit(10);

  const recentContacts = await db
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, title: contacts.title, companyId: contacts.companyId })
    .from(contacts)
    .where(eq(contacts.tenantId, tenantId))
    .orderBy(desc(contacts.createdAt))
    .limit(10);

  const recentDeals = await db
    .select({ id: deals.id, name: deals.name, stage: deals.stage, value: deals.value })
    .from(deals)
    .where(eq(deals.tenantId, tenantId))
    .orderBy(desc(deals.createdAt))
    .limit(10);

  const recentActivities = await db
    .select({
      id: activities.id,
      activityType: activities.activityType,
      summary: activities.summary,
      entityType: activities.entityType,
      entityId: activities.entityId,
      occurredAt: activities.occurredAt,
      direction: activities.direction,
    })
    .from(activities)
    .where(eq(activities.tenantId, tenantId))
    .orderBy(desc(activities.occurredAt))
    .limit(15);

  // Load custom field definitions and pipeline stages for AI awareness
  let customFieldsInfo = "";
  let pipelineStagesInfo = "";
  let businessContext = "";

  // Build business context from onboarding data
  const contextParts: string[] = [];
  if (settings.productDescription) contextParts.push(`Product: ${settings.productDescription}`);
  if (settings.salesMotion) contextParts.push(`Sales motion: ${settings.salesMotion}`);
  if (settings.aiTone) contextParts.push(`Preferred email tone: ${settings.aiTone}`);
  if (settings.onboardingRole) contextParts.push(`User role: ${settings.onboardingRole}`);
  if (settings.primaryChallenge) contextParts.push(`Primary challenge: ${settings.primaryChallenge}`);
  if (settings.targetIndustries?.length)
    contextParts.push(`Target industries: ${settings.targetIndustries.join(", ")}`);
  if (settings.targetCompanySizes?.length)
    contextParts.push(`Target company sizes: ${settings.targetCompanySizes.join(", ")}`);
  // BUG-WS0-008: derive targetRoles at read time
  const derivedRoles = deriveTargetRoles(settings);
  if (derivedRoles) contextParts.push(`Target buyer roles: ${derivedRoles}`);
  if (settings.targetGeographies?.length)
    contextParts.push(`Target geographies: ${settings.targetGeographies.join(", ")}`);
  if (contextParts.length > 0) {
    businessContext = `\n\n## Business Context (from onboarding)\n${contextParts.join("\n")}`;
  }

  // Custom fields and pipeline stages
  const customFields = settings.customFields || [];
  const pipelineStages = settings.pipelineStages || [];

  if (customFields.length > 0) {
    customFieldsInfo = `\n\n### Custom Fields (user-defined schema)\n${customFields.map(
      (f) => `- ${f.entityType}.${f.name} (${f.type}, AI fill: ${f.aiFillMode})${f.options ? ` [options: ${f.options.join(", ")}]` : ""}`
    ).join("\n")}`;
    customFieldsInfo += `\nCustom field values are stored in entity properties.customFields.{fieldId}. When creating/updating records, set custom field values there.`;
  }

  if (pipelineStages.length > 0) {
    pipelineStagesInfo = `\n\n### Pipeline Stages (configured by user)\n${pipelineStages.map(
      (s) => `- ${s.name} (${s.category}): ${s.description || "no description"} [AI: ${s.aiFillMode || "auto"}]`
    ).join("\n")}`;
  }

  let snapshot = `${businessContext}\n\n## CRM Data Snapshot
- Accounts: ${accountCount.count}
- Contacts: ${contactCount.count}
- Deals: ${dealCount.count}
- Activities: ${activityCount.count}${customFieldsInfo}${pipelineStagesInfo}`;

  if (recentAccounts.length > 0) {
    snapshot += `\n\n### Recent Accounts\n${recentAccounts.map((a) => `- ${a.name} (${a.domain || "no domain"}, ${a.industry || "unknown industry"}, score: ${a.score ?? "unscored"}) [id:${a.id}]`).join("\n")}`;
  }

  if (recentContacts.length > 0) {
    snapshot += `\n\n### Recent Contacts\n${recentContacts.map((c) => `- ${[c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed"} <${c.email || "no email"}> ${c.title || ""} [id:${c.id}]`).join("\n")}`;
  }

  if (recentDeals.length > 0) {
    snapshot += `\n\n### Recent Deals\n${recentDeals.map((d) => `- ${d.name} (${d.stage}, $${d.value?.toLocaleString() || "0"}) [id:${d.id}]`).join("\n")}`;
  }

  if (recentActivities.length > 0) {
    snapshot += `\n\n### Recent Activities\n${recentActivities.map((a) => `- ${a.occurredAt?.toISOString().split("T")[0] || "?"} ${a.activityType} ${a.direction || ""}: ${a.summary || "no summary"} [${a.entityType}:${a.entityId}]`).join("\n")}`;
  }

  return snapshot;
}

async function getEntityContext(contextType?: string, contextId?: string, tenantId?: string): Promise<string> {
  if (!contextType || !contextId || !tenantId) return "";
  try {
    if (contextType === "account" || contextType === "company") {
      const [company] = await db.select().from(companies).where(and(eq(companies.id, contextId), eq(companies.tenantId, tenantId))).limit(1);
      if (company) {
        const props = (company.properties || {}) as Record<string, unknown>;
        const companyContacts = await db.select().from(contacts).where(and(eq(contacts.companyId, contextId), eq(contacts.tenantId, tenantId)));
        const companyDeals = await db.select().from(deals).where(and(eq(deals.companyId, contextId), eq(deals.tenantId, tenantId)));
        const companyActivities = await db.select().from(activities).where(and(eq(activities.entityId, contextId), eq(activities.entityType, "company"), eq(activities.tenantId, tenantId))).orderBy(desc(activities.occurredAt)).limit(20);

        let ctx = `\n\n## Current Context: Account "${company.name}"
Domain: ${company.domain || "unknown"}
Industry: ${company.industry || "unknown"}
Size: ${company.size || "unknown"}
Revenue: ${company.revenue || "unknown"}
Score: ${company.score ?? "unscored"}
Description: ${company.description || "none"}`;
        if (props.technologies) ctx += `\nTechnologies: ${JSON.stringify(props.technologies)}`;
        if (props.total_funding_printed) ctx += `\nFunding: ${props.total_funding_printed}`;

        if (companyContacts.length > 0) {
          ctx += `\n\n### Contacts at ${company.name} (${companyContacts.length})\n${companyContacts.map((c) => `- ${[c.firstName, c.lastName].filter(Boolean).join(" ")} <${c.email}> ${c.title || ""}`).join("\n")}`;
        }
        if (companyDeals.length > 0) {
          ctx += `\n\n### Deals with ${company.name}\n${companyDeals.map((d) => `- ${d.name} (${d.stage}, $${d.value?.toLocaleString() || "0"})`).join("\n")}`;
        }
        if (companyActivities.length > 0) {
          ctx += `\n\n### Recent Activity\n${companyActivities.map((a) => `- ${a.occurredAt?.toISOString().split("T")[0]} ${a.activityType}: ${a.summary || ""}`).join("\n")}`;
        }
        return ctx;
      }
    }
    if (contextType === "contact") {
      const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, contextId), eq(contacts.tenantId, tenantId))).limit(1);
      if (contact) {
        const contactActivities = await db.select().from(activities).where(and(eq(activities.entityId, contextId), eq(activities.entityType, "contact"), eq(activities.tenantId, tenantId))).orderBy(desc(activities.occurredAt)).limit(20);
        const contactNotes = await db.select().from(notes).where(and(eq(notes.entityId, contextId), eq(notes.entityType, "contact"), eq(notes.tenantId, tenantId))).orderBy(desc(notes.createdAt)).limit(10);

        const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown";
        let ctx = `\n\n## Current Context: Contact "${contactName}"
Email: ${contact.email || "unknown"}
Title: ${contact.title || "unknown"}
Company ID: ${contact.companyId || "unknown"}`;

        if (contactActivities.length > 0) {
          ctx += `\n\n### Interaction History (${contactActivities.length} recent)\n${contactActivities.map((a) => `- ${a.occurredAt?.toISOString().split("T")[0]} ${a.activityType} ${a.direction || ""}: ${a.summary || ""}`).join("\n")}`;
        }
        if (contactNotes.length > 0) {
          ctx += `\n\n### Notes\n${contactNotes.map((n) => `- ${n.createdAt?.toISOString().split("T")[0]} ${n.title || ""}: ${n.content?.slice(0, 200) || ""}`).join("\n")}`;
        }
        return ctx;
      }
    }
    if (contextType === "deal") {
      const [deal] = await db.select().from(deals).where(and(eq(deals.id, contextId), eq(deals.tenantId, tenantId))).limit(1);
      if (deal) {
        const dealActivities = await db.select().from(activities).where(and(eq(activities.entityId, contextId), eq(activities.entityType, "deal"), eq(activities.tenantId, tenantId))).orderBy(desc(activities.occurredAt)).limit(20);

        let ctx = `\n\n## Current Context: Deal "${deal.name}"
Stage: ${deal.stage}
Value: ${deal.value ? "$" + deal.value.toLocaleString() : "not set"}
Summary: ${deal.summary || "none"}`;

        // Pull in related contact and account data
        if (deal.contactId) {
          const [dealContact] = await db.select().from(contacts).where(eq(contacts.id, deal.contactId)).limit(1);
          if (dealContact) {
            ctx += `\nPrimary Contact: ${[dealContact.firstName, dealContact.lastName].filter(Boolean).join(" ")} <${dealContact.email}>`;
          }
        }
        if (deal.companyId) {
          const [dealCompany] = await db.select().from(companies).where(eq(companies.id, deal.companyId)).limit(1);
          if (dealCompany) {
            ctx += `\nAccount: ${dealCompany.name} (${dealCompany.industry || "unknown"})`;
          }
        }
        if (dealActivities.length > 0) {
          ctx += `\n\n### Deal Activity\n${dealActivities.map((a) => `- ${a.occurredAt?.toISOString().split("T")[0]} ${a.activityType}: ${a.summary || ""}`).join("\n")}`;
        }
        return ctx;
      }
    }
  } catch {
    // Non-critical
  }
  return "";
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  // Rate limit: 30 messages per minute per user
  const { rateLimit, rateLimitResponse } = await import("@/lib/rate-limit");
  const rl = await rateLimit(`chat:${authCtx.userId}`, 30, 60 * 1000);
  if (!rl.success) return rateLimitResponse(rl.resetAt);

  // Plan limit enforcement: AI queries
  const planCheck = await checkPlanLimit(authCtx.tenantId, "aiQueries");
  if (!planCheck.allowed) {
    return apiError("PLAN_LIMIT_EXCEEDED",
      `AI query limit reached (${planCheck.current}/${planCheck.limit}). Upgrade your plan for more AI queries.`,
      { current: planCheck.current, limit: planCheck.limit, plan: planCheck.plan },
    );
  }

  const {
    messages,
    contextType,
    contextId,
    surface: surfaceInput,
    threadId,
  }: {
    messages: UIMessage[];
    contextType?: string;
    contextId?: string;
    surface?: SurfaceContext;
    /**
     * Optional current chat thread id. When set, every ~20 turns we
     * fire the `memory/auto-extract` Inngest event so the worker can
     * propose durable memories from recent conversation history.
     */
    threadId?: string;
  } = await req.json();

  // If the Anthropic circuit breaker is open, skip straight to OpenAI
  // instead of waiting for each request to individually time out.
  const anthropicUp =
    !!process.env.ANTHROPIC_API_KEY &&
    isCircuitClosed(ANTHROPIC_CIRCUIT.name);
  const primaryModel = anthropicUp ? anthropic("claude-sonnet-4-6") : null;
  const fallbackModel = process.env.OPENAI_API_KEY
    ? openai("gpt-4o-mini")
    : null;
  const model = primaryModel || fallbackModel || (
    // Last resort: try Anthropic even with open circuit rather than
    // returning a "no LLM" error.
    process.env.ANTHROPIC_API_KEY ? anthropic("claude-sonnet-4-6") : null
  );

  if (!model) {
    return apiError("PROVIDER_UNAVAILABLE", "Connect an LLM API key in .env.local for AI capabilities.");
  }

  // Extract last user message for RAG
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUserMessage?.parts
    ?.filter((p) => p.type === "text")
    .map((p) => ("text" in p ? p.text : ""))
    .join("") || "";

  // Load tenant settings once — used by snapshot, knowledge, and approval mode
  const tenantSettings = await getTenantSettings(authCtx.tenantId);

  // Parallel: RAG search + CRM snapshot + entity context + knowledge + approval mode
  const [ragContext, crmSnapshot, entityContext, knowledgeContext, agentApprovalMode, memoriesContext] = await Promise.all([
    (async () => {
      if (!lastUserText) return "";
      try {
        // Run context graph AND flat vector search in parallel, then merge.
        // The graph provides relationship edges (who works where, deal history);
        // the vector search provides semantically similar content (email snippets,
        // meeting notes). Both contribute to a richer context window.
        const [graphResult, vectorResults] = await Promise.all([
          searchContextGraph(lastUserText, authCtx.tenantId, 8).catch(() => null),
          (async () => {
            if (!process.env.OPENAI_API_KEY) return [];
            try {
              const results = await searchSimilar(lastUserText, 8, authCtx.tenantId);
              return results.filter((r) => r.similarity > 0.5);
            } catch { return []; }
          })(),
        ]);

        const graphContext = graphResult?.formattedContext || "";
        const vectorContext = vectorResults.length > 0 ? formatCitedSources(vectorResults) : "";

        // Merge both sources: graph edges + semantic search results
        if (graphContext && vectorContext) {
          return graphContext + vectorContext;
        }
        return graphContext || vectorContext;
      } catch (err) {
        console.warn("Context search failed:", err);
      }
      return "";
    })(),
    getCRMSnapshot(authCtx.tenantId, tenantSettings),
    getEntityContext(contextType, contextId, authCtx.tenantId),
    (async () => {
      const knowledge = (tenantSettings.knowledge || []).slice(0, 5);
      if (knowledge.length === 0) return "";
      return "\n\n## Business Knowledge (world model)\n" +
        knowledge.map((k) => `### ${k.topic}\n${k.content.slice(0, 300)}`).join("\n\n");
    })(),
    (async () => {
      return tenantSettings.agentApprovalMode || "auto";
    })(),
    // Load persistent memories for this user
    (async () => {
      try {
        // CHAT-07: include both this user's private memories AND all
        // workspace-scoped memories in the context pulled into the
        // system prompt.
        const memories = await db.select()
          .from(chatMemories)
          .where(and(
            eq(chatMemories.tenantId, authCtx.tenantId),
            or(
              eq(chatMemories.scope, "workspace"),
              and(
                eq(chatMemories.scope, "user"),
                eq(chatMemories.userId, authCtx.appUserId),
              ),
            )!,
          ))
          .orderBy(desc(chatMemories.updatedAt))
          .limit(15);
        if (memories.length === 0) return "";
        return "\n\n## Agent Memory (learned from previous conversations)\n" +
          memories.map((m) => `- [${m.category}] ${m.key}: ${m.content}`).join("\n");
      } catch {
        return "";
      }
    })(),
  ]);

  const tenantId = authCtx.tenantId;

  // FINDING-007: Set RLS tenant context so DB-level policies enforce isolation
  // even if a tool query forgets the WHERE tenantId clause.
  const { setTenantId } = await import("@/db/rls");
  await setTenantId(tenantId);

  try {
    // Back-compat: if surface isn't set explicitly, infer from contextType/Id
    const inferredSurface: SurfaceContext = surfaceInput || inferSurface(contextType, contextId);

    // Build chat tool registry + resolve capabilities for this turn
    const toolCtx: ToolContext = {
      tenantId,
      userId: authCtx.appUserId,
      authCtx,
      settings: tenantSettings,
      agentApprovalMode,
    };
    const allTools = buildAllChatTools(toolCtx);
    const resolved = resolveCapabilities(allTools, {
      role: authCtx.role,
      surface: inferredSurface,
      // allowDestructive + planTier default to safe values (false / free)
      // until CHAT-04 + billing integration land.
    });

    // ── Multi-Agent Orchestrator ──────────────────────────────
    // BEFORE the existing tool routing, run the orchestrator to
    // classify intent and route to specialist sub-agents. If the
    // orchestrator is confident (>0.8), use specialist routing with
    // a focused prompt addendum. Otherwise, fall back to the existing
    // broad tool routing via routeTools.
    const orchestratorResult = orchestrate(lastUserText, resolved.tools);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chatTools: any;
    let specialistPromptAddendum = "";

    if (orchestratorResult.routed) {
      // Orchestrator is confident — use specialist routing
      chatTools = orchestratorResult.tools;
      specialistPromptAddendum = orchestratorResult.promptAddendum;
    } else {
      // Orchestrator is not confident — fall back to existing tool routing
      // resolveCapabilities filters by role/surface; routeTools further
      // filters by the user's message intent (~40-50 tools vs 126).
      chatTools = routeTools(resolved.tools, lastUserText);
    }

    // Prompt canary: check if a versioned prompt exists for "chat".
    // If a canary version is active, it replaces the hardcoded prompt
    // for a subset of tenants (consistent hashing on tenantId).
    const canaryVersion = await getActivePromptVersion("chat", tenantId);

    // Prompt A/B experiment: check if an active experiment exists for "chat".
    // If so, and the tenant is assigned to the variant arm, apply the
    // prompt delta on top of the base prompt. Non-blocking — failures
    // silently fall back to the base prompt.
    let experimentAssignment: { experimentId: string; variant: "base" | "variant"; delta: string | null } | null = null;
    try {
      experimentAssignment = await getChatExperimentDelta(tenantId);
    } catch {
      // Non-critical — experiment lookup failures should never block chat
    }

    let systemPrompt = canaryVersion
      ? canaryVersion.content + resolved.surfacePromptAddendum + specialistPromptAddendum
      : buildChatSystemPrompt({
          crmSnapshot,
          ragContext,
          entityContext,
          knowledgeContext,
          memoriesContext,
          agentApprovalMode,
          userName: tenantSettings.onboardingCompanyName || undefined,
          preferredLanguage: tenantSettings.language || undefined,
        }) + resolved.surfacePromptAddendum + specialistPromptAddendum;

    // Apply experiment variant delta if this tenant is in the variant arm
    if (experimentAssignment?.delta) {
      systemPrompt = applyPromptDelta(systemPrompt, experimentAssignment.delta);
    }

    // ── Context Management: compact long conversations ──
    const compactedMessages = await compactMessages(messages);
    const convertedMessages = await convertToModelMessages(compactedMessages);

    // CHAT-07: fire auto-extract every ~20 turns on a thread. Fire-and-
    // forget — the chat response doesn't wait on it. The worker dedupes
    // via (tenant, scope, key) existence checks so re-firing is safe.
    if (threadId && messages.length > 0 && messages.length % 20 === 0) {
      void (async () => {
        try {
          const { inngest } = await import("@/inngest/client");
          await inngest.send({
            name: "memory/auto-extract",
            data: { tenantId, userId: authCtx.appUserId, threadId },
          });
        } catch (err) {
          console.warn("chat: memory/auto-extract emit failed (non-fatal)", err);
        }
      })();
    }

    try {
      // Track AI query usage (fire-and-forget)
      void trackUsage(authCtx.tenantId, "ai_query").catch(() => {});

      const result = await tracedStreamText({
        model,
        system: systemPrompt,
        messages: convertedMessages,
        tools: chatTools,
        // @ts-ignore maxTokens exists in AI SDK but type definition may lag
        maxTokens: 2000,
        temperature: 0.4,
        stopWhen: stepCountIs(10),
        providerOptions: {
          anthropic: {
            thinking: { type: "enabled", budgetTokens: 16000 },
            cacheControl: { type: "ephemeral" },
          },
        },
        _trace: {
          agentId: "chat",
          tenantId,
          inputPreview: lastUserText.slice(0, 300),
          surfaceType: inferredSurface.type,
          allowedToolCount: Object.keys(chatTools).length,
          droppedToolCount: resolved.droppedTools.length,
          orchestratorRouted: orchestratorResult.routed,
          orchestratorSpecialists: orchestratorResult.decision.specialists.join(",") || "none",
          orchestratorConfidence: orchestratorResult.decision.confidence,
          ...(canaryVersion ? {
            promptVersion: canaryVersion.version,
            promptIsCanary: canaryVersion.isCanary,
          } : {}),
          ...(experimentAssignment ? {
            experimentId: experimentAssignment.experimentId,
            experimentVariant: experimentAssignment.variant,
          } : {}),
        },
      });

      // Record experiment metric (fire-and-forget, non-blocking)
      if (experimentAssignment) {
        void recordExperimentMetric(
          tenantId,
          experimentAssignment.experimentId,
          experimentAssignment.variant,
          "eval_score",
          1.0, // Successful response — the online eval sampler will update with real score
        ).catch(() => {});
      }

      return result.toTextStreamResponse();
    } catch (err) {
      if (model === primaryModel && fallbackModel) {
        console.warn("Primary model failed, falling back to OpenAI:", err);
        const result = await tracedStreamText({
          model: fallbackModel,
          system: systemPrompt,
          messages: convertedMessages,
          tools: chatTools,
          stopWhen: stepCountIs(10),
          _trace: {
            agentId: "chat",
            tenantId,
            inputPreview: lastUserText.slice(0, 300),
            surfaceType: inferredSurface.type,
            allowedToolCount: Object.keys(chatTools).length,
          },
        });
        return result.toTextStreamResponse();
      }
      return apiError("PROVIDER_UNAVAILABLE", "AI service temporarily unavailable. Please try again."
      );
    }
  } finally {
    await clearTenantId();
  }
}
