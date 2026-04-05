import { getAuthContext } from "@/lib/auth-utils";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { UIMessage, convertToModelMessages, tool, stepCountIs } from "ai";
import { tracedStreamText } from "@/lib/traced-ai";
import { searchSimilar } from "@/lib/embeddings";
import { searchContextGraph, exploreGraphAroundEntity } from "@/lib/context-graph";
import { db } from "@/db";
import { companies, contacts, deals, activities, notes, tenants, tasks, chatMemories } from "@/db/schema";
import { and, eq, desc, sql, ilike, or } from "drizzle-orm";
import { z } from "zod";
import type { CustomFieldDef, PipelineStageDef } from "@/lib/custom-fields";
import { getTenantSettings, type TenantSettings } from "@/lib/tenant-settings";
// JSONValue type for tool generics
type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

export const maxDuration = 60;

// ── Tool Search: dynamically select tools based on query ──────────────
const CORE_TOOLS = ["searchCRM", "queryContacts", "queryAccounts", "queryDeals", "queryActivities", "queryNotes"] as const;

const TOOL_TRIGGERS: Record<string, RegExp> = {
  createContact: /create|add|new\s+contact|ajouter.*contact/i,
  createAccount: /create|add|new\s+(account|company)|ajouter.*(compte|entreprise)/i,
  createDeal: /create|add|new\s+(deal|opportunity)|ajouter.*(deal|opportunit)/i,
  createTask: /remind|task|follow.?up|todo|rappel|tâche/i,
  updateDealStage: /move|progress|stage|won|lost|advance|déplacer|gagn|perdu/i,
  draftEmail: /email|draft|write\s+to|reach\s+out|follow\s+up|écrire|envoyer|relancer/i,
  getDealCoaching: /coach|advice|help.*deal|strategy|conseil|stratégie|comment.*deal/i,
  getAccountIntelligence: /why.*account|intelligence|analysis|score.*breakdown|pourquoi.*compte/i,
  completeTask: /complete|done|finish|mark.*done|terminé|fini/i,
  bulkUpdateDeals: /bulk|all\s+deals|move\s+all|tous\s+les\s+deals/i,
  bulkUpdateContacts: /bulk|all\s+contacts|update\s+all|tous\s+les\s+contacts/i,
  generateMeetingPrep: /meeting|prep|briefing|prepare|réunion|préparer/i,
  rememberContext: /remember|save|note.*later|retenir|souvenir/i,
  recallMemories: /recall|what.*remember|memories|rappeler|mémoire/i,
  queryTasks: /task|todo|due|pending|tâche|à\s+faire/i,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function selectToolsForQuery(query: string, allTools: Record<string, any>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selected: Record<string, any> = {};

  // Always include core tools
  for (const name of CORE_TOOLS) {
    if (allTools[name]) selected[name] = allTools[name];
  }

  // Add triggered tools based on query
  for (const [toolName, pattern] of Object.entries(TOOL_TRIGGERS)) {
    if (pattern.test(query) && allTools[toolName]) {
      selected[toolName] = allTools[toolName];
    }
  }

  return selected;
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

  const { messages, contextType, contextId }: { messages: UIMessage[]; contextType?: string; contextId?: string } = await req.json();

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
        const graphResult = await searchContextGraph(lastUserText, authCtx.tenantId, 15);
        if (graphResult.formattedContext) return graphResult.formattedContext;

        // Fallback to flat vector search if graph is empty
        if (process.env.OPENAI_API_KEY) {
          const results = await searchSimilar(lastUserText, 8, authCtx.tenantId);
          if (results.length > 0) {
            const relevant = results.filter((r) => r.similarity > 0.25);
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
      const knowledge = tenantSettings.knowledge || [];
      if (knowledge.length === 0) return "";
      return "\n\n## Business Knowledge (world model)\n" +
        knowledge.map((k) => `### ${k.topic}\n${k.content}`).join("\n\n");
    })(),
    (async () => {
      return tenantSettings.agentApprovalMode || "auto";
    })(),
    // Load persistent memories for this user
    (async () => {
      try {
        const memories = await db.select()
          .from(chatMemories)
          .where(and(
            eq(chatMemories.tenantId, authCtx.tenantId),
            eq(chatMemories.userId, authCtx.appUserId),
          ))
          .orderBy(desc(chatMemories.updatedAt))
          .limit(20);
        if (memories.length === 0) return "";
        return "\n\n## Agent Memory (learned from previous conversations)\n" +
          memories.map((m) => `- [${m.category}] ${m.key}: ${m.content}`).join("\n");
      } catch {
        return "";
      }
    })(),
  ]);

  const tenantId = authCtx.tenantId;

  const systemPrompt = `<role>
You are LeadSens, an autonomous GTM copilot for early-stage founders doing founder-led sales. You have direct, real-time access to the user's CRM data through tools. You are not a generic chatbot — you are their sales teammate who knows every account, deal, and interaction.
</role>

<capabilities>
- Query accounts, contacts, deals, activities, notes, and tasks with real-time CRM data
- Search the CRM semantically using vector embeddings
- Create and update records: contacts, accounts, deals, tasks, deal stages
- Provide deal coaching grounded in specific data points, dates, and interactions
- Draft personalized emails from real interaction history
- Generate meeting prep briefings with full account context
- Perform bulk operations on deals and contacts
- Track follow-ups and flag risks based on activity gaps
</capabilities>

<instructions>
- ALWAYS use real data from tools. Never fabricate company names, contact details, or statistics.
- If data is missing or incomplete, say so honestly. Never hallucinate details.
- When the CRM is empty, guide the user to populate it (import CSV, connect Gmail, or build TAM).
- For records visible in the snapshot below, answer directly. For deeper queries, use searchCRM or the specific query tools.
- For timing questions ("when did I last…", "how long since…"), use queryActivities for exact dates.
- For notes or written observations, use queryNotes.
</instructions>

<pronoun_resolution>
Maintain strong conversational context across turns. When the user uses pronouns like "their", "them", "it", "this", "that company", "his deals", etc., resolve them to the most recently discussed entity.
Examples:
- User: "Show me contacts at Meridian Labs" → You show contacts → User: "What about their deals?" → "their" = Meridian Labs
- User: "Tell me about Sarah Chen" → You describe Sarah → User: "Send her an email" → "her" = Sarah Chen
- User: "How is the Acme deal going?" → You describe deal → User: "Move it to proposal" → "it" = the Acme deal
If the referent is ambiguous, ask for clarification rather than guessing wrong.
</pronoun_resolution>

<hallucination_safety>
CRITICAL: Never invent or assume data that was not returned by a tool.
- If a search returns no results, say "I couldn't find [entity] in your CRM" — do NOT fabricate a response about a non-existent record.
- If querying for "John Smith" and the tool returns empty results, respond: "I couldn't find anyone named John Smith in your CRM. They may not have been added yet, or the name might be recorded differently."
- Search across ALL relevant entity types before concluding something doesn't exist (contacts, accounts, deals, notes).
- NEVER fill in missing fields with plausible-sounding data. If an email is unknown, say "email not on file" — do not guess.

Dangerous operations — ALWAYS refuse:
- "Delete all my contacts/accounts/deals" → "I'm not able to delete records — that's not a capability I have."
- "Drop/clear/wipe/reset my CRM" → Same refusal.
- Bulk destructive operations → Refuse and explain.
You can only CREATE and UPDATE records, never delete.
</hallucination_safety>

<response_format>
When presenting structured CRM data, ALWAYS use markdown tables instead of bullet lists or prose. Tables make data scannable and professional.

Use tables for:
- Contact lists: | Name | Title | Email |
- Deal/opportunity lists: | Deal | Account | Stage | Value | Last Activity |
- Account lists: | Account | Industry | Contacts | Score |
- Activity logs: | Date | Type | Contact | Summary |
- Risk analysis: | Deal | Stage | Value | Days Silent | Risk | Next Step |
- Task lists: | Task | Due | Related To | Priority |
- Any query returning 2+ records with structured fields

Include entity links inside table cells: e.g. [Sarah Chen](/contacts/abc-123) renders as a clickable badge.

For single-entity detail, use a vertical "Field | Value" table:
| Field | Details |
|-------|---------|
| Name | [Sarah Chen](/contacts/abc-123) |
| Title | CTO |
| Email | sarah@meridianlabs.io |

Keep tables concise — max 8-10 rows. If more, show top results and state the total count.
For simple factual answers (counts, yes/no, single values), use plain text — no table needed.
</response_format>

<language>
Always respond in the same language as the user's message. If the user writes in French, respond entirely in French. If in Spanish, respond in Spanish. This applies to all content including greetings, explanations, deal analysis, and action descriptions. Only keep entity names (company names, contact names, deal names) in their original form. Format dates and numbers according to the user's locale.
</language>

<investigate_before_answering>
Never speculate about data you have not queried. If the user asks about a specific account, contact, or deal, you MUST use a tool to fetch current data before answering. The CRM snapshot only shows the 10 most recent records — it is NOT exhaustive. Query the relevant tool BEFORE making any claim. Give grounded, hallucination-free answers.
</investigate_before_answering>

<default_to_action>
By default, take action rather than suggesting. If the user says "follow up with Sarah", draft the email AND offer to create a task — do not just describe what they could do. If intent is ambiguous, infer the most useful action and proceed, using tools to discover missing details instead of guessing.
</default_to_action>

<use_parallel_tool_calls>
If you need multiple independent pieces of data, fetch them all in parallel. For example, when preparing a meeting briefing, query the account, contacts, deals, and activities simultaneously. When researching a deal, fetch deal coaching data and account intelligence in one round. Maximize parallel tool calls to reduce latency. Only sequence calls when one depends on another's result.
</use_parallel_tool_calls>

<citation_rules>
Every factual claim about a CRM record MUST include a clickable link. No link = no claim.

Link formats:
- Contacts: [Name](/contacts/{id})
- Accounts: [Name](/accounts/{id}?d={domain}) — include ?d={domain} when you know the domain so the UI can show the company logo
- Deals: [Name](/opportunities/{id})

Source citations for interactions:
- Emails: "In the email from {date} — *{subject}* ([source](/contacts/{id}))"
- Meetings: "During the {date} meeting ([source](/accounts/{id}))"
- Notes: "From the note *{title}* ([source](/contacts/{id}))"
- Tool results: always use the _sourceLink field returned by tools to build links

Example: "According to your last email with [Sarah Chen](/contacts/abc-123) on March 15, she mentioned a budget of $50K for Q2."
</citation_rules>

<email_citation>
When referencing specific email content from queryActivities results, ALWAYS quote the exact text with the sender and date. Use this format:

**[Contact name] on [Month Day]:** "[exact quote from the email body]"

Example:
**Sarah Chen on March 12:** "We're very interested in the enterprise plan. Can you send pricing for 50 seats?"

This grounds your response in real data and builds trust. Never paraphrase when you can quote directly. If the email body is available in the activity result, prefer quoting it over summarizing.
</email_citation>

<coaching_behavior>
When coaching on a deal or account:
1. Use getDealCoaching or getAccountIntelligence to get ALL data — do not rely on the snapshot alone
2. Reference SPECIFIC interactions, dates, and data points — never give generic advice
3. Calculate activity gaps (days since last contact) and flag risks: >7 days = medium, >14 days = high
4. Suggest concrete next steps with actual contact names, titles, and realistic timelines
5. For "why this account": reference the score breakdown (fit reasons, engagement reasons, signals like funding, tech stack, size)
</coaching_behavior>

<examples>
<example>
<user>How is the Meridian Labs deal going?</user>
<approach>
1. queryDeals with search "Meridian Labs" to find the deal ID
2. getDealCoaching with that deal ID for full context (contact, company, activities, risk level)
3. Cite specific dates: "Your last interaction was on [date] — [activity summary]"
4. Flag risk if activity gap > 7 days
5. Suggest concrete next step with the specific contact name
</approach>
</example>

<example>
<user>Draft a follow-up for Sarah Chen</user>
<approach>
1. queryContacts with search "Sarah Chen" to get her ID and context
2. draftEmail with contactId and purpose "follow-up"
3. Write the actual personalized email referencing their recent interaction
4. Offer: "Want me to also create a follow-up task for next week?"
</approach>
</example>

<example>
<user>Which deals are at risk?</user>
<approach>
1. queryDeals to get all active deals
2. queryActivities for each deal to check last interaction date
3. Flag deals with >7 days inactivity (medium) or >14 days (high)
4. Return a prioritized table: Deal | Stage | Value | Days Silent | Risk | Suggested Action
</approach>
</example>

<example>
<user>Prepare me for my meeting with Acme Corp</user>
<approach>
1. queryAccounts with search "Acme Corp" to find the account ID
2. generateMeetingPrep with accountId (fetches company, contacts, deals, activities, signals in parallel)
3. Structure the briefing: key talking points, relationship history, open deals, potential objections, suggested agenda
</approach>
</example>
</examples>
${agentApprovalMode === "ask" ? `
<approval_mode>
Approval mode is ON. When the user asks to create or update a CRM record, call the create/update tool immediately.
The tool will return a proposal card that the user can review, edit fields, and approve or dismiss in the UI.
You do NOT need to ask for text confirmation — the UI handles approval. Just call the tool and explain what you proposed.

