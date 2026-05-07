/**
 * Idempotent runtime creation of coaching + signal-cache tables.
 *
 * Mirrors `ensure-vector-index.ts`. The hand-written migration
 * `drizzle/0039_coaching_chunks_and_signal_url_cache.sql` covers
 * fresh production environments; this function makes dev-server
 * startup work without an explicit migration step (matters for the
 * speed-of-iteration the team values) and also serves as a safety
 * net in any environment where the migration didn't run.
 *
 * Safe to call repeatedly. Errors are logged and swallowed so a
 * partial setup never crashes the app — the affected feature
 * (coaching RAG, URL cache) just degrades gracefully.
 */

import postgres from "postgres";

export async function ensureCoachingTables(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const sql = postgres(process.env.DATABASE_URL);

  try {
    // pgvector — already needed by the existing `embeddings` table
    // but assert here too in case this runs before ensureVectorIndex.
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;

    // ── transcript_chunks ──────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS transcript_chunks (
        id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id    text NOT NULL,
        meeting_id   text NOT NULL,
        speaker      text,
        start_sec    integer NOT NULL,
        end_sec      integer NOT NULL,
        text         text NOT NULL,
        embedding    vector(1536) NOT NULL,
        source       text NOT NULL DEFAULT 'unknown',
        created_at   timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS transcript_chunks_meeting_idx ON transcript_chunks (meeting_id)`;
    await sql`CREATE INDEX IF NOT EXISTS transcript_chunks_tenant_idx ON transcript_chunks (tenant_id)`;

    const hnswExists = await sql`
      SELECT 1 FROM pg_indexes WHERE indexname = 'transcript_chunks_embedding_idx'
    `;
    if (hnswExists.length === 0) {
      await sql`
        CREATE INDEX transcript_chunks_embedding_idx
        ON transcript_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `;
    }

    // ── signal_url_cache ────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS signal_url_cache (
        id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        url         text NOT NULL UNIQUE,
        status      integer NOT NULL,
        outcome     text NOT NULL,
        reason      text NOT NULL,
        checked_at  timestamptz NOT NULL DEFAULT now(),
        expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days')
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS signal_url_cache_expires_idx ON signal_url_cache (expires_at)`;

    // ── onboarding_progress (MONACO-PARITY-03) ─────────────
    await sql`
      CREATE TABLE IF NOT EXISTS onboarding_progress (
        id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id         text NOT NULL,
        current_phase     integer NOT NULL DEFAULT 1,
        completed_phases  jsonb NOT NULL DEFAULT '[]'::jsonb,
        phase_data        jsonb NOT NULL DEFAULT '{}'::jsonb,
        checklist_state   jsonb NOT NULL DEFAULT '{}'::jsonb,
        started_at        timestamptz NOT NULL DEFAULT now(),
        completed_at      timestamptz,
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS onboarding_progress_tenant_idx ON onboarding_progress (tenant_id)`;

    // ── visits (MONACO-PARITY-04) ──────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS visits (
        id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id       text NOT NULL,
        visitor_id      text NOT NULL,
        ip_hash         text NOT NULL,
        url             text NOT NULL,
        referrer        text,
        utm             jsonb DEFAULT '{}'::jsonb,
        user_agent      text,
        company_domain  text,
        company_id      text,
        identified_at   timestamptz,
        identified_by   text,
        created_at      timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS visits_tenant_idx ON visits (tenant_id)`;
    await sql`CREATE INDEX IF NOT EXISTS visits_visitor_idx ON visits (visitor_id)`;
    await sql`CREATE INDEX IF NOT EXISTS visits_company_idx ON visits (company_id)`;
    await sql`CREATE INDEX IF NOT EXISTS visits_created_at_idx ON visits (created_at)`;

    // ── llm_calls (Sprint-1 audit follow-up) ───────────────
    await sql`
      CREATE TABLE IF NOT EXISTS llm_calls (
        id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id           text,
        surface_id          text NOT NULL,
        prompt_id           text NOT NULL,
        model               text NOT NULL,
        fallback_triggered  boolean NOT NULL DEFAULT false,
        attempts            integer NOT NULL DEFAULT 1,
        input_tokens        integer,
        output_tokens       integer,
        cost_usd            double precision,
        latency_ms          integer NOT NULL,
        outcome             text NOT NULL,
        error_message       text,
        metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at          timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS llm_calls_tenant_idx ON llm_calls (tenant_id)`;
    await sql`CREATE INDEX IF NOT EXISTS llm_calls_surface_idx ON llm_calls (surface_id)`;
    await sql`CREATE INDEX IF NOT EXISTS llm_calls_prompt_idx ON llm_calls (prompt_id)`;
    await sql`CREATE INDEX IF NOT EXISTS llm_calls_created_at_idx ON llm_calls (created_at)`;

    // ── eval_runs ──────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS eval_runs (
        id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        surface_id        text NOT NULL,
        prompt_id         text NOT NULL,
        cases_total       integer NOT NULL,
        cases_passed      integer NOT NULL,
        cases_errored     integer NOT NULL DEFAULT 0,
        metrics           jsonb NOT NULL DEFAULT '{}'::jsonb,
        total_latency_ms  integer NOT NULL,
        total_cost_usd    double precision,
        created_at        timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS eval_runs_surface_idx ON eval_runs (surface_id)`;
    await sql`CREATE INDEX IF NOT EXISTS eval_runs_created_at_idx ON eval_runs (created_at)`;

    // ── account_health_snapshots (Sprint-2 audit follow-up) ───
    await sql`
      CREATE TABLE IF NOT EXISTS account_health_snapshots (
        id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id                text NOT NULL,
        account_id               text NOT NULL,
        health_score             integer NOT NULL,
        components               jsonb NOT NULL,
        risk_level               text NOT NULL,
        suggested_action         text,
        suggested_action_reason  text,
        arr_exposure_usd         double precision,
        computed_at              timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS account_health_tenant_idx ON account_health_snapshots (tenant_id)`;
    await sql`CREATE INDEX IF NOT EXISTS account_health_account_idx ON account_health_snapshots (account_id)`;
    await sql`CREATE INDEX IF NOT EXISTS account_health_computed_at_idx ON account_health_snapshots (computed_at)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS account_health_account_day_idx ON account_health_snapshots (account_id, computed_at)`;

    // ── customer_requests (Sprint-3 audit follow-up) ──────────
    await sql`
      CREATE TABLE IF NOT EXISTS customer_requests (
        id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id       text NOT NULL,
        kind            text NOT NULL,
        verbatim        text NOT NULL,
        source          text NOT NULL,
        canonical_key   text,
        tenant_arr_usd  double precision,
        status          text NOT NULL DEFAULT 'open',
        metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at      timestamptz NOT NULL DEFAULT now(),
        created_at      timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS customer_requests_tenant_idx ON customer_requests (tenant_id)`;
    await sql`CREATE INDEX IF NOT EXISTS customer_requests_status_idx ON customer_requests (status)`;
    await sql`CREATE INDEX IF NOT EXISTS customer_requests_canonical_idx ON customer_requests (canonical_key)`;
    await sql`CREATE INDEX IF NOT EXISTS customer_requests_created_at_idx ON customer_requests (created_at)`;
  } catch (error) {
    // Don't crash the app — these are optimisations / new features.
    console.warn(
      "[ensureCoachingTables] setup error:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    await sql.end();
  }
}
