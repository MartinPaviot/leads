/**
 * Email Thread Intelligence — extracts structured buying signals
 * from email conversations. Runs on every synced email thread.
 *
 * Extracts:
 * - Buying signals: budget mentioned, timeline discussed, decision maker involved
 * - Competitor mentions: names of competing products/companies
 * - Sentiment shift: thread going positive/negative over time
 * - Objections raised: pricing, timing, feature gaps, security
 * - Next steps mentioned: demo requests, proposal requests, intro requests
 * - Urgency indicators: "by end of quarter", "board meeting next week"
 *
 * Philosophy: runs per-thread (not per-email) so it can detect sentiment
 * *trends* and accumulate signals across the full conversation arc.
 * Uses Claude Haiku for cost (~$0.001/thread). Idempotent — re-running
 * on the same thread replaces the previous intelligence.
 */

import { z } from "zod";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { getModelForTask } from "@/lib/ai/ai-provider";
import { truncateForLLM } from "@/lib/enrichment/email-extract";
import { getTenantKnowledge, type TenantKnowledgeEntry } from "@/lib/knowledge/get-tenant-knowledge";
import type { TenantSettings } from "@/lib/config/tenant-settings";

// ── Public Types ──────────────────────────────────────────────

export interface ThreadIntelligence {
  threadId: string;
  signals: BuyingSignal[];
  competitors: string[];
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  sentimentTrend: "improving" | "stable" | "declining";
  objections: Objection[];
  nextSteps: string[];
  urgencyLevel: "high" | "medium" | "low" | "none";
  extractedAt: string;
}

export interface BuyingSignal {
  type: "budget" | "timeline" | "authority" | "need" | "champion" | "expansion";
  evidence: string; // quote from email
  confidence: number; // 0-1
}

export interface Objection {
  category: "pricing" | "timing" | "features" | "security" | "competition" | "internal";
  summary: string;
  status: "raised" | "addressed" | "unresolved";
}

// ── Zod Schema for LLM extraction ────────────────────────────

const buyingSignalSchema = z.object({
  type: z.enum(["budget", "timeline", "authority", "need", "champion", "expansion"]),
  evidence: z.string().describe("Direct quote or close paraphrase from the email thread"),
  confidence: z.number().min(0).max(1).describe("How confident you are this is a real signal"),
});

const objectionSchema = z.object({
  category: z.enum(["pricing", "timing", "features", "security", "competition", "internal"]),
  summary: z.string().describe("One-sentence summary of the objection"),
  status: z.enum(["raised", "addressed", "unresolved"])
    .describe("raised = just mentioned, addressed = a response was given, unresolved = still open at end of thread"),
});

const threadIntelligenceSchema = z.object({
  signals: z.array(buyingSignalSchema)
    .describe("Buying signals detected across the thread. Only include signals with clear evidence."),
  competitors: z.array(z.string())
    .describe("Names of competing products or companies mentioned. Empty array if none."),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"])
    .describe("Overall sentiment of the prospect across the entire thread"),
  sentimentTrend: z.enum(["improving", "stable", "declining"])
    .describe("How sentiment changed from the beginning to the end of the thread"),
  objections: z.array(objectionSchema)
    .describe("Objections raised during the conversation"),
  nextSteps: z.array(z.string())
    .describe("Concrete next steps mentioned (demo request, proposal, intro, etc.)"),
  urgencyLevel: z.enum(["high", "medium", "low", "none"])
    .describe("high = explicit deadline or time pressure, medium = general interest in moving forward, low = exploring, none = no urgency detected"),
});

// ── Email type expected by the extractor ─────────────────────

export interface ThreadEmail {
  from: string;
  to: string[];
  subject: string;
  body: string;
  direction: "inbound" | "outbound";
  date: Date | string;
}

// ── Main extraction function ─────────────────────────────────

/**
 * Extract structured intelligence from an email thread.
 *
 * @param emails - Emails in the thread, sorted chronologically (oldest first)
 * @param tenantSettings - Tenant settings for context (product description, competitors, etc.)
 * @returns ThreadIntelligence object, or null if extraction failed or was skipped
 */
