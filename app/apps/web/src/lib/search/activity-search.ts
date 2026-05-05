/**
 * Activity Full-Text Search (C2)
 *
 * Searches activity bodies (rawContent) and summaries for exact phrases
 * and keywords. Returns verbatim excerpts with surrounding context.
 *
 * Uses PostgreSQL full-text search via the `body_tsvector` generated
 * column (see migration 0019). Falls back to ILIKE when FTS isn't
 * available (pre-migration or for phrase matching).
 */

import { db } from "@/db";
import { activities, contacts, companies, deals } from "@/db/schema";
import { and, desc, eq, or, sql, ilike } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────

export interface SearchResult {
  activityId: string;
  activityType: string;
  channel: string | null;
  direction: string | null;
  date: string;
  entityType: string;
  entityId: string;
  /** The name of the linked entity (contact name, company name, deal name) */
  entityName: string | null;
  /** Short excerpt around the matched text */
  excerpt: string;
  /** The matching line(s) from the content */
  matchedText: string;
  sentiment: string | null;
}

export interface SearchOptions {
  /** Filter to specific entity */
  entityType?: string;
  entityId?: string;
  /** Filter to specific channels */
  channels?: string[];
  /** Max results */
  limit?: number;
}

// ── Search ───────────────────────────────────────────────

/**
 * Search activity bodies for a query string. Returns verbatim excerpts
 * with source attribution.
 *
 * Strategy: ILIKE search on rawContent and summary columns. This works
 * without the FTS generated column (which requires a migration). When
 * the migration is applied, this can be upgraded to use `to_tsquery`.
 */
export async function searchActivityBodies(
  query: string,
  tenantId: string,
  opts: SearchOptions = {},
): Promise<SearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  const searchTerm = `%${query.trim()}%`;
  const limit = opts.limit ?? 20;

  const conditions = [
    eq(activities.tenantId, tenantId),
    or(
      ilike(activities.rawContent, searchTerm),
      ilike(activities.summary, searchTerm),
    ),
  ];

  if (opts.entityType) {
    conditions.push(eq(activities.entityType, opts.entityType));
  }
  if (opts.entityId) {
    conditions.push(eq(activities.entityId, opts.entityId));
  }

  const rows = await db
    .select({
      id: activities.id,
      activityType: activities.activityType,
      channel: activities.channel,
      direction: activities.direction,
      occurredAt: activities.occurredAt,
      entityType: activities.entityType,
      entityId: activities.entityId,
      rawContent: activities.rawContent,
      summary: activities.summary,
      sentiment: activities.sentiment,
    })
    .from(activities)
    .where(and(...conditions))
    .orderBy(desc(activities.occurredAt))
    .limit(limit);

  // Resolve entity names in parallel
  const results: SearchResult[] = [];
  for (const row of rows) {
    const content = row.rawContent || row.summary || "";
    const excerpt = extractExcerpt(content, query.trim(), 150);
    const matchedText = extractMatchedLine(content, query.trim());
    const entityName = await resolveEntityName(row.entityType, row.entityId, tenantId);

    results.push({
      activityId: row.id,
      activityType: row.activityType || "",
      channel: row.channel,
      direction: row.direction,
      date: row.occurredAt?.toISOString().split("T")[0] ?? "unknown",
      entityType: row.entityType,
      entityId: row.entityId,
      entityName,
      excerpt,
      matchedText,
      sentiment: row.sentiment,
    });
  }

  return results;
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Extract a short excerpt around the first match, with context before/after.
 */
function extractExcerpt(text: string, query: string, contextChars: number): string {
  const lower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  const idx = lower.indexOf(queryLower);

  if (idx === -1) return text.slice(0, contextChars * 2) + (text.length > contextChars * 2 ? "..." : "");

  const start = Math.max(0, idx - contextChars);
  const end = Math.min(text.length, idx + query.length + contextChars);
  let excerpt = text.slice(start, end);

  if (start > 0) excerpt = "..." + excerpt;
  if (end < text.length) excerpt = excerpt + "...";

  return excerpt;
}

/**
 * Extract the line containing the match for a more focused view.
 */
function extractMatchedLine(text: string, query: string): string {
  const lines = text.split("\n");
  const queryLower = query.toLowerCase();

  for (const line of lines) {
    if (line.toLowerCase().includes(queryLower)) {
      return line.trim();
    }
  }

  return text.slice(0, 200);
}

/**
 * Resolve entity name from the entity table (contact, company, deal).
 */
async function resolveEntityName(
  entityType: string,
  entityId: string,
  tenantId: string,
): Promise<string | null> {
  if (entityType === "contact") {
    const [c] = await db
      .select({ firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(and(eq(contacts.id, entityId), eq(contacts.tenantId, tenantId)))
      .limit(1);
    return c ? [c.firstName, c.lastName].filter(Boolean).join(" ") || null : null;
  }
  if (entityType === "company") {
    const [c] = await db
      .select({ name: companies.name })
      .from(companies)
      .where(and(eq(companies.id, entityId), eq(companies.tenantId, tenantId)))
      .limit(1);
    return c?.name ?? null;
  }
  if (entityType === "deal") {
    const [d] = await db
      .select({ name: deals.name })
      .from(deals)
      .where(and(eq(deals.id, entityId), eq(deals.tenantId, tenantId)))
      .limit(1);
    return d?.name ?? null;
  }
  return null;
}
