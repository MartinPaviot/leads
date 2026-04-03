/**
 * Next.js instrumentation hook — runs once on server startup.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only run on the server (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Ensure pgvector HNSW index exists (idempotent, safe to run multiple times)
    try {
      const { ensureVectorIndex } = await import("@/db/ensure-vector-index");
      await ensureVectorIndex();
    } catch (err) {
      console.warn("Vector index setup skipped:", err instanceof Error ? err.message : err);
    }
  }
}
