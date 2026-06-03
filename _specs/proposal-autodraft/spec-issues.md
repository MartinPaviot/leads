# Proposal Auto-Draft — spec issues / deviations

## SI-1: DOCX extraction uses a zero-dependency OOXML reader, not `mammoth`
PROPOSAL-001 design named `mammoth` for DOCX text extraction. This build
environment has no network egress (cannot `pnpm add mammoth`) and the build
must be verifiable here. A `.docx` is a ZIP of OOXML; extracting text + a
heading outline needs only Node's `zlib` (DEFLATE) + central-directory parsing
+ a WordprocessingML scan. Implemented zero-dependency in
`src/lib/proposals/ooxml.ts`, behind the unchanged `extractDocx()` interface
(`ingest-docx.ts`), and unit-tested with generated STORE + DEFLATE fixtures.

Impact: none on the contract. `mammoth` (or any richer extractor) can replace
the impl later without touching callers if we need table structure or styled
HTML. The detector only needs text + headings, which the zero-dep reader
provides deterministically.

## SI-2: `db:migrate:apply` not run in-sandbox (no DATABASE_URL)
The migration `drizzle/0059_proposal_templates.sql` is hand-written and
idempotent (CREATE TABLE/INDEX IF NOT EXISTS), matching the manual-migration
convention the custom runner expects. It is NOT applied here (vitest passes
only ANTHROPIC_*/OPENAI_* env; there is no DATABASE_URL). Apply in Martin's
environment with `pnpm -C app/apps/web db:migrate:apply` after a schema diff,
per the migration-drift guidance. Unit tests mock `@/db`, so they do not need
a live database.
