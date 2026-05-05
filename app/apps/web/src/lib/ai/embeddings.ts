import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

export async function embedText(text: string): Promise<number[]> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured — embedding unavailable");
  }
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: text,
  });
  return embedding;
}

/**
 * Embed a single entity. Uses transactional DELETE + INSERT to prevent duplicates
 * and avoid partial states. Truncation preserves the first 1000 chars (identity info)
 * and the last 5000 chars (most recent context) for entities with long histories.
 */
export async function embedEntity(
  tenantId: string,
  entityType: string,
  entityId: string,
  content: string
): Promise<void> {
  if (!content.trim()) return;

  // Truncate to ~6000 chars (~1500 tokens) to stay within limits.
  // Strategy: keep first 1000 chars (identity/header info) + last 5000 chars
  // (most recent context). For short content, just use it as-is.
  const MAX_CHARS = 6000;
  const HEAD_CHARS = 1000;
  let truncated: string;
  if (content.length <= MAX_CHARS) {
    truncated = content;
  } else {
    const head = content.slice(0, HEAD_CHARS);
    const tail = content.slice(-(MAX_CHARS - HEAD_CHARS));
    truncated = head + "\n...\n" + tail;
  }

  const vector = await embedText(truncated);
  const vectorStr = `[${vector.join(",")}]`;

  // Atomic upsert via ON CONFLICT — single statement, no partial states.
  await sql`
    INSERT INTO embeddings (tenant_id, entity_type, entity_id, content, embedding)
    VALUES (${tenantId}, ${entityType}, ${entityId}, ${truncated}, ${vectorStr}::vector)
    ON CONFLICT (tenant_id, entity_type, entity_id)
    DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
  `;
}

/**
 * Search for similar embeddings using cosine similarity.
 *
 * Uses HNSW index which provides near-exact recall without tuning.
 * The HNSW default ef_search=40 is sufficient for datasets under 100K rows.
 * For larger datasets, increase via: SET hnsw.ef_search = 200.
 */
export async function searchSimilar(
  query: string,
  limit: number = 5,
  tenantId?: string
): Promise<
  Array<{
    entityType: string;
    entityId: string;
    content: string;
    similarity: number;
  }>
> {
  const queryVector = await embedText(query);
  const vectorStr = `[${queryVector.join(",")}]`;

  const results = tenantId
    ? await sql`
        SELECT
          entity_type,
          entity_id,
          content,
          1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM embeddings
        WHERE tenant_id = ${tenantId}
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `
    : await sql`
        SELECT
          entity_type,
          entity_id,
          content,
          1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM embeddings
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `;

  return results.map((r) => ({
    entityType: r.entity_type as string,
    entityId: r.entity_id as string,
    content: r.content as string,
    similarity: r.similarity as number,
  }));
}

// ── Hybrid Search (BM25 full-text + pgvector semantic + RRF) ──────

/**
 * Internal: semantic-only search returning ranked results with a positional rank.
 * Fetches a wider window (3x limit) to give RRF enough candidates to fuse.
 */
async function semanticSearchRanked(
  queryVector: number[],
  pool: number,
  tenantId?: string
): Promise<
  Array<{
    entityType: string;
    entityId: string;
    content: string;
    similarity: number;
    rank: number;
  }>
> {
  const vectorStr = `[${queryVector.join(",")}]`;

  const rows = tenantId
    ? await sql`
        SELECT entity_type, entity_id, content,
               1 - (embedding <=> ${vectorStr}::vector) AS similarity
        FROM embeddings
        WHERE tenant_id = ${tenantId}
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${pool}
      `
    : await sql`
        SELECT entity_type, entity_id, content,
               1 - (embedding <=> ${vectorStr}::vector) AS similarity
        FROM embeddings
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${pool}
      `;

  return rows.map((r, i) => ({
    entityType: r.entity_type as string,
    entityId: r.entity_id as string,
    content: r.content as string,
    similarity: r.similarity as number,
    rank: i + 1,
  }));
}

/**
 * Internal: PostgreSQL full-text search using tsvector/tsquery with ts_rank_cd.
 * Requires migration 0029 (search_vector generated column + GIN index).
 * Falls back to empty results if the search_vector column doesn't exist yet.
 */
async function fullTextSearchRanked(
  query: string,
  pool: number,
  tenantId?: string
): Promise<
  Array<{
    entityType: string;
    entityId: string;
    content: string;
    tsRank: number;
    rank: number;
  }>
