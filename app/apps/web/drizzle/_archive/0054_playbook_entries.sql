-- Playbook entries (B4, _specs/pilae-machine/spec-v2.md R11.2).
--
-- After every conversation (call, meeting, reply), the team captures
-- the objections heard, the accroches that landed, the questions
-- worth asking next time. This table is the long-term home for those
-- learnings. The `playbook-capture-post-call.ts` Inngest fn handles
-- the extraction (LLM over a transcript or note), validates via
-- `lib/playbook/capture.ts`, and inserts the survivors here.
--
-- The dashboard "Playbook" tab reads from this table, and the
-- message-generation prompt pulls the top-scoring entries as
-- exemplars for the LLM. `perf_score` lets the team rank what
-- actually moves deals.
--
-- Idempotent. Hand-crafted (drizzle-kit journal stuck at 0014).

CREATE TABLE IF NOT EXISTS playbook_entries (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type               TEXT NOT NULL,
  content            TEXT NOT NULL,
  source_activity_id TEXT REFERENCES activities(id),
  outcome_label      TEXT,
  perf_score         REAL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS playbook_entries_tenant_type_idx
  ON playbook_entries (tenant_id, type);
CREATE INDEX IF NOT EXISTS playbook_entries_source_idx
  ON playbook_entries (source_activity_id);
CREATE INDEX IF NOT EXISTS playbook_entries_perf_idx
  ON playbook_entries (tenant_id, perf_score);
