/**
 * Deal Briefing Engine (C1)
 *
 * Produces structured briefs for one or all open deals. Each brief
 * includes: summary, key discussions, promises made, objections raised,
 * stall reason, and recommended next action.
 *
 * The briefing pulls from 4 sources:
 * 1. Deal + contact + company metadata (existing schema)
 * 2. Activity timeline with bodies (email + meeting + call + note)
 * 3. Context graph edges (OBJECTED_TO, REQUESTED, DISCUSSED)
 * 4. Enrichment signals (from enrichment-email-extract pipeline)
 */

import { db } from "@/db";
import {
  deals,
  companies,
  contacts,
  activities,
  contextGraphEdges,
  contextGraphNodes,
} from "@/db/schema";
import { and, desc, eq, isNull, notInArray, or, inArray } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { openai } from "@ai-sdk/openai";
import { llmCall } from "@/lib/ai/llm-call";
import { ageInStage } from "./deal-helpers";
import { dealBriefSchema, type DealBrief } from "./deal-briefing-schema";
import {
  buildDealBriefPrompt,
  formatDealTimeline,
  getDealBriefModel,
} from "./deal-briefing-prompt";

export { dealBriefSchema } from "./deal-briefing-schema";
export type { DealBrief } from "./deal-briefing-schema";

// ── Core: Build Brief for One Deal ───────────────────────

export async function buildDealBrief(
  dealId: string,
  tenantId: string,
): Promise<DealBrief> {
  // 1. Fetch deal
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId), isNull(deals.deletedAt)));

  if (!deal) throw new Error(`Deal ${dealId} not found`);

  // 2. Fetch related entities
  const [company, contact] = await Promise.all([
    deal.companyId
      ? db
          .select()
          .from(companies)
          .where(and(eq(companies.id, deal.companyId), isNull(companies.deletedAt)))
          .limit(1)
          .then((r) => r[0] || null)
      : null,
    deal.contactId
      ? db
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, deal.contactId), isNull(contacts.deletedAt)))
          .limit(1)
          .then((r) => r[0] || null)
      : null,
  ]);

  // 3. Fetch all activities linked to this deal or its contact
  const entityFilters = [
    and(eq(activities.entityType, "deal"), eq(activities.entityId, dealId)),
  ];
  if (deal.contactId) {
    entityFilters.push(
      and(
        eq(activities.entityType, "contact"),
        eq(activities.entityId, deal.contactId),
      ),
    );
  }

  const dealActivities = await db
    .select({
      id: activities.id,
      activityType: activities.activityType,
      channel: activities.channel,
      direction: activities.direction,
      summary: activities.summary,
      rawContent: activities.rawContent,
      occurredAt: activities.occurredAt,
      sentiment: activities.sentiment,
      metadata: activities.metadata,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        isNull(activities.deletedAt),
        or(...entityFilters),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(30);

  // 4. Fetch context graph edges
  const graphFacts = await loadDealGraphFacts(dealId, deal.contactId, tenantId);

  // 5. Extract enrichment signals from activity metadata
  const enrichmentSignals = extractSignalsFromActivities(dealActivities);

  // 6. Compute stall info
  const age = ageInStage(deal.updatedAt, deal.stage);

  // 7. Format activity timeline for LLM
  const timeline = formatDealTimeline(dealActivities);

  // 8. Format graph facts for LLM
  const graphSection = graphFacts.length > 0
    ? graphFacts.map((f) => `- [${f.relation}] ${f.fact} (${f.date})`).join("\n")
    : "None extracted";

  // 9. Format enrichment signals for LLM
  const signalSection = formatSignals(enrichmentSignals);

  // 10. LLM call to synthesize brief
  const model = getDealBriefModel();
  if (!model) {
    throw new Error("No LLM API key configured");
  }

  const companyName = company?.name ?? null;
  const contactName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null
    : null;

  // Wrap in llmCall so cost / latency / retries / fallback land in
  // `llm_calls` for the admin dashboard. Preserves the existing
  // tracedGenerateObject (which keeps _trace + flywheel + budget
  // semantics intact) — llmCall just adds observability + retry +
  // fallback ON TOP. When primary is Anthropic, fall back to
  // openai gpt-4o-mini ; when primary is already OpenAI, no
  // fallback (different OpenAI model would degrade quality without
  // bypassing the actual outage cause).
  const isPrimaryAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const result = await llmCall({
    fn: tracedGenerateObject,
    args: [{
      model,
      schema: dealBriefSchema.omit({
        dealId: true,
        dealName: true,
        stage: true,
        value: true,
        contactName: true,
        companyName: true,
        daysInStage: true,
      }),
      prompt: buildDealBriefPrompt({
        dealName: deal.name,
        stage: deal.stage,
        value: deal.value,
        companyName,
        contactName,
        contactTitle: contact?.title ?? null,
        daysInStage: age?.days ?? "unknown",
        stallBucket: age?.bucket ?? "unknown",
        dealSummary: deal.summary,
        activityCount: dealActivities.length,
        timeline,
        graphSection,
        signalSection,
      }),
      _trace: {
        agentId: "deal-briefing",
        tenantId,
      },
    }] as never,
    fallbackModel: isPrimaryAnthropic ? openai("gpt-4o-mini") : undefined,
    retries: 1,
    timeoutMs: 45_000,
    trace: {
      tenantId,
      surfaceId: "deal-briefing",
      promptId: "deal-briefing.v1",
      metadata: { dealId, agentId: "deal-briefing" },
    },
  });

  return {
    dealId,
    dealName: deal.name,
    stage: deal.stage ?? "unknown",
    value: deal.value ? Number(deal.value) : null,
    contactName,
    companyName,
    daysInStage: age?.days ?? 0,
    ...(result as { object: Omit<DealBrief, "dealId" | "dealName" | "stage" | "value" | "contactName" | "companyName" | "daysInStage"> }).object,
  };
}

// ── Multi-Deal Briefing ──────────────────────────────────

export async function briefAllOpenDeals(
  tenantId: string,
  opts?: { maxDeals?: number },
): Promise<DealBrief[]> {
  const openDeals = await db
    .select({ id: deals.id })
    .from(deals)
    .where(
      and(
        eq(deals.tenantId, tenantId),
        isNull(deals.deletedAt),
        notInArray(deals.stage, ["won", "lost"]),
      ),
    )
    .orderBy(desc(deals.updatedAt))
    .limit(opts?.maxDeals ?? 20);

  if (openDeals.length === 0) return [];

  // Process in batches of 5 to avoid LLM rate limits
  const batchSize = 5;
  const briefs: DealBrief[] = [];

  for (let i = 0; i < openDeals.length; i += batchSize) {
    const batch = openDeals.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((d) =>
        buildDealBrief(d.id, tenantId).catch((err) => {
          console.warn(`deal-briefing: failed for ${d.id}:`, err);
          return null;
        }),
      ),
    );
    briefs.push(...batchResults.filter((b): b is DealBrief => b !== null));
  }

  // Sort by risk (critical first) then by value
  const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  briefs.sort((a, b) => {
    const riskDiff = riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
    if (riskDiff !== 0) return riskDiff;
    return (b.value ?? 0) - (a.value ?? 0);
  });

  return briefs;
}

