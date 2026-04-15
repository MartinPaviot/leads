import { getAuthContext } from "@/lib/auth-utils";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { UIMessage, convertToModelMessages, stepCountIs } from "ai";
import { tracedStreamText } from "@/lib/traced-ai";
import { searchSimilar } from "@/lib/embeddings";
import { searchContextGraph } from "@/lib/context-graph";
import { db } from "@/db";
import { companies, contacts, deals, activities, notes, chatMemories } from "@/db/schema";
import { and, eq, desc, sql, or } from "drizzle-orm";
import { getTenantSettings, type TenantSettings } from "@/lib/tenant-settings";
import { buildChatSystemPrompt } from "@/lib/prompts/chat-system-prompt";
import { buildAllChatTools, type ToolContext } from "@/lib/chat/tools";
import { resolveCapabilities, type SurfaceContext } from "@/lib/agents/capability-resolver";
import { assertAiQueryHeadroom } from "@/lib/pricing/enforce";
import { QuotaExceededError } from "@/lib/pricing/quota";
import { quotaExceededResponse } from "@/lib/pricing/http";
import { trackUsage } from "@/lib/billing";

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

// ── Context Management: compact long conversations ──────────────
function compactMessages(messages: UIMessage[], maxMessages: number = 30): UIMessage[] {
  if (messages.length <= maxMessages) return messages;

  // Keep the first message (for context) and the most recent messages
  const keepRecent = Math.floor(maxMessages * 0.8);
  const older = messages.slice(1, messages.length - keepRecent);
  const recent = messages.slice(messages.length - keepRecent);

  // Summarize older messages into a single system-like user message
  const olderTexts = older
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const text = m.parts
        ?.filter((p) => p.type === "text")
        .map((p) => ("text" in p ? p.text : ""))
        .join("") || "";
      return `[${m.role}]: ${text.slice(0, 200)}`;
    })
    .join("\n");

  const summaryMessage: UIMessage = {
    id: "context-summary",
    role: "user" as const,
    parts: [{
      type: "text" as const,
      text: `[CONTEXT SUMMARY - Earlier in this conversation, we discussed:\n${olderTexts}\n...End of summary. Continue from here.]`,
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
  if (settings.targetRoles) contextParts.push(`Target buyer roles: ${settings.targetRoles}`);
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
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 30 messages per minute per user
  const { rateLimit, rateLimitResponse } = await import("@/lib/rate-limit");
  const rl = rateLimit(`chat:${authCtx.userId}`, 30, 60 * 1000);
  if (!rl.success) return rateLimitResponse(rl.resetAt);

  // Tenant AI-query quota (pre-flight, before any streaming starts — we want
  // to fail fast with 402 rather than mid-stream, which the client can't
  // recover from gracefully).
  try {
    await assertAiQueryHeadroom(authCtx.tenantId);
  } catch (e) {
    if (e instanceof QuotaExceededError) return quotaExceededResponse(e);
    throw e;
  }
  // Record the billable query up front. Tracked regardless of the enforcement
  // flag so usage stats remain accurate during the banner-only rollout.
  trackUsage(authCtx.tenantId, "ai_query", 1).catch((err) => {
    console.warn("trackUsage(ai_query) failed", err);
  });

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

  const primaryModel = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : null;
  const fallbackModel = process.env.OPENAI_API_KEY
    ? openai("gpt-4o-mini")
    : null;
  const model = primaryModel || fallbackModel;

  if (!model) {
    return new Response(
      "Connect an LLM API key in .env.local for AI capabilities.",
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
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
        // Try context graph first (hybrid: vector + graph traversal)
        const graphResult = await searchContextGraph(lastUserText, authCtx.tenantId, 8);
        if (graphResult.formattedContext) return graphResult.formattedContext;

        // Fallback to flat vector search if graph is empty
        if (process.env.OPENAI_API_KEY) {
          const results = await searchSimilar(lastUserText, 8, authCtx.tenantId);
          if (results.length > 0) {
            const relevant = results.filter((r) => r.similarity > 0.5);
            if (relevant.length > 0) {
              return formatCitedSources(relevant);
            }
          }
        }
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
  const chatTools = resolved.tools;

  const systemPrompt =
    buildChatSystemPrompt({
      crmSnapshot,
      ragContext,
      entityContext,
      knowledgeContext,
      memoriesContext,
      agentApprovalMode,
      userName: tenantSettings.onboardingCompanyName || undefined,
      preferredLanguage: tenantSettings.language || undefined,
    }) + resolved.surfacePromptAddendum;

  // ── Context Management: compact long conversations ──
  const compactedMessages = compactMessages(messages);
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
    const result = await tracedStreamText({
      model,
      system: systemPrompt,
      messages: convertedMessages,
      tools: chatTools,
      // @ts-expect-error maxTokens exists in AI SDK but type definition may lag
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
      },
    });
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
    return Response.json(
      { error: "AI service temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }
}
