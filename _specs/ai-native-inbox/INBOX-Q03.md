# INBOX-Q03 — Search over attachments
> Theme: T5 · Autonomy rung: helper · Priority: P1
> Pillar: P2 reading / P5 GTM moat

## User story
As a user, I want to search the *contents* of the files people emailed me ("the proposal PDF that
mentioned a 12-month term", "the spreadsheet with the headcount") and find the attachment and its
thread — so a contract clause or a number buried in an attachment is as findable as the email body.

## Why (audit anchor)
Shortwave's Ask-AI searches over **all team mail and attachments** (audit §3) — attachments are
first-class search targets, not dead weights. Superhuman surfaces attachments but search is on the
message, not the file's contents. We currently **do not persist inbound attachments at all** (the
IMAP/Gmail capture stores only `text || html` and metadata — `imap.ts:124`; attachment handling in
our codebase exists only on the *outbound/send* side: `gmail.ts`, `smtp-send.ts`, `ics.ts`). So
this spec depends on first *retaining* inbound attachments (INBOX-R04), then extracting + embedding
their text into the same retrieval engine we already run.

## Requirements (EARS)
- The system SHALL persist inbound email attachments at capture (file bytes in object storage +
  a row per attachment), as a dependency satisfied by INBOX-R04 / INBOX-R13.
- The system SHALL extract searchable text from supported attachment types (PDF, DOCX, XLSX, CSV,
  TXT, common images via OCR where enabled) and embed it into `embeddings` with
  `entity_type='attachment'` (reusing `embedEntity`, `lib/ai/embeddings.ts:23`).
- WHEN the user searches (INBOX-Q01) or asks (INBOX-Q02), the system SHALL include attachment
  matches and SHALL render each as the attachment (filename + type + size) linked to its parent
  message/thread, with the matched passage as the snippet.
- The system SHALL scope attachment results to the viewer's mailbox + tenant (the parent message's
  scope governs the attachment).
- The system SHALL never execute or preview an attachment unsafely; search returns metadata + text,
  and any preview goes through the safe-render path (INBOX-R04).
- WHEN an attachment type is unsupported or extraction failed, the system SHALL still index its
  filename + MIME for name-based matching and SHALL mark its contents "not indexed", never silently
  dropping the file from results.
- The system SHALL cap extracted text per attachment (reuse the `embedEntity` 6,000-char head+tail
  truncation, `embeddings.ts:34`) and SHALL not block capture on extraction (extract async).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a PDF attachment containing "12-month term" WHEN the user searches "twelve month contract"
  THEN the attachment surfaces, linked to its email, with the clause as the snippet.
- GIVEN an XLSX with a "Headcount" column WHEN the user asks "the spreadsheet with headcount" THEN
  the file is found and cited to its thread.
- GIVEN a teammate received that PDF (different mailbox) WHEN I search THEN it does not appear.
- GIVEN a password-protected / corrupt PDF WHEN indexed THEN it is filename-searchable and marked
  "contents not indexed", and extraction failure does not break capture of the email.
- GIVEN a 30 MB attachment WHEN captured THEN text extraction runs async and the email is available
  immediately; the attachment becomes searchable once extraction completes.
- GIVEN an image attachment with OCR disabled WHEN searched THEN only filename/type match; with OCR
  enabled, extracted text matches too.

## Edge cases & failure handling
- Encrypted/DRM/corrupt files → catch extraction errors, index filename only, flag unindexed.
- Huge or zip/archive attachments → index filename + type; do not recursively unpack by default
  (flag as an ocean if deep unpack is wanted).
- Duplicate attachments across threads (same file emailed twice) → dedupe by content hash for
  storage; keep per-message rows so each thread links correctly.
- Provider attachment fetch fails (Gmail/IMAP) → retain the email, mark attachment "unavailable",
  retry on next sync.
- PII in attachments → same tenant/mailbox scope as mail; zero-retention AI option (INBOX-P03)
  must also cover attachment text sent to the embedder.
