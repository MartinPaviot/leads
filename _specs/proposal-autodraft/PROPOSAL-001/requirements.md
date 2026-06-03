# PROPOSAL-001: Requirements — DOCX template ingestion & component detection

## User Story
As a founder doing founder-led sales, I want to upload my Word proposal template
once and have Elevay understand its structure — which sections and fields it
contains — and let me confirm that understanding, so that Elevay can later fill the
template automatically from what it knows about each prospect.

## Scope (this increment)
Foundation only: ingest a `.docx`, extract its text/structure, detect its
components with an LLM, let the user confirm/adjust the mapping once, and persist a
reusable **mapped template**. No template mutation and no content generation yet
(that is PROPOSAL-002). PPTX/PDF are out of scope (PROPOSAL-005/006).

### Feature 1: Template upload (DOCX)
**AC1.1**: GIVEN an authenticated user on the proposals area
WHEN they upload a `.docx` file (≤ 10 MB)
THEN a `proposalTemplates` row is created, tenant-scoped, with `status='uploaded'`,
`sourceFormat='docx'`, the original filename, and the file bytes persisted via the
storage layer
AND the response returns the new template id.

**AC1.2**: GIVEN a user uploads a non-`.docx` file or a file > 10 MB
WHEN the upload is received
THEN it is rejected with a clear error (`unsupported_format` or `file_too_large`)
AND no template row is created.

**AC1.3**: GIVEN two users in different tenants
WHEN each uploads a template
THEN neither can list, read, or modify the other's template (tenant isolation).

### Feature 2: DOCX text/structure extraction
**AC2.1**: GIVEN an uploaded `.docx`
WHEN extraction runs
THEN the document's plain text and an ordered list of headings (with their text and
character offset) are extracted and stored on the template (`extractedText`,
`extractedOutline`)
AND extraction never throws on a malformed file — it degrades to `extractedText=""`
and records `extractionError`.

**AC2.2**: GIVEN a `.docx` with tables and lists
WHEN extraction runs
THEN table cell text and list item text appear in `extractedText` in document order
(so the detector can see pricing tables and bulleted scopes).

### Feature 3: LLM component detection
**AC3.1**: GIVEN a template with extracted text
WHEN detection runs
THEN the system returns a `componentMap`: an ordered list of **sections** (e.g.
Executive Summary, Scope, Pricing, Timeline, About Us) and **fields** (e.g. client
name, deal amount, date), each with a human label, a suggested placeholder token, a
suggested `dataKey` mapping to Elevay data, an anchor (heading text + offset) so a
later step can locate it, and a `required` flag.

**AC3.2**: GIVEN the document contains a section the detector cannot confidently
classify
WHEN detection runs
THEN that section is still returned with `kind='section'`, a best-effort label, and
`confidence='low'` rather than being dropped (no silent loss of document
structure).

**AC3.3**: GIVEN no LLM API key is configured
WHEN detection runs
THEN the skill returns `degraded=true` with `degradationReason='missing_required_data'`
and a `userSuggestion`, and the template stays at `status='uploaded'` (never a
fabricated map).

**AC3.4**: GIVEN detection succeeds
WHEN the result is stored
THEN the template moves to `status='detected'` and the proposed `componentMap` is
saved (not yet user-confirmed).

### Feature 4: Mark-once confirmation
**AC4.1**: GIVEN a template at `status='detected'` with a proposed `componentMap`
WHEN the user submits an edited/confirmed map (rename, reorder, add, remove, or
remap a component's `dataKey`)
THEN the confirmed map replaces the proposed map, `status` becomes `'mapped'`, and
`mappedByUserId` + `mappedAt` are recorded.

**AC4.2**: GIVEN a confirmed map
WHEN any component is missing a label or a `dataKey`
THEN the confirm request is rejected with a validation error naming the offending
component (a mapped template is always complete enough for PROPOSAL-002 to fill).

### Feature 5: Template management surface
**AC5.1**: GIVEN a user has templates
WHEN they open the proposals area
THEN they see their tenant's templates with name, format, status, and updated date,
newest first, excluding soft-deleted ones.

**AC5.2**: GIVEN the chat assistant
WHEN the user asks to list or inspect their proposal templates
THEN a tenant-scoped tool returns the templates and the detected/mapped component
map (read-only in this increment).

## Edge Cases
- Empty or text-only `.docx` (no headings) → detector returns fields only + one
  "Body" section; never errors.
- Password-protected / corrupt `.docx` → reject upload with `unreadable_docx`.
- Re-upload of the same file → creates a new template (no dedup in v1); note for
  later.
- Very long document (> 50 pages) → truncate `extractedText` fed to the LLM to a
  bounded window, record `truncated=true`.
- User confirms a map that drops every section → allowed only if at least one
  component remains; otherwise reject `empty_map`.
- Detection LLM returns malformed JSON → schema parse fails → retry once, then
  `degraded` (never persist a partial map).

## Evaluation Steps
1. Upload a real `.docx` propale template; verify a `proposalTemplates` row with
   bytes stored and `status='uploaded'`.
2. Confirm `extractedText` + `extractedOutline` are populated, tables/lists present.
3. Run detection; verify the `componentMap` lists the real sections/fields with
   sane labels, tokens, and `dataKey` suggestions; `status='detected'`.
4. Submit a confirmed map (rename one section, remove one, remap one field);
   verify persistence, `status='mapped'`, validation rejects an incomplete map.
5. Verify a second tenant cannot see or touch the template.
6. Disable the LLM key; verify detection degrades cleanly with a suggestion.
7. Ask the chat to list templates; verify tenant-scoped read-only result.
8. Run `regression.sh`; no regressions.
