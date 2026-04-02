/**
 * Ensure pgvector index exists on embeddings table.
 * Called on app startup or via API. Safe to run multiple times.
 */
import postgres from "postgres";

export async function ensureVectorIndex(): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL!);

  try {
    // Ensure the embeddings table exists with proper schema
    await sql`
      CREATE TABLE IF NOT EXISTS embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(entity_type, entity_id)
      )
    `;

    // Create IVFFlat index for fast cosine similarity search
    // Only create if it doesn't already exist
    const indexExists = await sql`
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'embeddings_embedding_idx'
    `;

    if (indexExists.length === 0) {
      // IVFFlat requires lists parameter. For < 1M rows, lists = rows / 1000 (min 1)
      const [countResult] = await sql`SELECT count(*)::int as cnt FROM embeddings`;
      const count = countResult?.cnt ?? 0;
      const lists = Math.max(1, Math.min(100, Math.floor(count / 1000)));

      if (count > 0) {
        await sql`
          CREATE INDEX embeddings_embedding_idx
          ON embeddings
          USING ivfflat (embedding vector_cosine_ops)
          WITH (lists = ${lists})
        `;
        console.log(`Created IVFFlat index on embeddings with ${lists} lists (${count} rows)`);
      } else {
        // For empty tables, create HNSW index instead (no training needed)
        await sql`
          CREATE INDEX embeddings_embedding_idx
          ON embeddings
          USING hnsw (embedding vector_cosine_ops)
        `;
        console.log("Created HNSW index on embeddings (empty table)");
      }
    }

    // Also create tenant_id index for filtered searches
    const tenantIndexExists = await sql`
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'embeddings_tenant_id_idx'
    `;

    if (tenantIndexExists.length === 0) {
      await sql`
        CREATE INDEX embeddings_tenant_id_idx ON embeddings (tenant_id)
      `;
      console.log("Created tenant_id index on embeddings");
    }
  } catch (error) {
    // Don't crash if index creation fails — it's an optimization
    console.warn("Vector index setup:", error instanceof Error ? error.message : error);
  } finally {
    await sql.end();
  }
}
