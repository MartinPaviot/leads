import { db } from "@/db";
import { knowledgeEntries } from "@/db/schema";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";
import { embedText } from "@/lib/embeddings";
import postgres from "postgres";
import logger from "@/lib/logger";

const rawSql = postgres(process.env.DATABASE_URL!);

export type KnowledgeCategory =
  | "icp"
  | "competitors"
  | "objections"
  | "product"
  | "process"
  | "context"
  | "custom";

export interface RetrievedKnowledge {
  id: string;
  title: string;
  category: string;
  content: string;
  similarity: number;
  scope: string;
}

/**
 * Retrieve relevant knowledge entries for a query using semantic search.
 * Falls back to keyword search if embeddings are unavailable.
 *
 * Returns full content (not truncated) — this is the key difference
 * from the old system that capped at 300 chars.
 */
export async function retrieveKnowledge(
  query: string,
  tenantId: string,
  options: {
    userId?: string;
    category?: KnowledgeCategory;
    limit?: number;
    minSimilarity?: number;
  } = {}
): Promise<RetrievedKnowledge[]> {
  const limit = options.limit ?? 5;
  const minSimilarity = options.minSimilarity ?? 0.3;

  // Try semantic search first
  if (process.env.OPENAI_API_KEY) {
    try {
      return await semanticSearch(query, tenantId, {
        ...options,
        limit,
        minSimilarity,
      });
    } catch (e) {
      logger.warn("Knowledge semantic search failed, falling back to keyword", {
        error: String(e),
      });
    }
  }

  // Fallback: keyword search
  return keywordSearch(query, tenantId, { ...options, limit });
}

async function semanticSearch(
  query: string,
  tenantId: string,
  options: {
    userId?: string;
    category?: KnowledgeCategory;
    limit: number;
    minSimilarity: number;
  }
): Promise<RetrievedKnowledge[]> {
  const queryVector = await embedText(query);
  const vectorStr = `[${queryVector.join(",")}]`;

  // Build scope filter: workspace entries + user's own entries
  let scopeFilter = `AND (ke.scope = 'workspace'`;
  const params: unknown[] = [tenantId, vectorStr, options.minSimilarity, options.limit * 2];

  if (options.userId) {
    scopeFilter += ` OR (ke.scope = 'user' AND ke.created_by = $5))`;
    params.push(options.userId);
  } else {
    scopeFilter += `)`;
  }

  let categoryFilter = "";
  if (options.category) {
    const nextParam = params.length + 1;
    categoryFilter = `AND ke.category = $${nextParam}`;
    params.push(options.category);
  }

  // Join knowledge_entries with embeddings table for vector similarity
  // Knowledge entries are embedded with entity_type='knowledge'
  const results = await rawSql`
    SELECT
      ke.id,
      ke.title,
      ke.category,
      ke.content,
      ke.scope,
      1 - (e.embedding <=> ${vectorStr}::vector) as similarity
    FROM knowledge_entries ke
    JOIN embeddings e ON e.entity_type = 'knowledge' AND e.entity_id = ke.id AND e.tenant_id = ke.tenant_id
    WHERE ke.tenant_id = ${tenantId}
      AND ke.is_active = true
      AND (ke.scope = 'workspace' ${options.userId ? rawSql`OR (ke.scope = 'user' AND ke.created_by = ${options.userId})` : rawSql``})
      ${options.category ? rawSql`AND ke.category = ${options.category}` : rawSql``}
      AND 1 - (e.embedding <=> ${vectorStr}::vector) > ${options.minSimilarity}
    ORDER BY e.embedding <=> ${vectorStr}::vector
    LIMIT ${options.limit}
  `;

  return results.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    category: r.category as string,
    content: r.content as string,
    similarity: r.similarity as number,
    scope: r.scope as string,
  }));
}

async function keywordSearch(
  query: string,
  tenantId: string,
  options: {
    userId?: string;
    category?: KnowledgeCategory;
    limit: number;
  }
): Promise<RetrievedKnowledge[]> {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 5);

  if (keywords.length === 0) return [];

  const conditions = [
    eq(knowledgeEntries.tenantId, tenantId),
    eq(knowledgeEntries.isActive, true),
  ];

  if (options.category) {
    conditions.push(eq(knowledgeEntries.category, options.category));
  }

  // Scope filter
  if (options.userId) {
    conditions.push(
      or(
        eq(knowledgeEntries.scope, "workspace"),
        and(
          eq(knowledgeEntries.scope, "user"),
          eq(knowledgeEntries.createdBy, options.userId)
        )!
      )!
    );
  } else {
    conditions.push(eq(knowledgeEntries.scope, "workspace"));
  }

  // Keyword matching on title + content
  const keywordConditions = keywords.map((kw) =>
    or(
      ilike(knowledgeEntries.title, `%${kw}%`),
      ilike(knowledgeEntries.content, `%${kw}%`)
    )
  );
  conditions.push(or(...keywordConditions)!);

  const rows = await db
    .select()
    .from(knowledgeEntries)
    .where(and(...conditions))
    .orderBy(desc(knowledgeEntries.updatedAt))
    .limit(options.limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    content: r.content,
    similarity: 0.5, // keyword match has no similarity score
    scope: r.scope,
  }));
}

/**
 * Format retrieved knowledge for injection into system prompt.
 * Returns the full content of each entry, not truncated.
 */
export function formatKnowledgeForPrompt(entries: RetrievedKnowledge[]): string {
  if (entries.length === 0) return "";

  const sections = entries.map(
    (e) =>
      `### ${e.title} (${e.category})\n${e.content}`
  );

  return `## Business Knowledge\n\nThe following is knowledge that the user has defined about their business. Use it to ground your responses.\n\n${sections.join("\n\n---\n\n")}`;
}

/**
 * Embed a knowledge entry for semantic retrieval.
 * Stores in the shared embeddings table with entity_type='knowledge'.
 */
export async function embedKnowledgeEntry(
  tenantId: string,
  entryId: string,
  title: string,
  content: string
): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;

  try {
    const textToEmbed = `${title}\n\n${content}`.slice(0, 6000);
    const vector = await embedText(textToEmbed);
    const vectorStr = `[${vector.join(",")}]`;

    await rawSql`
      INSERT INTO embeddings (tenant_id, entity_type, entity_id, content, embedding)
      VALUES (${tenantId}, 'knowledge', ${entryId}, ${textToEmbed}, ${vectorStr}::vector)
      ON CONFLICT (tenant_id, entity_type, entity_id)
      DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
    `;
  } catch (e) {
    logger.warn("Failed to embed knowledge entry", {
      entryId,
      error: String(e),
    });
  }
}
