/**
 * Collect citable source interactions for a deal: the emails/meetings/calls
 * (activities) and notes that a proposal section can be grounded in and cite.
 * Returns enumerated sources ([A1], [N1], ...) + an LLM-ready block + an
 * id->source map for resolving the citations the model returns. Tenant-scoped.
 */

import { db } from "@/db";
import { activities, notes } from "@/db/schema";
import { and, eq, or, desc } from "drizzle-orm";

export interface CitableSource {
  id: string; // "A1", "N1", "K1"
  type: "activity" | "note" | "knowledge";
  label: string;
  snippet: string;
  date: string | null;
}

export async function collectCitableSources(
  tenantId: string,
  opts: {
    dealId?: string;
    companyId?: string;
    contactId?: string;
    activityLimit?: number;
    noteLimit?: number;
    knowledgeQuery?: string;
    knowledgeLimit?: number;
  },
): Promise<{ sources: CitableSource[]; block: string; byId: Map<string, CitableSource> }> {
  const actFilters = [];
  if (opts.dealId)
    actFilters.push(and(eq(activities.entityType, "deal"), eq(activities.entityId, opts.dealId)));
  if (opts.companyId)
    actFilters.push(and(eq(activities.entityType, "company"), eq(activities.entityId, opts.companyId)));
  if (opts.contactId)
    actFilters.push(and(eq(activities.entityType, "contact"), eq(activities.entityId, opts.contactId)));

  const noteFilters = [];
  if (opts.dealId)
    noteFilters.push(and(eq(notes.entityType, "deal"), eq(notes.entityId, opts.dealId)));
  if (opts.companyId)
    noteFilters.push(and(eq(notes.entityType, "company"), eq(notes.entityId, opts.companyId)));

  const [actRows, noteRows] = await Promise.all([
    actFilters.length
      ? db
          .select({
            activityType: activities.activityType,
            direction: activities.direction,
            summary: activities.summary,
            rawContent: activities.rawContent,
            occurredAt: activities.occurredAt,
          })
          .from(activities)
          .where(and(eq(activities.tenantId, tenantId), or(...actFilters)))
          .orderBy(desc(activities.occurredAt))
          .limit(opts.activityLimit ?? 12)
      : Promise.resolve([]),
    noteFilters.length
      ? db
          .select({ title: notes.title, content: notes.content, createdAt: notes.createdAt })
          .from(notes)
          .where(and(eq(notes.tenantId, tenantId), or(...noteFilters)))
          .orderBy(desc(notes.createdAt))
          .limit(opts.noteLimit ?? 8)
      : Promise.resolve([]),
  ]);

  const sources: CitableSource[] = [];
  actRows.forEach((a, i) => {
    sources.push({
      id: `A${i + 1}`,
      type: "activity",
      label: `${a.activityType}${a.direction ? ` ${a.direction}` : ""}`,
      snippet: (a.rawContent || a.summary || "").slice(0, 400),
      date: a.occurredAt ? a.occurredAt.toISOString().split("T")[0] : null,
    });
  });
  noteRows.forEach((n, i) => {
    sources.push({
      id: `N${i + 1}`,
      type: "note",
      label: n.title || "note",
      snippet: (n.content || "").slice(0, 400),
      date: n.createdAt ? n.createdAt.toISOString().split("T")[0] : null,
    });
  });

  // PROPOSAL-009 AC3: make Elevay knowledge (pricing/positioning) citable too,
  // so claims grounded on it carry a [K..] citation instead of looking ungrounded.
  if (opts.knowledgeQuery) {
    try {
      const { retrieveKnowledge } = await import("@/lib/knowledge/retrieval");
      const knowRows = (await retrieveKnowledge(opts.knowledgeQuery, tenantId, {
        limit: opts.knowledgeLimit ?? 4,
      })) as Array<{ title?: string | null; content?: string | null }>;
      knowRows.forEach((k, i) => {
        sources.push({
          id: `K${i + 1}`,
          type: "knowledge",
          label: k.title || "knowledge",
          snippet: (k.content || "").slice(0, 400),
          date: null,
        });
      });
    } catch {
      // knowledge is optional grounding
    }
  }

  const block = sources.length
    ? sources.map((s) => `[${s.id}] (${s.date ?? "?"}, ${s.label}) ${s.snippet}`).join("\n")
    : "(no recorded interactions)";
  const byId = new Map(sources.map((s) => [s.id, s]));
  return { sources, block, byId };
}