- Storage residency → object storage must honor EU/CH residency for sovereign tenants (INBOX-P04).

## Best-in-class bar
- Attachment **contents** flow into the *same* hybrid retrieval engine as mail + CRM, so "find the
  clause" and "what did the deal's proposal say" are answerable in one place with citations —
  Shortwave searches attachments but isn't grounded in a deal graph; Superhuman doesn't search
  contents at all.
- **Sovereign-safe**: extraction + embedding run on self-hostable infra with a zero-retention
  option and EU/CH residency — a class of customer (Pilae) the US incumbents can't serve.

## Design sketch
- **Data:** new `email_attachments(id, tenant_id, mailbox_id, activity_id|message_id, filename,
  mime_type, size_bytes, storage_key, content_hash, text_extracted bool, extraction_status,
  created_at)` (mirror `connected_mailboxes`/`activities` tenant+mailbox columns,
  `db/schema/outbound.ts` + `core.ts`). Extracted text → `embeddings(entity_type='attachment',
  entity_id=attachmentId)`.
- **API:** extend `GET /api/inbox/search` (INBOX-Q01) to include `entity_type='attachment'` hits;
  add `GET /api/inbox/attachments/:id` (scoped fetch/preview). A worker `extract+embed attachment`
  (Inngest, like the sync/enrich passes in `inngest/sync-functions.ts`) runs post-capture.
- **UI:** attachment result chip in the search list and a thumbnail/row in the reading pane
  (filename + type icon via `lucide-react` `Paperclip`/`FileText`, size, "via Elevay" source),
  snippet = matched passage; clicking opens the safe preview (INBOX-R04). Light+dark via tokens,
  no emoji, no provider name, cited.
- **AI:** text extraction (server lib per type; OCR gated by a setting), then `embedEntity`
  (`embeddings.ts:23`); no generation in Q03 beyond the embed. Ask-AI (Q02) consumes the index.
- **Security/perf:** scope by parent message; SSRF-safe fetch of provider attachment URLs
  (`lib/infra/ssrf-guard.ts`); async extraction off the capture hot path; size caps; content-hash
  dedupe for storage.

## Tasks (ordered, each with a verify step + test to write)
1. (Dep) Land INBOX-R04/R13 attachment retention so inbound files + an `email_attachments` row
   exist. (verify: a captured email with a PDF has an attachment row + stored bytes) (test:
   `attachment-capture.test.ts`)
2. Extraction service per type (PDF/DOCX/XLSX/CSV/TXT; OCR gated). (verify: text extracted for a
   sample of each) (test: `attachment-extract.test.ts`)
3. Embed extracted text as `entity_type='attachment'`; async worker post-capture. (verify: row in
   `embeddings`) (test: `attachment-embed.test.ts`)
4. Surface attachment hits in inbox search + Ask-AI, scoped, linked to the thread. (verify: search
   "12 month term" finds the PDF in the live app) (test: `attachment-search.test.ts` incl. scope)
5. Unindexable/oversized handling (filename-only, "contents not indexed"). (verify: a corrupt PDF
   is filename-searchable + flagged) (test: extraction-failure test)

## Current-state notes (VERIFY before building)
- Inbound attachments are **not persisted today**: capture stores `text || html` + metadata only
  (`imap.ts:124`, `email-capture.ts`); there is no inbound attachment table. Attachment code in the
  repo is outbound-only (`gmail.ts`, `smtp-send.ts`, `ics.ts`). This spec is blocked on INBOX-R04.
- `embedEntity` already supports arbitrary `entity_type` + truncation (`embeddings.ts:23`), so the
  embed path is reuse; `/api/embed` would need an `attachments` scope added (`api/embed/route.ts`).
- Search/Ask layers (Q01/Q02) already exist as the consumers — only the index needs the new type.
- VERIFY object-storage availability + residency (proposals already use storage: `lib/proposals/storage.ts`).
