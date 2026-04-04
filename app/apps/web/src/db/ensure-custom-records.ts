/**
 * Ensure custom_records table exists for custom object storage.
 * Called on app startup. Safe to run multiple times (CREATE IF NOT EXISTS).
 */
import postgres from "postgres";

export async function ensureCustomRecordsTable(): Promise<void> {
  const sql = postgres(process.env.DATABASE_URL!);

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS custom_records (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL,
        object_type TEXT NOT NULL,
        name TEXT NOT NULL,
        properties JSONB DEFAULT '{}',
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Index for listing records by tenant + type
    const idx = await sql`
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'custom_records_tenant_type_idx'
    `;
    if (idx.length === 0) {
      await sql`
        CREATE INDEX custom_records_tenant_type_idx
        ON custom_records (tenant_id, object_type)
      `;
      console.log("Created index custom_records_tenant_type_idx");
    }

    // Index for single-record lookups
    const idx2 = await sql`
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'custom_records_tenant_id_idx'
    `;
    if (idx2.length === 0) {
      await sql`
        CREATE INDEX custom_records_tenant_id_idx
        ON custom_records (tenant_id, id)
      `;
      console.log("Created index custom_records_tenant_id_idx");
    }
  } catch (error) {
    console.warn(
      "Custom records table setup:",
      error instanceof Error ? error.message : error
    );
  } finally {
    await sql.end();
  }
}
