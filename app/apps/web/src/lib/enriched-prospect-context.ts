/**
 * Enriched Prospect Context — extends ProspectContext with:
 * - Extracted deal signals from the enrichment-email-extract pipeline
 * - Context graph facts (OBJECTED_TO, REQUESTED, DISCUSSED edges)
 * - Recent email bodies (verbatim, for follow-up referencing)
 *
 * Used by C1 (deal briefing) and C3 (contextual follow-up drafting).
 */

import { db } from "@/db";
import { activities, contextGraphEdges, contextGraphNodes } from "@/db/schema";
import { and, desc, eq, or, inArray } from "drizzle-orm";
import {
  buildProspectContext,
  formatContextForPrompt,
  type ProspectContext,
} from "./prospect-context";

// ── Types ────────────────────────────────────────────────

export interface ExtractedSignals {
  objections: Array<{ text: string; date: string; status: "open" | "addressed" }>;
  nextSteps: Array<{ text: string; owner: "us" | "them"; deadline?: string }>;
  championSignals: Array<{ text: string; contactName: string }>;
  budgetMentions: Array<{ text: string; amount?: string }>;
  competitorMentions: Array<{ competitor: string; context: string }>;
}

export interface GraphFact {
  relation: string;
  fact: string;
  date: string;
  confidence: number;
}

export interface RecentEmailBody {
  direction: "inbound" | "outbound";
  from: string;
  date: string;
  subject: string;
  bodySnippet: string;
}

export interface EnrichedProspectContext extends ProspectContext {
  extractedSignals: ExtractedSignals;
  graphFacts: GraphFact[];
  recentEmailBodies: RecentEmailBody[];
}

// ── Builder ──────────────────────────────────────────────

/**
 * Build an enriched context for a contact, including signals extracted
 * by the email-extract pipeline, context graph facts, and recent email
 * bodies. Falls back gracefully if any data source is empty.
 */
export async function buildEnrichedContext(
  contactId: string,
  tenantId: string,
  opts?: { dealId?: string; maxEmails?: number },
): Promise<EnrichedProspectContext | null> {
  const base = await buildProspectContext(contactId, tenantId);
  if (!base) return null;

  const [extractedSignals, graphFacts, recentEmailBodies] = await Promise.all([
    loadExtractedSignals(contactId, tenantId, opts?.dealId),
    loadGraphFacts(contactId, tenantId, opts?.dealId),
    loadRecentEmailBodies(contactId, tenantId, opts?.maxEmails ?? 5),
  ]);

  return {
    ...base,
    extractedSignals,
    graphFacts,
    recentEmailBodies,
  };
}

// ── Signal Extraction ────────────────────────────────────