Sequential workflows: When a user message starts with "[Approved:" it means a record was just created via the UI.
- Parse the entity type, name, and ID from the message
- If there are related records to create (e.g., "Add John at Acme" → account approved → now propose the contact), call the create tool with the correct link (companyId for contacts, contactId for deals, etc.)
- Always link new records to the just-created parent using the ID from the approval message
- Example: "[Approved: account "Acme Corp" created with id abc-123...]" → call createContact with companyId="abc-123"
</approval_mode>
` : ""}
<crm_context>
${crmSnapshot}${ragContext}${entityContext}${knowledgeContext}${memoriesContext}
</crm_context>`;

  // Define tools for the chat to interact with CRM
  const searchCRMSchema = z.object({
    query: z.string().describe("Natural language search query"),
    limit: z.number().optional().describe("Max results (default 10)"),
  });
  const queryContactsSchema = z.object({
    search: z.string().optional().describe("Search by name or email"),
    limit: z.number().optional().describe("Max results (default 20)"),
  });
  const queryAccountsSchema = z.object({
    search: z.string().optional().describe("Search by name or domain"),
    limit: z.number().optional().describe("Max results (default 20)"),
  });
  const queryDealsSchema = z.object({
    stage: z.string().optional().describe("Filter by stage: lead, qualification, demo, trial, proposal, negotiation, won, lost"),
    search: z.string().optional().describe("Search by deal name"),
    limit: z.number().optional().describe("Max results (default 20)"),
  });
  const queryActivitiesSchema = z.object({
    entityType: z.string().optional().describe("Filter by entity type: contact, company, deal"),
    entityId: z.string().optional().describe("Filter by specific entity ID"),
    activityType: z.string().optional().describe("Filter by type: email_sent, email_received, meeting_completed, etc."),
    limit: z.number().optional().describe("Max results (default 20)"),
  });
  const createContactSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    title: z.string().optional(),
    phone: z.string().optional(),
    companyId: z.string().optional().describe("Link to an existing account by ID"),
  });
  const createAccountSchema = z.object({
    name: z.string(),
    domain: z.string().optional(),
    industry: z.string().optional(),
  });
  const createDealSchema = z.object({
    name: z.string(),
    stage: z.enum(["lead", "qualification", "demo", "trial", "proposal", "negotiation"]).optional(),
    value: z.number().optional(),
    companyId: z.string().optional(),
    contactId: z.string().optional(),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeTool<I>(opts: {
    description: string;
    inputSchema: z.ZodType<I>;
    execute: (input: I) => Promise<any>;
  }) {
    return tool<I, any>({
      description: opts.description,
      inputSchema: opts.inputSchema,
      execute: opts.execute,
    } as any);
  }

  const chatTools = {
    searchCRM: makeTool({
      description: `Search the CRM database semantically using vector embeddings. Use when looking for specific records by name, attribute, or topic that may not be in the snapshot.
Examples: query="Sarah Chen" finds contacts named Sarah Chen. query="deals over 50K" finds high-value deals. query="companies using React" finds companies with React in their tech stack. query="recent meetings about pricing" finds meeting activities discussing pricing.`,
      inputSchema: searchCRMSchema,
      execute: async (input) => {
        if (!process.env.OPENAI_API_KEY) return { results: [] as any[], error: "Search unavailable" };
        const results = await searchSimilar(input.query, input.limit ?? 10, tenantId);
        return { results: results.filter((r) => r.similarity > 0.2) };
      },
    }),
    queryContacts: makeTool({
      description: `Query contacts with optional text search by name or email. Use when user asks to find, list, or filter contacts. Examples: search="Sarah" finds all contacts named Sarah. search="acme.com" finds contacts with acme.com emails. Omit search to list recent contacts.`,
      inputSchema: queryContactsSchema,
      execute: async (input) => {
        const results = await db
          .select()
          .from(contacts)
          .where(
            input.search
              ? and(
                  eq(contacts.tenantId, tenantId),
                  or(
                    ilike(contacts.firstName, `%${input.search}%`),
                    ilike(contacts.lastName, `%${input.search}%`),
                    ilike(contacts.email, `%${input.search}%`)
                  )
                )
              : eq(contacts.tenantId, tenantId)
          )
          .orderBy(desc(contacts.createdAt))
          .limit(input.limit ?? 20);
        return { contacts: results.map((c) => ({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" "), email: c.email, title: c.title, companyId: c.companyId })) };
      },
    }),
    queryAccounts: makeTool({
      description: `Query accounts/companies with optional text search by name or domain. Examples: search="Meridian" finds Meridian Labs. search="fintech" finds fintech companies. Omit search to list recent accounts.`,
      inputSchema: queryAccountsSchema,
      execute: async (input) => {
        const results = await db
          .select()
          .from(companies)
          .where(
            input.search
              ? and(
                  eq(companies.tenantId, tenantId),
                  or(
                    ilike(companies.name, `%${input.search}%`),
                    ilike(companies.domain, `%${input.search}%`)
                  )
                )
              : eq(companies.tenantId, tenantId)
          )
          .orderBy(desc(companies.createdAt))
          .limit(input.limit ?? 20);
        return { accounts: results.map((a) => ({ id: a.id, name: a.name, domain: a.domain, industry: a.industry, score: a.score, size: a.size, revenue: a.revenue })) };
      },
    }),
    queryDeals: makeTool({
      description: `Query deals/opportunities with optional filters by stage or name. Examples: stage="proposal" lists all deals in proposal stage. search="Acme" finds the Acme deal. Omit both to list all active deals.`,
      inputSchema: queryDealsSchema,
      execute: async (input) => {
        const conditions = [eq(deals.tenantId, tenantId)];
        if (input.stage) conditions.push(eq(deals.stage, input.stage as any));
        if (input.search) conditions.push(ilike(deals.name, `%${input.search}%`));
        const results = await db
          .select()
          .from(deals)
          .where(and(...conditions))
          .orderBy(desc(deals.createdAt))
          .limit(input.limit ?? 20);
        return { deals: results.map((d) => ({ id: d.id, name: d.name, stage: d.stage, value: d.value, companyId: d.companyId, contactId: d.contactId, expectedCloseDate: d.expectedCloseDate })) };
      },
    }),
    queryActivities: makeTool({
      description: `Query recent activities (emails, meetings, calls, notes) for a specific contact, account, deal, or all. Use for: "when did I last talk to X", "what happened with Y", follow-up gaps, interaction history. Returns full email bodies and metadata for citation. Examples: entityType="contact" + entityId="abc" gets all interactions with that contact. activityType="email_received" filters to received emails only.`,
      inputSchema: queryActivitiesSchema,
      execute: async (input) => {
        const conditions = [eq(activities.tenantId, tenantId)];
        if (input.entityType) conditions.push(eq(activities.entityType, input.entityType));
        if (input.entityId) conditions.push(eq(activities.entityId, input.entityId));
        if (input.activityType) conditions.push(eq(activities.activityType, input.activityType as any));
        const results = await db
          .select()
          .from(activities)
          .where(and(...conditions))
          .orderBy(desc(activities.occurredAt))
          .limit(input.limit ?? 20);
        return {
          activities: results.map((a) => {
            const meta = (a.metadata || {}) as Record<string, unknown>;
            return {
              id: a.id,
              type: a.activityType,
              summary: a.summary,
              direction: a.direction,
              channel: a.channel,
              occurredAt: a.occurredAt,
              entityType: a.entityType,
              entityId: a.entityId,
              // Include email body for citation
              emailBody: meta.body ? (meta.body as string).slice(0, 2000) : undefined,
              // Include full email body for citation (from rawContent, now contains full body)
              body: a.rawContent ? a.rawContent.slice(0, 2000) : undefined,
              emailFrom: meta.from,
              emailTo: meta.to,
              // Include structured notes for meetings
              structuredNotes: meta.structuredNotes,
              // Source link for citation
              _sourceLink: a.entityType === "contact"
                ? `/contacts/${a.entityId}`
                : a.entityType === "company"
                  ? `/accounts/${a.entityId}`
                  : a.entityType === "deal"
                    ? `/opportunities/${a.entityId}`
                    : undefined,
            };
          }),
        };
      },
    }),
    queryNotes: makeTool({
      description: "Query notes for a contact, account, deal, or all notes. Use when the user asks about notes, observations, or written context. Returns full note content for citation.",
      inputSchema: z.object({
        entityType: z.string().optional().describe("Filter by entity type: contact, company, deal"),
        entityId: z.string().optional().describe("Filter by specific entity ID"),
        search: z.string().optional().describe("Search by note title or content"),
        limit: z.number().optional().describe("Max results (default 20)"),
      }),
      execute: async (input) => {
        const conditions = [eq(notes.tenantId, tenantId)];
        if (input.entityType) conditions.push(eq(notes.entityType, input.entityType));
        if (input.entityId) conditions.push(eq(notes.entityId, input.entityId));
        if (input.search) conditions.push(or(
          ilike(notes.title, `%${input.search}%`),
          ilike(notes.content, `%${input.search}%`),
        )!);
        const results = await db
          .select()
          .from(notes)
          .where(and(...conditions))
          .orderBy(desc(notes.createdAt))
          .limit(input.limit ?? 20);
        return {
          notes: results.map((n) => ({
            id: n.id,
            title: n.title,
            content: n.content,
            entityType: n.entityType,
            entityId: n.entityId,
            createdAt: n.createdAt,
            _sourceLink: n.entityType === "contact"
              ? `/contacts/${n.entityId}`
              : n.entityType === "company"
                ? `/accounts/${n.entityId}`
                : n.entityType === "deal"
                  ? `/opportunities/${n.entityId}`
                  : undefined,
          })),
        };
      },
    }),
    createContact: makeTool({
      description: agentApprovalMode === "ask"
        ? "Propose creating a new contact. Returns a proposal card that the user must approve before the record is created."
        : "Create a new contact in the CRM. Use when the user asks to add a contact.",
      inputSchema: createContactSchema,
      execute: async (input) => {
        if (agentApprovalMode === "ask") {
          return { proposal: true, action: "createContact", entityType: "contact", entityName: [input.firstName, input.lastName].filter(Boolean).join(" ") || "New Contact", fields: input };
        }
        const [created] = await db
          .insert(contacts)
          .values({ tenantId, ...input })
          .returning();
        return { created: { id: created.id, name: [created.firstName, created.lastName].filter(Boolean).join(" "), email: created.email } };
      },
    }),
    createAccount: makeTool({
      description: agentApprovalMode === "ask"
        ? "Propose creating a new account. Returns a proposal card that the user must approve before the record is created."
        : "Create a new account/company in the CRM.",
      inputSchema: createAccountSchema,
      execute: async (input) => {
        if (agentApprovalMode === "ask") {
          return { proposal: true, action: "createAccount", entityType: "account", entityName: input.name || "New Account", fields: input };
        }
        const [created] = await db
          .insert(companies)
          .values({ tenantId, ...input })
          .returning();
        return { created: { id: created.id, name: created.name, domain: created.domain } };
      },
    }),
    createDeal: makeTool({
      description: agentApprovalMode === "ask"
        ? "Propose creating a new deal. Returns a proposal card that the user must approve before the record is created."
        : "Create a new deal/opportunity in the CRM.",
      inputSchema: createDealSchema,
      execute: async (input) => {
        if (agentApprovalMode === "ask") {
          return { proposal: true, action: "createDeal", entityType: "deal", entityName: input.name || "New Deal", fields: input };
        }
        const [created] = await db
          .insert(deals)
          .values({ tenantId, stage: input.stage ?? "lead", name: input.name, value: input.value, companyId: input.companyId, contactId: input.contactId })
          .returning();
        return { created: { id: created.id, name: created.name, stage: created.stage, value: created.value } };
      },
    }),
    getDealCoaching: makeTool({
      description: "Get comprehensive deal context for coaching. Use when user asks for advice on a deal, 'what should I do about X deal', 'help with X opportunity', coaching, or deal strategy.",
      inputSchema: z.object({
        dealId: z.string().describe("The deal/opportunity ID"),
      }),
      execute: async (input) => {
        const [deal] = await db.select().from(deals).where(and(eq(deals.id, input.dealId), eq(deals.tenantId, tenantId))).limit(1);
        if (!deal) return { error: "Deal not found" };

        // Get related contact, company, and all activities
        const [relatedContact, relatedCompany, dealActivities] = await Promise.all([
          deal.contactId ? db.select().from(contacts).where(eq(contacts.id, deal.contactId)).limit(1).then((r) => r[0] || null) : null,
          deal.companyId ? db.select().from(companies).where(eq(companies.id, deal.companyId)).limit(1).then((r) => r[0] || null) : null,
          db.select().from(activities).where(and(eq(activities.tenantId, tenantId), or(
            and(eq(activities.entityType, "deal"), eq(activities.entityId, input.dealId)),
            ...(deal.contactId ? [and(eq(activities.entityType, "contact"), eq(activities.entityId, deal.contactId))] : []),
          ))).orderBy(desc(activities.occurredAt)).limit(30),
        ]);

        const lastActivity = dealActivities[0];
        const daysSinceLastActivity = lastActivity?.occurredAt
          ? Math.floor((Date.now() - new Date(lastActivity.occurredAt).getTime()) / 86400000)
          : null;

        return {
          deal: { id: deal.id, name: deal.name, stage: deal.stage, value: deal.value, summary: deal.summary, expectedCloseDate: deal.expectedCloseDate },
          contact: relatedContact ? { id: relatedContact.id, name: [relatedContact.firstName, relatedContact.lastName].filter(Boolean).join(" "), email: relatedContact.email, title: relatedContact.title } : null,
          company: relatedCompany ? { id: relatedCompany.id, name: relatedCompany.name, industry: relatedCompany.industry, score: relatedCompany.score, properties: relatedCompany.properties } : null,
          recentActivities: dealActivities.map((a) => ({ type: a.activityType, summary: a.summary, date: a.occurredAt, direction: a.direction })),
          daysSinceLastActivity,
          riskLevel: daysSinceLastActivity && daysSinceLastActivity > 14 ? "high" : daysSinceLastActivity && daysSinceLastActivity > 7 ? "medium" : "low",
        };
      },
    }),
    getAccountIntelligence: makeTool({
      description: "Get detailed account intelligence including score breakdown, signals, contacts, and activity summary. Use for 'why this account', account analysis, or account strategy questions.",
      inputSchema: z.object({
        accountId: z.string().describe("The account/company ID"),
      }),
      execute: async (input) => {
        const [company] = await db.select().from(companies).where(and(eq(companies.id, input.accountId), eq(companies.tenantId, tenantId))).limit(1);
        if (!company) return { error: "Account not found" };

        const props = (company.properties || {}) as Record<string, unknown>;
        const [companyContacts, companyDeals, recentActivity] = await Promise.all([
          db.select().from(contacts).where(and(eq(contacts.companyId, input.accountId), eq(contacts.tenantId, tenantId))),
          db.select().from(deals).where(and(eq(deals.companyId, input.accountId), eq(deals.tenantId, tenantId))),
          db.select().from(activities).where(and(eq(activities.tenantId, tenantId), eq(activities.entityType, "company"), eq(activities.entityId, input.accountId))).orderBy(desc(activities.occurredAt)).limit(10),
        ]);

        return {
          account: { id: company.id, name: company.name, domain: company.domain, industry: company.industry, score: company.score, size: company.size, revenue: company.revenue, description: company.description },
          scoreBreakdown: {
            grade: props.score_grade,
            fit: props.score_fit,
            engagement: props.score_engagement,
            fitReasons: props.score_fit_reasons,
            engagementReasons: props.score_engagement_reasons,
          },
          signals: {
            technologies: props.technologies,
            funding: props.total_funding_printed,
            fundingStage: props.latest_funding_stage,
            foundedYear: props.founded_year,
            location: [props.city, props.state, props.country].filter(Boolean).join(", "),
          },
          contacts: companyContacts.map((c) => ({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" "), title: c.title, email: c.email })),
          deals: companyDeals.map((d) => ({ id: d.id, name: d.name, stage: d.stage, value: d.value })),
          recentActivity: recentActivity.map((a) => ({ type: a.activityType, summary: a.summary, date: a.occurredAt })),
        };
      },
    }),

    // === S7: NEW AGENT ACTION TOOLS ===

    createTask: makeTool({
      description: "Create a task in the CRM. Use when the user asks to create a follow-up, reminder, todo, or task. Link it to a contact, account, or deal.",
      inputSchema: z.object({
        title: z.string().describe("Task title"),
        description: z.string().optional().describe("Task description/details"),
        dueDate: z.string().optional().describe("Due date in ISO format (YYYY-MM-DD)"),
        priority: z.enum(["low", "medium", "high"]).optional(),
        entityType: z.string().optional().describe("Link to entity type: contact, company, deal"),
        entityId: z.string().optional().describe("ID of the linked entity"),
      }),
      execute: async (input) => {
        const [created] = await db.insert(tasks).values({
          tenantId,
          assigneeId: authCtx.appUserId,
          title: input.title,
          description: input.description,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          priority: input.priority || "medium",
          entityType: input.entityType,
          entityId: input.entityId,
          status: "pending",
        }).returning();
        return { created: { id: created.id, title: created.title, dueDate: created.dueDate, status: created.status } };
      },
    }),

    updateDealStage: makeTool({
      description: "Move a deal to a different pipeline stage. Use when the user says 'move deal X to proposal', 'progress this deal', 'mark as won/lost', etc.",
      inputSchema: z.object({
        dealId: z.string().describe("The deal ID to update"),
        newStage: z.string().describe("The new stage name (e.g. qualification, demo, proposal, won, lost)"),
      }),
      execute: async (input) => {
        const [deal] = await db.select().from(deals)
          .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, tenantId))).limit(1);
        if (!deal) return { error: "Deal not found" };

        const oldStage = deal.stage;
        await db.update(deals).set({
          stage: input.newStage as any,
          updatedAt: new Date(),
        }).where(and(eq(deals.id, input.dealId), eq(deals.tenantId, tenantId)));

        // Log the stage change as an activity
        await db.insert(activities).values({
          tenantId,
          actorType: "user",
          actorId: authCtx.appUserId,
          entityType: "deal",
          entityId: input.dealId,
          activityType: input.newStage === "won" ? "deal_won" : input.newStage === "lost" ? "deal_lost" : "deal_stage_changed",
          channel: "system",
          direction: "internal",
          summary: `Stage changed from ${oldStage} to ${input.newStage}`,
          metadata: { oldStage, newStage: input.newStage },
        });

        return { updated: { id: deal.id, name: deal.name, oldStage, newStage: input.newStage } };
      },
    }),

    draftEmail: makeTool({
      description: "Draft a personalized email to a contact. Returns the email content for the user to review and send via the email composer. Use when the user asks to 'email', 'draft', 'write to', 'follow up with', or 'reach out to' someone.",
      inputSchema: z.object({
        contactId: z.string().describe("Contact ID to email"),
        purpose: z.string().describe("Purpose of the email: follow-up, introduction, revival, meeting-request, custom"),
        customInstructions: z.string().optional().describe("Any specific instructions from the user about what to include"),
      }),
      execute: async (input) => {
        const [contact] = await db.select().from(contacts)
          .where(and(eq(contacts.id, input.contactId), eq(contacts.tenantId, tenantId))).limit(1);
        if (!contact) return { error: "Contact not found" };

        // Get recent interactions for personalization
        const recentInteractions = await db.select().from(activities)
          .where(and(eq(activities.tenantId, tenantId), eq(activities.entityType, "contact"), eq(activities.entityId, input.contactId)))
          .orderBy(desc(activities.occurredAt)).limit(5);

        const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
        let company = null;
        if (contact.companyId) {
          const [c] = await db.select().from(companies).where(eq(companies.id, contact.companyId)).limit(1);
          company = c;
        }

        // Fetch writing samples for style matching
        const { getWritingSamples, buildWritingStylePrompt } = await import("@/lib/writing-profile");
        const samples = await getWritingSamples(tenantId);
        const stylePrompt = buildWritingStylePrompt(samples);

        return {
          emailDraft: {
            to: contact.email,
            contactName,
            company: company?.name,
            purpose: input.purpose,
            recentInteractions: recentInteractions.map((a) => ({
              type: a.activityType,
              summary: a.summary,
              date: a.occurredAt,
            })),
          },
          instruction: `Use this context to generate a personalized email. Include specifics from recent interactions. Keep it concise and actionable.${stylePrompt ? `\n\n${stylePrompt}` : ""}\n\nReturn the draft in your response.`,
        };
      },
    }),

    queryTasks: makeTool({
      description: "Query tasks with optional filters. Use when user asks about their tasks, to-dos, follow-ups, or what's due.",
      inputSchema: z.object({
        status: z.string().optional().describe("Filter by status: pending, completed, cancelled"),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        limit: z.number().optional(),
      }),
      execute: async (input) => {
        const conditions = [eq(tasks.tenantId, tenantId)];
        if (input.status) conditions.push(eq(tasks.status, input.status));
        if (input.entityType) conditions.push(eq(tasks.entityType, input.entityType));
        if (input.entityId) conditions.push(eq(tasks.entityId, input.entityId));
        const results = await db.select().from(tasks)
          .where(and(...conditions))
          .orderBy(desc(tasks.dueDate))
          .limit(input.limit ?? 20);
        return {
          tasks: results.map((t) => ({
            id: t.id, title: t.title, status: t.status, priority: t.priority,
            dueDate: t.dueDate, entityType: t.entityType, entityId: t.entityId,
          })),
        };
      },
    }),

    completeTask: makeTool({
      description: "Mark a task as completed. Use when user says 'done', 'complete task', 'mark as finished'.",
      inputSchema: z.object({
        taskId: z.string().describe("Task ID to mark as completed"),
      }),
      execute: async (input) => {
        const [updated] = await db.update(tasks).set({
          status: "completed",
          updatedAt: new Date(),
        }).where(and(eq(tasks.id, input.taskId), eq(tasks.tenantId, tenantId)))
          .returning();
        if (!updated) return { error: "Task not found" };
        return { completed: { id: updated.id, title: updated.title } };
      },
    }),

    bulkUpdateDeals: makeTool({
      description: "Bulk update multiple deals at once. Use when user says 'reassign all deals', 'move all X deals to Y stage', 'tag all deals with', or any bulk deal operation.",
      inputSchema: z.object({
        filter: z.object({
          stage: z.string().optional().describe("Filter deals by current stage"),
          search: z.string().optional().describe("Filter deals by name search"),
        }).describe("Filter to select which deals to update"),
        update: z.object({
          stage: z.string().optional().describe("New stage to set"),
          assigneeId: z.string().optional().describe("New assignee user ID"),
        }).describe("Fields to update on matched deals"),
      }),
      execute: async (input) => {
        const conditions = [eq(deals.tenantId, tenantId)];
        if (input.filter.stage) conditions.push(eq(deals.stage, input.filter.stage as any));
        if (input.filter.search) conditions.push(ilike(deals.name, `%${input.filter.search}%`));

        const matchedDeals = await db.select({ id: deals.id, name: deals.name, stage: deals.stage })
          .from(deals)
          .where(and(...conditions));

        if (matchedDeals.length === 0) return { bulkUpdated: { count: 0 }, message: "No deals matched the filter" };

        const updateFields: Record<string, unknown> = { updatedAt: new Date() };
        if (input.update.stage) updateFields.stage = input.update.stage;

        await db.update(deals)
          .set(updateFields as any)
          .where(and(...conditions));

        // Log activity for each updated deal
        for (const deal of matchedDeals) {
          await db.insert(activities).values({
            tenantId,
            actorType: "user",
            actorId: authCtx.appUserId,
            entityType: "deal",
            entityId: deal.id,
            activityType: "deal_stage_changed",
            channel: "system",
            direction: "internal",
            summary: `Bulk update: ${Object.entries(input.update).map(([k, v]) => `${k}→${v}`).join(", ")}`,
            metadata: { bulkOperation: true, filter: input.filter, update: input.update },
          });
        }

        return {
          bulkUpdated: { count: matchedDeals.length, deals: matchedDeals.map((d) => ({ id: d.id, name: d.name })) },
        };
      },
    }),

    bulkUpdateContacts: makeTool({
      description: "Bulk update multiple contacts. Use when user says 'tag all contacts at X', 'update all contacts with', or any bulk contact operation.",
      inputSchema: z.object({
        filter: z.object({
          companyId: z.string().optional().describe("Filter by company ID"),
          search: z.string().optional().describe("Filter by name/email search"),
        }).describe("Filter to select which contacts to update"),
        update: z.object({
          title: z.string().optional(),
          companyId: z.string().optional(),
        }).describe("Fields to update on matched contacts"),
      }),
      execute: async (input) => {
        const conditions = [eq(contacts.tenantId, tenantId)];
        if (input.filter.companyId) conditions.push(eq(contacts.companyId, input.filter.companyId));
        if (input.filter.search) conditions.push(or(
          ilike(contacts.firstName, `%${input.filter.search}%`),
          ilike(contacts.lastName, `%${input.filter.search}%`),
          ilike(contacts.email, `%${input.filter.search}%`),
        )!);

        const matchedContacts = await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
          .from(contacts)
          .where(and(...conditions));

        if (matchedContacts.length === 0) return { bulkUpdated: { count: 0 }, message: "No contacts matched the filter" };

        const updateFields: Record<string, unknown> = { updatedAt: new Date() };
        if (input.update.title) updateFields.title = input.update.title;
        if (input.update.companyId) updateFields.companyId = input.update.companyId;

        await db.update(contacts)
          .set(updateFields as any)
          .where(and(...conditions));

        return {
          bulkUpdated: {
            count: matchedContacts.length,
            contacts: matchedContacts.map((c) => ({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" ") })),
          },
        };
      },
    }),

    exploreGraph: makeTool({
      description: "Explore the context graph around an entity. Returns connected entities and facts (relationships, interactions, temporal history). Use when user asks 'what do we know about X', 'show me connections for Y', 'graph for Z', or 'context around X'.",
      inputSchema: z.object({
        entityName: z.string().describe("Name of the entity to explore (person, company, topic)"),
        depth: z.number().optional().describe("How many hops to traverse (default 2, max 3)"),
      }),
      execute: async (input) => {
        const result = await exploreGraphAroundEntity(
          input.entityName,
          tenantId,
          Math.min(input.depth || 2, 3),
        );
        if (result.nodes.length === 0) return { message: `No entity found matching "${input.entityName}" in the context graph` };
        return {
          entities: result.nodes.map(n => ({ name: n.name, type: n.type, summary: n.summary })),
          facts: result.edges.map(e => ({
            from: result.nodes.find(n => n.id === e.source)?.name,
            to: result.nodes.find(n => n.id === e.target)?.name,
            relation: e.relation,
            fact: e.fact,
            valid: e.valid,
          })),
          graphUrl: `/graph`,
        };
      },
    }),

    rememberContext: makeTool({
      description: `Save a piece of information to persistent memory for future conversations. Use when the user shares a preference, makes a decision, or reveals context that should be remembered across sessions. Examples: key="communication_style" content="User prefers concise bullet points". key="deal_strategy_acme" content="User wants to push for enterprise plan, avoid discounts".`,
      inputSchema: z.object({
        key: z.string().describe("Short identifier for this memory (e.g. communication_style, deal_strategy_acme)"),
        content: z.string().describe("The information to remember"),
        category: z.enum(["user_preference", "decision", "learned_context", "relationship_note"]).optional(),
      }),
      execute: async (input) => {
        // Upsert: update if key exists for this user, otherwise create
        const existing = await db.select().from(chatMemories)
          .where(and(
            eq(chatMemories.tenantId, tenantId),
            eq(chatMemories.userId, authCtx.appUserId),
            eq(chatMemories.key, input.key),
          )).limit(1);

        if (existing.length > 0) {
          await db.update(chatMemories).set({
            content: input.content,
            category: input.category || existing[0].category,
            updatedAt: new Date(),
          }).where(eq(chatMemories.id, existing[0].id));
          return { remembered: true, action: "updated", key: input.key };
        }

        await db.insert(chatMemories).values({
          tenantId,
          userId: authCtx.appUserId,
          key: input.key,
          content: input.content,
          category: input.category || "learned_context",
        });
        return { remembered: true, action: "created", key: input.key };
      },
    }),

    recallMemories: makeTool({
      description: `Retrieve all saved memories for the current user. Use at the start of complex tasks to check what you already know about the user's preferences and past decisions.`,
      inputSchema: z.object({
        category: z.string().optional().describe("Filter by category: user_preference, decision, learned_context, relationship_note"),
      }),
      execute: async (input) => {
        const conditions = [
          eq(chatMemories.tenantId, tenantId),
          eq(chatMemories.userId, authCtx.appUserId),
        ];
        if (input.category) conditions.push(eq(chatMemories.category, input.category));
        const memories = await db.select().from(chatMemories)
          .where(and(...conditions))
          .orderBy(desc(chatMemories.updatedAt))
          .limit(30);
        return {
          memories: memories.map((m) => ({
            key: m.key,
            content: m.content,
            category: m.category,
            updatedAt: m.updatedAt,
          })),
        };
      },
    }),

    generateMeetingPrep: makeTool({
      description: "Generate a meeting preparation briefing for an account or contact. Use when user asks to 'prepare for meeting with X', 'briefing for X', or 'meeting prep'.",
      inputSchema: z.object({
        accountId: z.string().optional().describe("Account ID to prepare for"),
        contactId: z.string().optional().describe("Contact ID to prepare for"),
      }),
      execute: async (input) => {
        const data: Record<string, unknown> = {};

        if (input.accountId) {
          const [company] = await db.select().from(companies)
            .where(and(eq(companies.id, input.accountId), eq(companies.tenantId, tenantId))).limit(1);
          if (company) {
            data.account = { name: company.name, industry: company.industry, size: company.size, revenue: company.revenue, description: company.description, score: company.score };
            const props = (company.properties || {}) as Record<string, unknown>;
            data.signals = { technologies: props.technologies, funding: props.total_funding_printed, foundedYear: props.founded_year };

            const companyContacts = await db.select().from(contacts)
              .where(and(eq(contacts.companyId, input.accountId), eq(contacts.tenantId, tenantId)));
            data.contacts = companyContacts.map((c) => ({ name: [c.firstName, c.lastName].filter(Boolean).join(" "), title: c.title, email: c.email }));

            const companyDeals = await db.select().from(deals)
              .where(and(eq(deals.companyId, input.accountId), eq(deals.tenantId, tenantId)));
            data.deals = companyDeals.map((d) => ({ name: d.name, stage: d.stage, value: d.value }));

            const recentActivity = await db.select().from(activities)
              .where(and(eq(activities.tenantId, tenantId), eq(activities.entityType, "company"), eq(activities.entityId, input.accountId)))
              .orderBy(desc(activities.occurredAt)).limit(15);
            data.recentActivity = recentActivity.map((a) => ({ type: a.activityType, summary: a.summary, date: a.occurredAt, direction: a.direction }));
          }
        }

        if (input.contactId) {
          const [contact] = await db.select().from(contacts)
            .where(and(eq(contacts.id, input.contactId), eq(contacts.tenantId, tenantId))).limit(1);
          if (contact) {
            data.contact = { name: [contact.firstName, contact.lastName].filter(Boolean).join(" "), title: contact.title, email: contact.email };
            const contactActivity = await db.select().from(activities)
              .where(and(eq(activities.tenantId, tenantId), eq(activities.entityType, "contact"), eq(activities.entityId, input.contactId)))
              .orderBy(desc(activities.occurredAt)).limit(15);
            data.interactionHistory = contactActivity.map((a) => ({ type: a.activityType, summary: a.summary, date: a.occurredAt }));
          }
        }

        return { meetingPrepData: data, instruction: "Generate a comprehensive meeting prep briefing from this data. Include: key talking points, potential objections, relationship history, and suggested agenda items." };
      },
    }),
    getMeetingNotes: makeTool({
      description: `Get structured meeting notes (summary, key points, action items, buying signals, decisions) for a specific company or contact. Use when the user asks about a past meeting, what was discussed, action items from a call, or meeting outcomes.
Examples: "What did we discuss with Acme last call?" "What were the action items from the meeting with Sarah?" "What objections did they raise?"`,
      inputSchema: z.object({
        companyName: z.string().optional().describe("Company name to search meetings for"),
        contactName: z.string().optional().describe("Contact name to search meetings for"),
        limit: z.number().optional().describe("Max meetings to return (default 5)"),
      }),
      execute: async (input) => {
        // Find meetings with notes for the given company or contact
        let meetingActivities = await db
          .select()
          .from(activities)
          .where(
            and(
              eq(activities.tenantId, tenantId),
              eq(activities.channel, "meeting"),
              sql`metadata->>'structuredNotes' IS NOT NULL`
            )
          )
          .orderBy(desc(activities.occurredAt))
          .limit(input.limit ?? 5);

        // Filter by company or contact name if provided
        if (input.companyName || input.contactName) {
          const searchTerm = (input.companyName || input.contactName || "").toLowerCase();
          meetingActivities = meetingActivities.filter((a) => {
            const meta = (a.metadata || {}) as any;
            const attendees = meta.attendees || [];
            const matchesAttendee = attendees.some((att: any) =>
              (att.displayName || att.email || "").toLowerCase().includes(searchTerm)
            );
            const matchesSummary = (a.summary || "").toLowerCase().includes(searchTerm);
            return matchesAttendee || matchesSummary;
          });
        }

        return {
          meetings: meetingActivities.map((a) => {
            const meta = (a.metadata || {}) as any;
            return {
              id: a.id,
              title: a.summary,
              date: meta.startTime || a.occurredAt,
              notes: meta.structuredNotes,
              attendees: (meta.attendees || []).map((att: any) => att.displayName || att.email),
              followUpDraft: meta.followUpEmailDraft || null,
            };
          }),
        };
      },
    }),
  };

  // ── Tool Search: only pass relevant tools to reduce token usage ──
  const selectedTools = selectToolsForQuery(lastUserText, chatTools);
  const toolCount = Object.keys(selectedTools).length;
  const totalToolCount = Object.keys(chatTools).length;
  console.log(`[ToolSearch] Query: "${lastUserText.slice(0, 60)}…" → ${toolCount}/${totalToolCount} tools selected`);

  // ── Context Management: compact long conversations ──
  const compactedMessages = compactMessages(messages);
  const convertedMessages = await convertToModelMessages(compactedMessages);

  try {
    const result = tracedStreamText({
      model,
      system: systemPrompt,
      messages: convertedMessages,
      tools: selectedTools,
      stopWhen: stepCountIs(10),
      providerOptions: {
        anthropic: {
          thinking: { type: "enabled", budgetTokens: 8000 },
          cacheControl: { type: "ephemeral" },
        },
      },
      _trace: { agentId: "chat", tenantId, inputPreview: lastUserText.slice(0, 300) },
    });
    return result.toTextStreamResponse();
  } catch (err) {
    if (model === primaryModel && fallbackModel) {
      console.warn("Primary model failed, falling back to OpenAI:", err);
      const result = tracedStreamText({
        model: fallbackModel,
        system: systemPrompt,
        messages: convertedMessages,
        tools: selectedTools,
        stopWhen: stepCountIs(10),
        _trace: { agentId: "chat", tenantId, inputPreview: lastUserText.slice(0, 300) },
      });
      return result.toTextStreamResponse();
    }
    return Response.json(
      { error: "AI service temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }
}
