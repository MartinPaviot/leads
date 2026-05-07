-- P0-2 follow-up — add `subnet_hash` to `visits` so the dedup
-- helper's /24-subnet match path can light up.
--
-- The dedup window currently matches only by exact `ip_hash`. Many
-- offices NAT through a small pool — same office, two visits, two
-- different IPs (and so two different hashes), two paid lookups
-- where one would suffice. Hashing the /24 subnet (server-side, in
-- the same SHA-256 scheme as `hashIp`) lets the worker reuse the
-- prior identification when ip differs but subnet matches.
--
-- Privacy : same posture as ip_hash. The /24 subnet is firmographic
-- (corporate IP block), not personal. We never store raw IPs.
--
-- Backfill : NULL on existing rows. The pixel endpoint
-- (`record-visitor.ts`) populates the column on every new row going
-- forward ; old rows lose the dedup advantage but cost nothing
-- extra. A one-shot backfill script is documented in the RUNBOOK
-- when ops decide a paid recompute is worth it (typically not — the
-- 7-day rolling dedup window means stale rows roll off naturally).

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS subnet_hash TEXT;

CREATE INDEX IF NOT EXISTS visits_subnet_hash_idx
  ON visits (tenant_id, subnet_hash)
  WHERE subnet_hash IS NOT NULL;