async function loadExtractedSignals(
  contactId: string,
  tenantId: string,
  dealId?: string,
): Promise<ExtractedSignals> {
  const empty: ExtractedSignals = {
    objections: [],
    nextSteps: [],
    championSignals: [],
    budgetMentions: [],
    competitorMentions: [],
  };

  // Fetch activities that have extractedSignals in metadata
  const entityFilters = [
    and(eq(activities.entityType, "contact"), eq(activities.entityId, contactId)),
  ];
  if (dealId) {
    entityFilters.push(
      and(eq(activities.entityType, "deal"), eq(activities.entityId, dealId)),
    );
  }

  const rows = await db
    .select({
      metadata: activities.metadata,
      occurredAt: activities.occurredAt,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        or(...entityFilters),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(50);

  for (const row of rows) {
    const meta = row.metadata as Record<string, unknown> | null;
    if (!meta) continue;

    const signals = meta.extractedSignals as Record<string, unknown> | undefined;
    if (!signals) continue;

    const dateStr = row.occurredAt?.toISOString().split("T")[0] ?? "unknown";

    if (Array.isArray(signals.objections)) {
      for (const obj of signals.objections) {
        if (typeof obj === "string") {
          empty.objections.push({ text: obj, date: dateStr, status: "open" });
        }
      }
    }
    if (Array.isArray(signals.next_steps)) {
      for (const ns of signals.next_steps) {
        if (typeof ns === "string") {
          empty.nextSteps.push({ text: ns, owner: "us" });
        }
      }
    }
    if (Array.isArray(signals.champion_signals)) {
      for (const cs of signals.champion_signals) {
        if (typeof cs === "string") {
          empty.championSignals.push({ text: cs, contactName: "" });
        }
      }
    }
    if (Array.isArray(signals.budget_mentions)) {
      for (const bm of signals.budget_mentions) {
        if (typeof bm === "string") {
          empty.budgetMentions.push({ text: bm });
        }
      }
    }
    if (Array.isArray(signals.competitor_mentions)) {
      for (const cm of signals.competitor_mentions) {
        if (typeof cm === "string") {
          empty.competitorMentions.push({ competitor: cm, context: "" });
        }
      }
    }
  }

  return empty;
}

// ── Context Graph ────────────────────────────────────────

async function loadGraphFacts(
  contactId: string,
  tenantId: string,
  dealId?: string,
): Promise<GraphFact[]> {
  // Find graph nodes for this contact and deal
  const entityFilters = [
    and(
      eq(contextGraphNodes.entityType, "person"),
      eq(contextGraphNodes.entityId, contactId),
    ),
  ];
  if (dealId) {
    entityFilters.push(
      and(
        eq(contextGraphNodes.entityType, "deal"),
        eq(contextGraphNodes.entityId, dealId),
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

  // Fetch edges involving these nodes — focus on high-signal relations
  const edges = await db
    .select({
      relationType: contextGraphEdges.relationType,
      fact: contextGraphEdges.fact,
      tValid: contextGraphEdges.tValid,
      confidence: contextGraphEdges.confidence,
    })
    .from(contextGraphEdges)
    .where(
      and(
        eq(contextGraphEdges.tenantId, tenantId),
        or(
          inArray(contextGraphEdges.sourceNodeId, nodeIds),
          inArray(contextGraphEdges.targetNodeId, nodeIds),
        ),
        // Only facts that haven't been invalidated
        eq(contextGraphEdges.tExpired, null as unknown as Date),
      ),
    )
    .orderBy(desc(contextGraphEdges.tCreated))
    .limit(30);

  return edges.map((e) => ({
    relation: e.relationType ?? "",
    fact: e.fact ?? "",
    date: e.tValid?.toISOString().split("T")[0] ?? "unknown",
    confidence: typeof e.confidence === "number" ? e.confidence : 0.5,
  }));
}

// ── Email Bodies ─────────────────────────────────────────

async function loadRecentEmailBodies(
  contactId: string,
  tenantId: string,
  maxEmails: number,
): Promise<RecentEmailBody[]> {
  const rows = await db
    .select({
      rawContent: activities.rawContent,
      summary: activities.summary,
      direction: activities.direction,
      occurredAt: activities.occurredAt,
      metadata: activities.metadata,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "contact"),
        eq(activities.entityId, contactId),
        eq(activities.channel, "email"),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(maxEmails);

  return rows
    .filter((r) => r.rawContent || r.summary)
    .map((r) => {
      const meta = (r.metadata || {}) as Record<string, unknown>;
      const body = r.rawContent || r.summary || "";
      return {
        direction: (r.direction === "outbound" ? "outbound" : "inbound") as
          | "inbound"
          | "outbound",
        from: (meta.from as string) || (r.direction === "outbound" ? "us" : "them"),
        date: r.occurredAt?.toISOString().split("T")[0] ?? "unknown",
        subject: (meta.subject as string) || "",
        bodySnippet: body.slice(0, 800),
      };
    });
}

// ── Formatting ───────────────────────────────────────────

/**
 * Format enriched context for LLM prompts — extends the base formatter
 * with extracted signals, graph facts, and email excerpts.
 */
export function formatEnrichedContextForPrompt(ctx: EnrichedProspectContext): string {
  const sections: string[] = [formatContextForPrompt(ctx)];

  // Extracted signals
  const { extractedSignals: sig } = ctx;
  if (sig.objections.length > 0) {
    sections.push(
      "KNOWN OBJECTIONS:\n" +
        sig.objections.map((o) => `- [${o.status}] ${o.text} (${o.date})`).join("\n"),
    );
  }
  if (sig.nextSteps.length > 0) {
    sections.push(
      "PENDING NEXT STEPS:\n" +
        sig.nextSteps
          .map((ns) => `- [${ns.owner}] ${ns.text}${ns.deadline ? ` (due: ${ns.deadline})` : ""}`)
          .join("\n"),
    );
  }
  if (sig.championSignals.length > 0) {
    sections.push(
      "CHAMPION SIGNALS:\n" + sig.championSignals.map((cs) => `- ${cs.text}`).join("\n"),
    );
  }
  if (sig.budgetMentions.length > 0) {
    sections.push(
      "BUDGET MENTIONS:\n" + sig.budgetMentions.map((bm) => `- ${bm.text}`).join("\n"),
    );
  }
  if (sig.competitorMentions.length > 0) {
    sections.push(
      "COMPETITOR MENTIONS:\n" +
        sig.competitorMentions.map((cm) => `- ${cm.competitor}: ${cm.context}`).join("\n"),
    );
  }

  // Graph facts
  if (ctx.graphFacts.length > 0) {
    const highConfidence = ctx.graphFacts.filter((f) => f.confidence >= 0.6);
    if (highConfidence.length > 0) {
      sections.push(
        "KNOWLEDGE GRAPH FACTS:\n" +
          highConfidence.map((f) => `- [${f.relation}] ${f.fact} (${f.date})`).join("\n"),
      );
    }
  }

  // Recent email excerpts
  if (ctx.recentEmailBodies.length > 0) {
    sections.push(
      "RECENT EMAIL EXCERPTS (verbatim):\n" +
        ctx.recentEmailBodies
          .map(
            (e) =>
              `--- ${e.direction.toUpperCase()} from ${e.from} on ${e.date} ---\nSubject: ${e.subject}\n${e.bodySnippet}\n---`,
          )
          .join("\n\n"),
    );
  }

  return sections.join("\n\n");
}