export async function extractThreadIntelligence(
  threadId: string,
  emails: ThreadEmail[],
  tenantSettings: Pick<TenantSettings, "productDescription">,
  tenantId?: string,
): Promise<ThreadIntelligence | null> {
  if (emails.length === 0) return null;

  const model = getModelForTask("lightweight");
  if (!model) return null;

  // Skip threads with only outbound emails (no prospect signal)
  const hasInbound = emails.some((e) => e.direction === "inbound");
  if (!hasInbound && emails.length <= 1) return null;

  // Build the thread transcript for the LLM
  const transcript = emails.map((e, i) => {
    const dateStr = e.date instanceof Date
      ? e.date.toISOString().split("T")[0]
      : new Date(e.date).toISOString().split("T")[0];
    const dir = e.direction === "inbound" ? "PROSPECT" : "US";
    const body = truncateForLLM(e.body, 1500);
    return `[${i + 1}] ${dateStr} | ${dir} | From: ${e.from}\nSubject: ${e.subject}\n${body}`;
  }).join("\n\n---\n\n");

  // Extract known competitor names from tenant knowledge base
  const knowledge = tenantId ? await getTenantKnowledge(tenantId) : [];
  const competitorHint = extractCompetitorHint(knowledge);
  const productHint = tenantSettings.productDescription
    ? `\nOur product: ${tenantSettings.productDescription}`
    : "";

  const prompt = `You are analyzing an email thread between a sales team and a prospect to extract structured buying intelligence.
${productHint}${competitorHint}

THREAD (${emails.length} emails, oldest first):

${truncateForLLM(transcript, 8000)}

RULES:
- Only extract signals with clear evidence from the emails. Never invent or hallucinate.
- For buying signals, include a direct quote or close paraphrase as evidence.
- Sentiment should reflect the PROSPECT's attitude, not ours.
- Sentiment trend: compare the tone of early emails to late emails.
- Objection status: "addressed" means someone responded to it, "unresolved" means it was raised but the thread ends without resolution.
- Next steps: only include concrete, actionable items mentioned in the thread (not generic "follow up").
- Urgency: "high" requires explicit time pressure (deadline, board meeting, contract expiry). Don't infer urgency from politeness.
- Competitors: only named products/companies, not generic terms like "current solution".`;

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: threadIntelligenceSchema,
      prompt,
      _trace: {
        agentId: "email-thread-intelligence",
        inputPreview: `Thread intelligence for ${emails.length} emails in thread ${threadId}`,
      },
    });

    return {
      threadId,
      signals: object.signals,
      competitors: object.competitors,
      sentiment: object.sentiment,
      sentimentTrend: object.sentimentTrend,
      objections: object.objections,
      nextSteps: object.nextSteps,
      urgencyLevel: object.urgencyLevel,
      extractedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`Thread intelligence extraction failed for ${threadId}:`, err);
    return null;
  }
}

// ── Persistence helpers ──────────────────────────────────────

/**
 * Load all emails in a thread from the activities table, sorted chronologically.
 */
export async function loadThreadEmails(
  tenantId: string,
  threadId: string,
): Promise<ThreadEmail[]> {
  const rows = await db
    .select({
      summary: activities.summary,
      rawContent: activities.rawContent,
      direction: activities.direction,
      occurredAt: activities.occurredAt,
      metadata: activities.metadata,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.threadId, threadId),
      ),
    )
    .orderBy(asc(activities.occurredAt));

  return rows
    .filter((r) => r.rawContent && r.rawContent.trim().length > 10)
    .map((r) => {
      const meta = (r.metadata || {}) as Record<string, unknown>;
      return {
        from: String(meta.from || "unknown"),
        to: Array.isArray(meta.to) ? meta.to.map(String) : [],
        subject: r.summary || "",
        body: r.rawContent || "",
        direction: (r.direction as "inbound" | "outbound") || "inbound",
        date: r.occurredAt || new Date(),
      };
    });
}

/**
 * Persist thread intelligence into activity metadata for the most recent
 * email in the thread. Also stores a copy on each activity's metadata
 * under `threadIntelligence` for easy lookup from any activity.
 */
export async function persistThreadIntelligence(
  tenantId: string,
  threadId: string,
  intelligence: ThreadIntelligence,
): Promise<void> {
  // Fetch all activities in this thread
  const threadActivities = await db
    .select({ id: activities.id, metadata: activities.metadata })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.threadId, threadId),
      ),
    );

  // Update each activity's metadata with the thread intelligence
  for (const act of threadActivities) {
    const meta = (act.metadata || {}) as Record<string, unknown>;
    await db
      .update(activities)
      .set({
        metadata: {
          ...meta,
          threadIntelligence: intelligence,
        },
      })
      .where(eq(activities.id, act.id));
  }
}

/**
 * Full pipeline: load thread emails, extract intelligence, persist.
 * Idempotent — safe to call multiple times on the same thread.
 */
export async function extractAndPersistThreadIntelligence(
  tenantId: string,
  threadId: string,
  tenantSettings: Pick<TenantSettings, "productDescription">,
): Promise<ThreadIntelligence | null> {
  const emails = await loadThreadEmails(tenantId, threadId);
  if (emails.length < 2) return null; // Need at least 2 emails for a meaningful thread

  const intelligence = await extractThreadIntelligence(threadId, emails, tenantSettings, tenantId);
  if (!intelligence) return null;

  await persistThreadIntelligence(tenantId, threadId, intelligence);
  return intelligence;
}

// ── Helpers ──────────────────────────────────────────────────

function extractCompetitorHint(
  knowledge: TenantKnowledgeEntry[],
): string {
  const competitorEntries = knowledge.filter(
    (e) =>
      typeof e.topic === "string" &&
      /competitor|competitive|competition/i.test(e.topic || ""),
  );
  const names = new Set<string>();
  for (const entry of competitorEntries) {
    const body = String(entry.content || "");
    for (const line of body.split(/[\n,;]/)) {
      const trimmed = line.trim().replace(/^[-*]\s*/, "");
      if (
        trimmed &&
        /^[A-Z][A-Za-z0-9 .&'-]{1,40}$/.test(trimmed) &&
        trimmed.split(/\s+/).length <= 4
      ) {
        names.add(trimmed);
      }
    }
  }
  if (names.size === 0) return "";
  return `\nKnown competitors to watch for: ${[...names].join(", ")}`;
}
