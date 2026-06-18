-- Knowledge stages: organise tenant Knowledge by the product moment that
-- CONSUMES it (sourcing, cold_call, outreach, objections, meetings, global)
-- instead of topic alone. Additive; empty array means "derive from
-- category/title" (lib/knowledge/stages.ts) so existing entries keep working.
ALTER TABLE knowledge_entries
  ADD COLUMN IF NOT EXISTS stages text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS knowledge_entries_stages_idx
  ON knowledge_entries USING gin (stages);
