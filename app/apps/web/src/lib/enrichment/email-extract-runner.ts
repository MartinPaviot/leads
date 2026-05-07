/**
 * Orchestrator that extracts structured signals from an email activity and
 * persists them onto the activity + cascades to contact/deal/company.
 *
 * Entry points:
 *   - extractAndPersist(activityId, tenantId)    — one-off
 *   - extractAndPersistBatch(tenantId, limit)    — replay for old activities
 *
 * Runs under Haiku by default for cost (~$0.0003/email). Fall back to
 * Sonnet only if the user has a specific accuracy need (not the default).
 */

import { db } from "@/db";
import { activities, contacts, deals } from "@/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import { getTenantKnowledge } from "@/lib/knowledge/get-tenant-knowledge";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import {
  buildEmailExtractionPrompt,
  deriveActivityIntent,
  deriveContactAttrsFromExtraction,
  deriveDealAttrsFromExtraction,
  emailExtractionSchema,
  looksAutomated,
  type EmailExtraction,
} from "./email-extract";

function getExtractionModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-haiku-4-5-20251001");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

type ActivityRow = typeof activities.$inferSelect;

export interface ExtractionOutcome {
  activityId: string;
  status: "skipped_not_email" | "skipped_automated" | "skipped_no_body" | "skipped_no_model" | "extracted" | "error";
  extraction?: EmailExtraction;
  reason?: string;
}

/**
 * Extract + persist for a single activity. Idempotent: if an extraction
 * already exists in metadata.llmExtraction, it is skipped unless force=true.
 */
export async function extractAndPersistForActivity(
  activityId: string,
  tenantId: string,
  opts: { force?: boolean; competitorList?: string[] } = {},
): Promise<ExtractionOutcome> {
  const [activity] = await db
    .select()
    .from(activities)
    .where(and(eq(activities.id, activityId), eq(activities.tenantId, tenantId)))
    .limit(1);

  if (!activity) {
    return { activityId, status: "error", reason: "activity_not_found" };
  }
  if (activity.activityType !== "email_sent" && activity.activityType !== "email_received") {
    return { activityId, status: "skipped_not_email" };
  }
  if (!activity.rawContent || activity.rawContent.trim().length < 20) {
    return { activityId, status: "skipped_no_body" };
  }

  const meta = (activity.metadata || {}) as Record<string, unknown>;
  if (!opts.force && meta.llmExtraction) {
    return {
      activityId,
      status: "extracted",
      extraction: meta.llmExtraction as EmailExtraction,
      reason: "already_extracted",
    };
  }

  const subject = String(meta.subject || "");
  const fromHeader = String(meta.from || "");
  if (looksAutomated({ subject, fromHeader })) {
    // Persist the "automated" flag so we don't rerun.
    await db
      .update(activities)
      .set({
        metadata: {
          ...meta,
          llmExtraction: { skipped: "automated", detectedAt: new Date().toISOString() },
        },
      })
      .where(and(eq(activities.id, activityId), eq(activities.tenantId, tenantId)));
    return { activityId, status: "skipped_automated" };
  }

  const model = getExtractionModel();
  if (!model) return { activityId, status: "skipped_no_model" };

  const prompt = buildEmailExtractionPrompt({
    subject,
    fromHeader,
    direction: (activity.direction as "inbound" | "outbound") || "inbound",
    body: activity.rawContent,
    competitorList: opts.competitorList,
  });

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: emailExtractionSchema,
      prompt,
      _trace: { agentId: "email-extract", tenantId },
    });
    const extraction = object as EmailExtraction;

    // Persist onto the activity row.
    await db
      .update(activities)
      .set({
        sentiment: extraction.sentiment,
        intent: deriveActivityIntent(extraction),
        metadata: {
          ...meta,
          llmExtraction: {
            ...extraction,
            extractedAt: new Date().toISOString(),
            modelId: (model as unknown as { modelId?: string }).modelId || "unknown",
          },
        },
      })
      .where(and(eq(activities.id, activityId), eq(activities.tenantId, tenantId)));

    // Cascade high-confidence signals to the linked entity.
    if (
      extraction.sentimentConfidence === "high" ||
      extraction.sentimentConfidence === "medium"
    ) {
      await cascadeToEntity(activity, extraction, tenantId);
    }

    return { activityId, status: "extracted", extraction };
  } catch (err) {
    return {
      activityId,
      status: "error",
      reason: err instanceof Error ? err.message : "unknown_error",
    };
  }
}

async function cascadeToEntity(
  activity: ActivityRow,
  extraction: EmailExtraction,
  tenantId: string,
): Promise<void> {
  if (activity.entityType === "contact") {
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, activity.entityId), eq(contacts.tenantId, tenantId)))
      .limit(1);
    if (!contact) return;

    const props = (contact.properties || {}) as Record<string, unknown>;
    const derived = deriveContactAttrsFromExtraction(props, extraction);

    await db
      .update(contacts)
      .set({
        properties: { ...props, ...derived },
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.id, contact.id), eq(contacts.tenantId, tenantId)));
  } else if (activity.entityType === "deal") {
    const [deal] = await db
      .select()
      .from(deals)
      .where(and(eq(deals.id, activity.entityId), eq(deals.tenantId, tenantId)))
      .limit(1);
    if (!deal) return;

    const props = (deal.properties || {}) as Record<string, unknown>;
    const derived = deriveDealAttrsFromExtraction(props, extraction);

    await db
      .update(deals)
      .set({
        properties: { ...props, ...derived },
        updatedAt: new Date(),
      })
      .where(and(eq(deals.id, deal.id), eq(deals.tenantId, tenantId)));
  }
}

/**
 * Extract for a batch of activities that haven't been extracted yet.
 * Used for backfill after enabling the feature.
 */
export async function extractAndPersistBatch(
  tenantId: string,
  limit = 50,
  opts: { competitorList?: string[] } = {},
): Promise<ExtractionOutcome[]> {
  const rows = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        or(
          eq(activities.activityType, "email_sent"),
          eq(activities.activityType, "email_received"),
        ),
        or(
          isNull(activities.sentiment),
          // Re-extract only when no metadata.llmExtraction is set; SQL JSON
          // operators vary so we filter in memory below.
        ),
      ),
    )
    .limit(limit * 2);

  const pending = rows.filter((r) => {
    const meta = (r.metadata || {}) as Record<string, unknown>;
    return !meta.llmExtraction;
  });

  const outcomes: ExtractionOutcome[] = [];
  for (const row of pending.slice(0, limit)) {
    outcomes.push(
      await extractAndPersistForActivity(row.id, tenantId, {
        competitorList: opts.competitorList,
      }),
    );
  }
  return outcomes;
}

/**
 * Load known competitor names for a tenant from its knowledge-base settings.
 * Returns an empty list if not configured.
 */
export async function loadCompetitorList(tenantId: string): Promise<string[]> {
  const knowledge = await getTenantKnowledge(tenantId);
  const competitorEntries = knowledge.filter(
    (e) => typeof e.topic === "string" && /competitor|competitive|competition/i.test(e.topic || ""),
  );
  const names = new Set<string>();
  for (const entry of competitorEntries) {
    const body = String(entry.content || "");
    // Extract lines that look like names (Title Case, 1-4 words)
    for (const line of body.split(/[\n,;]/)) {
      const trimmed = line.trim().replace(/^[-*•]\s*/, "");
      if (!trimmed) continue;
      if (/^[A-Z][A-Za-z0-9 .&'-]{1,40}$/.test(trimmed) && trimmed.split(/\s+/).length <= 4) {
        names.add(trimmed);
      }
    }
  }
  return Array.from(names);
}