// ── Helpers ──────────────────────────────────────────────

async function loadDealGraphFacts(
  dealId: string,
  contactId: string | null,
  tenantId: string,
): Promise<Array<{ relation: string; fact: string; date: string }>> {
  const entityFilters = [
    and(
      eq(contextGraphNodes.entityType, "deal"),
      eq(contextGraphNodes.entityId, dealId),
    ),
  ];
  if (contactId) {
    entityFilters.push(
      and(
        eq(contextGraphNodes.entityType, "person"),
        eq(contextGraphNodes.entityId, contactId),
      ),
    );
  }

  const nodes = await db
    .select({ id: contextGraphNodes.id })
    .from(contextGraphNodes)
    .where(
      and(
        eq(contextGraphNodes.tenantId, tenantId),
        or(...entityFilters),
      ),
    )
    .limit(10);

  if (nodes.length === 0) return [];

  const nodeIds = nodes.map((n) => n.id);

  const edges = await db
    .select({
      relationType: contextGraphEdges.relationType,
      fact: contextGraphEdges.fact,
      tValid: contextGraphEdges.tValid,
    })
    .from(contextGraphEdges)
    .where(
      and(
        eq(contextGraphEdges.tenantId, tenantId),
        or(
          inArray(contextGraphEdges.sourceNodeId, nodeIds),
          inArray(contextGraphEdges.targetNodeId, nodeIds),
        ),
      ),
    )
    .orderBy(desc(contextGraphEdges.tCreated))
    .limit(20);

  return edges.map((e) => ({
    relation: e.relationType ?? "",
    fact: e.fact ?? "",
    date: e.tValid?.toISOString().split("T")[0] ?? "unknown",
  }));
}

interface ActivityRow {
  metadata: unknown;
  occurredAt: Date | null;
}

function extractSignalsFromActivities(
  rows: ActivityRow[],
): { objections: string[]; nextSteps: string[]; champions: string[]; budget: string[] } {
  const result = { objections: [] as string[], nextSteps: [] as string[], champions: [] as string[], budget: [] as string[] };

  for (const row of rows) {
    const meta = row.metadata as Record<string, unknown> | null;
    if (!meta) continue;
    const signals = meta.extractedSignals as Record<string, unknown> | undefined;
    if (!signals) continue;

    if (Array.isArray(signals.objections)) {
      for (const o of signals.objections) {
        if (typeof o === "string" && !result.objections.includes(o)) {
          result.objections.push(o);
        }
      }
    }
    if (Array.isArray(signals.next_steps)) {
      for (const ns of signals.next_steps) {
        if (typeof ns === "string" && !result.nextSteps.includes(ns)) {
          result.nextSteps.push(ns);
        }
      }
    }
    if (Array.isArray(signals.champion_signals)) {
      for (const cs of signals.champion_signals) {
        if (typeof cs === "string") result.champions.push(cs);
      }
    }
    if (Array.isArray(signals.budget_mentions)) {
      for (const bm of signals.budget_mentions) {
        if (typeof bm === "string") result.budget.push(bm);
      }
    }
  }

  return result;
}

function formatSignals(signals: ReturnType<typeof extractSignalsFromActivities>): string {
  const parts: string[] = [];
  if (signals.objections.length > 0) {
    parts.push("Objections: " + signals.objections.join("; "));
  }
  if (signals.nextSteps.length > 0) {
    parts.push("Next steps mentioned: " + signals.nextSteps.join("; "));
  }
  if (signals.champions.length > 0) {
    parts.push("Champion signals: " + signals.champions.join("; "));
  }
  if (signals.budget.length > 0) {
    parts.push("Budget mentions: " + signals.budget.join("; "));
  }
  return parts.length > 0 ? parts.join("\n") : "None extracted";
}
