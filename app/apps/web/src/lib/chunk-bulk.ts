/**
 * Chunked bulk POST helper.
 *
 * Server-side bulk handlers (e.g. `/api/enrich`, `/api/signals`) silently
 * cap the payload at 20 ids per call — a vestige of early Apollo/AI
 * rate-limit concerns. When the UI sent 100 ids, only the first 20 were
 * processed and the user had no idea. This helper fans the call out
 * client-side in chunks of `chunkSize` (default 20) and reports
 * per-chunk progress so the UX never lies about how much was done.
 *
 * Errors are collected rather than thrown: a partial failure reports
 * how many ids made it through and which chunks failed, so the caller
 * can surface a "succeeded X, N chunks failed" toast instead of a
 * hard-stop on the first bad response.
 */

export interface ChunkBulkOptions {
  ids: string[];
  chunkSize?: number;
  endpoint: string;
  /** Build the request payload for a given chunk of ids. */
  buildPayload: (chunk: string[]) => Record<string, unknown>;
  /** Called after every chunk resolves (success OR failure). `done` is cumulative. */
  onProgress?: (done: number, total: number) => void;
}

export interface ChunkBulkError {
  /** Zero-based chunk index in submission order. */
  chunkIndex: number;
  /** IDs that belong to the failed chunk (so caller can retry or mark). */
  ids: string[];
  /** Non-2xx HTTP status, or `null` when the fetch itself threw. */
  status: number | null;
  /** The underlying error for network/parse failures. */
  err?: unknown;
}

export interface ChunkBulkResult {
  /** Total ids submitted (equals `ids.length`). */
  total: number;
  /** Number of ids in successful chunks. */
  succeeded: number;
  /** Number of ids in failed chunks. */
  failed: number;
  errors: ChunkBulkError[];
}

export async function chunkedBulkCall({
  ids,
  chunkSize = 20,
  endpoint,
  buildPayload,
  onProgress,
}: ChunkBulkOptions): Promise<ChunkBulkResult> {
  if (chunkSize < 1) throw new Error("chunkSize must be ≥ 1");

  const total = ids.length;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  let done = 0;
  let succeeded = 0;
  const errors: ChunkBulkError[] = [];

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(chunk)),
      });
      if (res.ok) {
        succeeded += chunk.length;
      } else {
        errors.push({ chunkIndex, ids: chunk, status: res.status });
      }
    } catch (err) {
      errors.push({ chunkIndex, ids: chunk, status: null, err });
    }
    done += chunk.length;
    onProgress?.(done, total);
  }

  return {
    total,
    succeeded,
    failed: total - succeeded,
    errors,
  };
}