> {
  try {
    const rows = tenantId
      ? await sql`
          SELECT entity_type, entity_id, content,
                 ts_rank_cd(search_vector, plainto_tsquery('english', ${query})) AS ts_rank
          FROM embeddings
          WHERE tenant_id = ${tenantId}
            AND search_vector @@ plainto_tsquery('english', ${query})
          ORDER BY ts_rank DESC
          LIMIT ${pool}
        `
      : await sql`
          SELECT entity_type, entity_id, content,
                 ts_rank_cd(search_vector, plainto_tsquery('english', ${query})) AS ts_rank
          FROM embeddings
          WHERE search_vector @@ plainto_tsquery('english', ${query})
          ORDER BY ts_rank DESC
          LIMIT ${pool}
        `;

    return rows.map((r, i) => ({
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      content: r.content as string,
      tsRank: r.ts_rank as number,
      rank: i + 1,
    }));
  } catch {
    // search_vector column may not exist yet (migration not run)
    return [];
  }
}

export interface HybridSearchResult {
  entityType: string;
  entityId: string;
  content: string;
  score: number;
  sources: string[];
}

/**
 * Hybrid search combining pgvector semantic similarity and PostgreSQL
 * full-text search (BM25 via tsvector/tsquery), fused with Reciprocal
 * Rank Fusion (RRF).
 *
 * RRF formula: score = sum(1 / (k + rank_i)) where k=60 (standard constant).
 *
 * Both searches run in parallel. Results are merged by (entityType, entityId)
 * composite key, scored via RRF, and returned sorted by fused score descending.
 *
 * The `sources` field indicates which retrieval paths contributed to each result:
 * ["semantic"], ["fulltext"], or ["semantic", "fulltext"].
 *
 * @param query        Natural language search query
 * @param limit        Max results to return (default 5)
 * @param tenantId     Optional tenant scope
 * @param options      Optional weights for semantic vs text search contribution
 *                     - semanticWeight: multiplier for semantic RRF score (default 1.0)
 *                     - textWeight: multiplier for full-text RRF score (default 1.0)
 */
