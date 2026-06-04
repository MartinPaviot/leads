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

## SI-3: DOCX writer (PROPOSAL-002) — v1 fidelity envelope
`assembleFilledDocx` (zero-dep, in `ooxml.ts`) does **heading-anchored section
replacement**: it locates each component's anchor heading in `word/document.xml`,
replaces the body paragraphs under it with the filled content, and re-zips with
**every other entry untouched** (styles.xml, headers, media, tables preserved →
the template's look survives). Deliberate v1 limits:
- Components whose anchor heading can't be located are returned in `unplaced`
  (never mis-placed, never silently dropped).
- Replaced paragraphs inherit the first replaced paragraph's `pPr`/`rPr`;
  multi-line content becomes one `<w:p>` per non-empty line.
- Inline fields without their own heading, and table-internal fills, are not
  placed in v1 (they still resolve + persist + show in the review UI).
- Re-zipped with the STORE method (valid, slightly larger); CRC32 computed.
True visual fidelity must be confirmed by opening the result in Word (the live
run); the sandbox validates structure + text deterministically via fixtures.
