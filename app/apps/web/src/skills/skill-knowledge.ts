import { retrieveKnowledge, formatKnowledgeForPrompt } from "@/lib/knowledge/retrieval";
import { searchSimilar } from "@/lib/ai/embeddings";
import { db } from "@/db";
import { notes, activities, contacts } from "@/db/schema";
import { eq, and, desc, or } from "drizzle-orm";
import logger from "@/lib/observability/logger";

let embeddingWarningLogged = false;

/**
 * Retrieve and format Knowledge entries relevant to a skill execution.
 * Uses semantic search when OPENAI_API_KEY is available, falls back to keyword.
 */
export async function getSkillKnowledge(
  query: string,
  tenantId: string,
  options?: { userId?: string; limit?: number },
): Promise<string> {
  const entries = await retrieveKnowledge(query, tenantId, {
    userId: options?.userId,
    limit: options?.limit ?? 5,
  }).catch(() => []);

  return formatKnowledgeForPrompt(entries);
}

/**
 * Retrieve conversation context for an entity using semantic search + direct queries.
 * Combines:
 * 1. Semantic search for relevant content across the tenant
 * 2. Direct activity queries by entity IDs
 * 3. Notes attached to the entity
 */
export async function getDeepConversationContext(
  tenantId: string,
  opts: {
    dealId?: string;
    companyId?: string;
    contactIds?: string[];
    query?: string;
    activityLimit?: number;
    contentMaxChars?: number;
  },
): Promise<{
  activities: string;
  notes: string;
  semanticResults: string;
}> {
  const activityLimit = opts.activityLimit ?? 20;
  const contentMaxChars = opts.contentMaxChars ?? 1500;

  const [activityResults, noteResults, semanticResults] = await Promise.all([
    // 1. Direct activity queries
    (async () => {
      const filters = [];
      if (opts.dealId) {
        filters.push(
          and(eq(activities.entityType, "deal"), eq(activities.entityId, opts.dealId)),
        );
      }
      if (opts.companyId) {
        filters.push(
          and(eq(activities.entityType, "company"), eq(activities.entityId, opts.companyId)),
        );
      }
      for (const cId of opts.contactIds ?? []) {
        filters.push(
          and(eq(activities.entityType, "contact"), eq(activities.entityId, cId)),
        );
      }
      if (filters.length === 0) return [];

      return db
        .select({
          activityType: activities.activityType,
          summary: activities.summary,
          rawContent: activities.rawContent,
          direction: activities.direction,
          occurredAt: activities.occurredAt,
        })
        .from(activities)
        .where(and(eq(activities.tenantId, tenantId), or(...filters)))
        .orderBy(desc(activities.occurredAt))
        .limit(activityLimit);
    })(),

    // 2. Notes attached to deal or company
    (async () => {
      const filters = [];
      if (opts.dealId) {
        filters.push(
          and(eq(notes.entityType, "deal"), eq(notes.entityId, opts.dealId)),
        );
      }
      if (opts.companyId) {
        filters.push(
          and(eq(notes.entityType, "company"), eq(notes.entityId, opts.companyId)),
        );
      }
      if (filters.length === 0) return [];

      return db
        .select({ title: notes.title, content: notes.content })
        .from(notes)
        .where(and(eq(notes.tenantId, tenantId), or(...filters)))
        .orderBy(desc(notes.createdAt))
        .limit(10);
    })(),

    // 3. Semantic search for related content
    (async () => {
      if (!opts.query) return [];
      if (!process.env.OPENAI_API_KEY) {
        if (!embeddingWarningLogged) {
          logger.warn("OPENAI_API_KEY not set — semantic search disabled for skills. Knowledge retrieval will use keyword fallback only.");
          embeddingWarningLogged = true;
        }
        return [];
      }
      try {
        const results = await searchSimilar(opts.query, 5, tenantId);
        return results.filter((r) => r.similarity > 0.45);
      } catch {
        return [];
      }
    })(),
  ]);

  const activityText = activityResults
    .map((a) => {
      const date = a.occurredAt?.toISOString().split("T")[0] ?? "?";
      const content = a.rawContent
        ? a.rawContent.slice(0, contentMaxChars)
        : a.summary ?? "";
      return `[${date}] ${a.activityType} ${a.direction ?? ""}: ${content}`;
    })
    .join("\n\n");

  const noteText = noteResults
    .map((n) => `### ${n.title}\n${n.content}`)
    .join("\n\n");

  const semanticText = semanticResults
    .map((r) => `[${r.entityType}] ${r.content.slice(0, 800)}`)
    .join("\n\n");

  return {
    activities: activityText,
    notes: noteText,
    semanticResults: semanticText,
  };
}

/**
 * Get all contacts linked to a company.
 */
export async function getCompanyContacts(
  companyId: string,
  tenantId: string,
): Promise<Array<{ id: string; name: string; title: string | null; email: string | null }>> {
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      title: contacts.title,
      email: contacts.email,
    })
    .from(contacts)
    .where(and(eq(contacts.companyId, companyId), eq(contacts.tenantId, tenantId)))
    .limit(20);

  return rows.map((r) => ({
    id: r.id,
    name: [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unnamed",
    title: r.title,
    email: r.email,
  }));
}