export async function searchHybrid(
  query: string,
  limit: number = 5,
  tenantId?: string,
  options?: { semanticWeight?: number; textWeight?: number }
): Promise<HybridSearchResult[]> {
  const semanticWeight = options?.semanticWeight ?? 1.0;
  const textWeight = options?.textWeight ?? 1.0;
  const k = 60; // RRF constant

  // Fetch a wider candidate pool so RRF has enough signal to fuse
  const pool = Math.max(limit * 3, 20);

  // Run semantic embedding + full-text search in parallel
  const queryVector = await embedText(query);
  const [semanticResults, fulltextResults] = await Promise.all([
    semanticSearchRanked(queryVector, pool, tenantId),
    fullTextSearchRanked(query, pool, tenantId),
  ]);

  // Build a map keyed by "entityType:entityId" for RRF merge
  const fused = new Map<
    string,
    {
      entityType: string;
      entityId: string;
      content: string;
      score: number;
      sources: string[];
    }
  >();

  for (const hit of semanticResults) {
    const key = `${hit.entityType}:${hit.entityId}`;
    const rrfScore = semanticWeight * (1 / (k + hit.rank));
    fused.set(key, {
      entityType: hit.entityType,
      entityId: hit.entityId,
      content: hit.content,
      score: rrfScore,
      sources: ["semantic"],
    });
  }

  for (const hit of fulltextResults) {
    const key = `${hit.entityType}:${hit.entityId}`;
    const rrfScore = textWeight * (1 / (k + hit.rank));
    const existing = fused.get(key);
    if (existing) {
      existing.score += rrfScore;
      if (!existing.sources.includes("fulltext")) {
        existing.sources.push("fulltext");
      }
    } else {
      fused.set(key, {
        entityType: hit.entityType,
        entityId: hit.entityId,
        content: hit.content,
        score: rrfScore,
        sources: ["fulltext"],
      });
    }
  }

  // Sort by fused score descending, return top `limit`
  return Array.from(fused.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Remove duplicate embeddings (keep only the most recent per entity).
 * Returns the number of duplicates removed.
 */
export async function cleanupDuplicateEmbeddings(): Promise<number> {
  const result = await sql`
    DELETE FROM embeddings
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY tenant_id, entity_type, entity_id
          ORDER BY created_at DESC
        ) as rn
        FROM embeddings
      ) ranked
      WHERE rn > 1
    )
  `;
  return result.count;
}

/**
 * Get embedding statistics for diagnostics.
 */
export async function getEmbeddingStats(tenantId?: string): Promise<{
  total: number;
  byType: Record<string, number>;
  duplicates: number;
  indexType: string;
}> {
  const whereClause = tenantId
    ? sql`WHERE tenant_id = ${tenantId}`
    : sql``;

  const [totalResult] = await sql`SELECT count(*)::int as cnt FROM embeddings ${whereClause}`;
  const byTypeResult = await sql`
    SELECT entity_type, count(*)::int as cnt FROM embeddings ${whereClause} GROUP BY entity_type
  `;
  const [dupeResult] = await sql`
    SELECT count(*)::int as cnt FROM (
      SELECT tenant_id, entity_type, entity_id
      FROM embeddings ${whereClause}
      GROUP BY tenant_id, entity_type, entity_id
      HAVING count(*) > 1
    ) sub
  `;
  const indexResult = await sql`
    SELECT indexdef FROM pg_indexes WHERE indexname = 'embeddings_embedding_idx'
  `;
  const indexType = indexResult.length > 0
    ? (indexResult[0].indexdef as string).includes("hnsw") ? "hnsw" : "ivfflat"
    : "none";

  return {
    total: totalResult.cnt,
    byType: Object.fromEntries(byTypeResult.map((r) => [r.entity_type, r.cnt])),
    duplicates: dupeResult.cnt,
    indexType,
  };
}

export function contactToText(contact: {
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  properties?: Record<string, unknown> | null;
  companyName?: string | null;
}): string {
  const parts = [];
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  if (name) parts.push(name);
  if (contact.title) parts.push(contact.title);
  if (contact.companyName) parts.push(`at ${contact.companyName}`);
  if (contact.email) parts.push(`Email: ${contact.email}`);
  if (contact.phone) parts.push(`Phone: ${contact.phone}`);
  const notes = (contact.properties as Record<string, string>)?.notes;
  if (notes) parts.push(`Notes: ${notes}`);
  return parts.join(". ");
}

export function activityToText(activity: {
  activityType: string;
  summary?: string | null;
  rawContent?: string | null;
  channel?: string | null;
  direction?: string | null;
  occurredAt?: Date | null;
  contactName?: string | null;
  companyName?: string | null;
}): string {
  const parts = [];
  if (activity.activityType) parts.push(activity.activityType.replace(/_/g, " "));
  if (activity.contactName) parts.push(`with ${activity.contactName}`);
  if (activity.companyName) parts.push(`at ${activity.companyName}`);
  if (activity.summary) parts.push(activity.summary);
  if (activity.occurredAt) parts.push(`on ${activity.occurredAt.toISOString().split("T")[0]}`);
  if (activity.rawContent) parts.push(activity.rawContent.slice(0, 2000));
  return parts.join(". ");
}

export function dealToText(deal: {
  name: string;
  stage?: string | null;
  value?: number | null;
  currency?: string | null;
  expectedCloseDate?: Date | null;
  summary?: string | null;
  companyName?: string | null;
  contactName?: string | null;
}): string {
  const parts = [deal.name];
  if (deal.companyName) parts.push(`Company: ${deal.companyName}`);
  if (deal.contactName) parts.push(`Contact: ${deal.contactName}`);
  if (deal.stage) parts.push(`Stage: ${deal.stage}`);
  if (deal.value) parts.push(`Value: ${deal.currency || "USD"} ${deal.value.toLocaleString()}`);
  if (deal.expectedCloseDate) parts.push(`Expected close: ${deal.expectedCloseDate.toISOString().split("T")[0]}`);
  if (deal.summary) parts.push(deal.summary);
  return parts.join(". ");
}

export function companyToText(company: {
  name: string;
  domain?: string | null;
  industry?: string | null;
  revenue?: string | null;
  size?: string | null;
  description?: string | null;
}): string {
  const parts = [company.name];
  if (company.domain) parts.push(`Domain: ${company.domain}`);
  if (company.industry) parts.push(`Industry: ${company.industry}`);
  if (company.revenue) parts.push(`Revenue: ${company.revenue}`);
  if (company.size) parts.push(`Size: ${company.size}`);
  if (company.description) parts.push(company.description);
  return parts.join(". ");
}
