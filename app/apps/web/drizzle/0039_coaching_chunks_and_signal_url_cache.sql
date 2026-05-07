-- MONACO-PARITY-05 + MONACO-PARITY-01 — coaching transcript chunks and signal URL cache.
--
-- Hand-written because drizzle-kit doesn't generate pgvector columns
-- natively. Idempotent (every CREATE uses IF NOT EXISTS) so re-running
-- in an environment where it was partially applied is safe.

-- Ensure the vector extension is available. The embeddings table
-- already relies on it via ensure-vector-index.ts at runtime; we
-- declare it here too so this migration is self-contained when
-- applied against a fresh DB.
CREATE EXTENSION IF NOT EXISTS vector;

-- ────────────────────────────────────────────────────────────────
-- transcript_chunks (MONACO-PARITY-05)
-- ────────────────────────────────────────────────────────────────
-- Stores embedded slices of meeting transcripts for RAG retrieval.
-- One row per (meeting, chunk). The chunking helper in
-- lib/coaching/chunk-transcript.ts generates the rows; the embedding
-- job in inngest/transcript-chunk-and-embed.ts populates `embedding`.
--
-- Why a dedicated table (vs reusing `embeddings`):
--  - Need start/end seconds + speaker per chunk for time-stamped
--    citations. The general-purpose embeddings table has no such
--    columns and adding them there would couple unrelated content
--    types.
--  - Cascade delete tied to the meeting id keeps storage bounded —
--    when a meeting is deleted, its chunks evaporate.
CREATE TABLE IF NOT EXISTS transcript_chunks (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id    text NOT NULL,
  meeting_id   text NOT NULL,
  speaker      text,
  start_sec    integer NOT NULL,
  end_sec      integer NOT NULL,
  text         text NOT NULL,
  embedding    vector(1536) NOT NULL,
  -- Source tag — "recall_bot" | "manual_paste" | "zoom_native" | etc.
  -- Lets us filter retrieval by quality tier (native > bot > paste).
  source       text NOT NULL DEFAULT 'unknown',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transcript_chunks_meeting_idx
  ON transcript_chunks (meeting_id);

CREATE INDEX IF NOT EXISTS transcript_chunks_tenant_idx
  ON transcript_chunks (tenant_id);

-- HNSW index for cosine-similarity ANN. Same params as the existing
-- embeddings index (m=16, ef_construction=64) — proven to give exact-
-- quality results without probe tuning. Recall is what matters here:
-- a missed chunk is a missed citation, which the system prompt then
-- forces us to answer "no evidence in transcript" — false negatives
-- are worse than false positives at retrieval time.
CREATE INDEX IF NOT EXISTS transcript_chunks_embedding_idx
  ON transcript_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ────────────────────────────────────────────────────────────────
-- signal_url_cache (MONACO-PARITY-01)
-- ────────────────────────────────────────────────────────────────
-- Caches HEAD-check outcomes so each candidate URL is verified at
-- most once per cache window. Without this, regenerating a TAM with
-- 200 signals re-fires 200 outbound HEADs even when most URLs were
-- verified yesterday.
--
-- Eviction is handled by `inngest/signal-url-cache-evict.ts` (daily).
CREATE TABLE IF NOT EXISTS signal_url_cache (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  -- Normalized URL: lowercased host, no fragment, no tracking params.
  -- The verifier helper does the normalization before lookup.
  url         text NOT NULL UNIQUE,
  -- Last HTTP status (or sentinel: -1 = timeout, -2 = DNS fail,
  -- -3 = malformed at parse, -4 = blocked-private-ip).
  status      integer NOT NULL,
  -- "verified" | "unverified" — final classification stored alongside
  -- raw status so the verifier doesn't need to re-derive on lookup.
  outcome     text NOT NULL,
  -- Why we landed on `outcome`. Free string for observability —
  -- "ok", "blocked_cdn", "http_404", "timeout", "fetch_error:...".
  reason      text NOT NULL,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS signal_url_cache_expires_idx
  ON signal_url_cache (expires_at);
