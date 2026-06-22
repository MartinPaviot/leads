# P1-10 — apollo-enrichment — Verification (2026-06-22)

Branch `feat/agentic-p1`. Apollo/registry firmographics (the EXISTING
company-enrichment waterfall) now feed the P1-9 research agent via its
`enrichApollo` tool slot. Deploy-safe: no schema change, no migration.

## What shipped (deploy-safe core)
- `sources/apollo-enrich.ts`: `enrichFirmographics({domain, companyName, tenantId})`
  wraps `enrichCompany` (waterfall: Apollo tier 10 → registries → LLM), returns
  clean `FirmographicFacts` (NO `raw`) + firmographic-only `FieldProvenance`. Null
  on no-domain / not-enriched. Never throws (the waterfall doesn't).
- `pickFirmographics`: projects EnrichedCompany → the 14-field subset, drops raw.
- `build-intelligence-brief.ts`: passes `enrichApollo` to `runResearchAgent`, so the
  agent can pull funding/headcount/investors and fold them into the synthesized
  brief. Gated by `RESEARCH_AGENT_ENABLED` (off by default → 0 Apollo credits).

## Tests (4, green) + tsc 0
- null domain → null no-call; not-enriched → null; enriched → clean facts (no raw)
  + firmographic-only provenance + tenant passed; pickFirmographics drops raw,
  defaults arrays. `enrichCompany` signature validated by tsc.

## Deferred (migration-coupled — the spec's richer path)
The spec's Fix 1-7 persist `firmographics` + `firmographic_provenance` as two new
`intelligence_briefs` jsonb COLUMNS and render a `FIRMOGRAPHICS (verified)` prompt
section with `[source: apollo]` citations. That needs a migration — and adding the
columns to the Drizzle schema makes EVERY brief SELECT reference them, 500-ing
until migrated (prod schema-behind hazard). Deferred to P1-10b: apply
`ADD COLUMN IF NOT EXISTS firmographics / firmographic_provenance` on dev
(`db:push`) + the column read/write/render + the [source] citations (which also
feed P1-11). The agent-tool path above delivers the enrichment deploy-safe today.
