/**
 * Schema for MONACO-PARITY-05 (transcript_chunks) and
 * MONACO-PARITY-01 (signal_url_cache).
 *
 * Drizzle doesn't ship a native pgvector column type. We declare the
 * `embedding` column as plain `text` here for ORM-typed reads/writes
 * of metadata; vector inserts and ANN queries go through raw SQL via
 * the `postgres` driver (same pattern as `ensure-vector-index.ts`).
 *
 * The actual `vector(1536)` column lives on disk — created by the
 * SQL migration `drizzle/0039_coaching_chunks_and_signal_url_cache.sql`
 * and idempotently re-asserted at runtime by
 * `src/db/ensure-coaching-tables.ts`.
 */

import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";

// ── transcript_chunks ─────────────────────────────────────────
export const transcriptChunks = pgTable(
  "transcript_chunks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull(),
    meetingId: text("meeting_id").notNull(),
    speaker: text("speaker"),
    startSec: integer("start_sec").notNull(),
    endSec: integer("end_sec").notNull(),
    text: text("text").notNull(),
    /** Embedding column — declared as text here for ORM typing
     *  ergonomics. The DB column is `vector(1536) NOT NULL`. Insert
     *  via raw SQL, never via drizzle's `.values()`. */
    embedding: text("embedding").notNull(),
    /** "recall_bot" | "manual_paste" | "zoom_native" | etc. */
    source: text("source").notNull().default("unknown"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("transcript_chunks_meeting_idx").on(table.meetingId),
    index("transcript_chunks_tenant_idx").on(table.tenantId),
  ],
);

// ── signal_url_cache ──────────────────────────────────────────
export const signalUrlCache = pgTable(
  "signal_url_cache",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Normalised URL (lowercased host, no fragment, tracking params
     *  stripped). The verifier helper canonicalises before lookup. */
    url: text("url").notNull().unique(),
    /** Raw HTTP status, or sentinel: -1=timeout, -2=DNS, -3=malformed,
     *  -4=blocked-private-ip. */
    status: integer("status").notNull(),
    /** "verified" | "unverified" — final verdict. */
    outcome: text("outcome").notNull(),
    /** Free-form reason: "ok", "blocked_cdn", "http_404", "timeout",
     *  "fetch_error:...". For observability. */
    reason: text("reason").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("signal_url_cache_expires_idx").on(table.expiresAt)],
);
