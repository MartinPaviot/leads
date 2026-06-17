# INBOX-S07 — Attachment summarization (PDF / doc)
> Theme: T3 · Autonomy rung: helper · Priority: P2
> Pillar: P2 reading / P5 GTM moat

## User story
As a user who gets contracts, decks and reports as attachments, I want a one-line-to-paragraph
summary of each attachment — with page/section citations — so I know what a PDF says before I open
it, and the key terms are pulled out.

## Why (audit anchor)
Shortwave's Ask-AI works over **all team mail + attachments** (audit §3); "summarize emails and
tasks" plus attachment management are in Superhuman's MCP surface (`ai-feature-deep-dive.md`).
Attachments are part of the master taxonomy (audit §2). We don't even **retain** attachments at
capture yet (rendering depends on INBOX-R04/R13). Our edge: an attachment summary **cited to its
page/section** and, for GTM docs (a signed contract, a pricing PDF), surfaced into the deal — the
Lightfield "capture every interaction" recall extended to documents.

## Requirements (EARS)
- The system SHALL summarize supported attachment types (PDF, DOCX, TXT, common slide exports) into
  a one-line headline + a short cited body, produced "via Elevay", from the attachment's extracted
  text only (no web), keyed to page/section.
- Each summary claim SHALL cite the page/section it came from; the system SHALL NOT assert content
  not present in the document.
- The system SHALL extract salient key terms where present (dates, amounts, parties, signatures)
  reusing INBOX-S05 entity extraction over the document text.
- The summary SHALL be cached per attachment (content hash) so re-opening triggers no re-extraction.
- WHEN an attachment is unsupported, encrypted, image-only/scanned without OCR, or oversized beyond
  the limit, the system SHALL say so plainly (e.g. "Can't summarize: scanned image, no text"), never
  a fabricated summary.
- The system SHALL run extraction in a sandboxed/safe parser (no macro execution, no external fetch
  from the document), per our sandbox/security posture.
- The system SHALL respect per-user/tenant scope; an attachment is summarized only for users who can
  see its message.
- WHEN zero-retention AI is enabled, extraction SHALL run without third-party document retention
  (INBOX-P03), and SHALL honor data-residency (INBOX-P04).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a 20-page PDF contract WHEN summarized THEN a headline + bullet summary appears, each bullet citing its page; key terms (parties, amount, term, signature date) are pulled out (S05).
- GIVEN a scanned image PDF with no text layer WHEN summarized THEN "Can't summarize: no extractable text" shows, no fabricated content.
- GIVEN a deck attached to a deal thread WHEN summarized THEN the summary offers "attach to deal" / "log" (INBOX-G09) where a deal exists.
- GIVEN the same attachment reopened WHEN unchanged THEN no re-extraction (content-hash cache hit).
- GIVEN an encrypted/password PDF WHEN summarized THEN "Can't summarize: protected file", no guess.
- GIVEN an oversized file beyond the cap WHEN summarized THEN a clear limit message, never a partial hallucinated summary presented as complete.
- GIVEN another user's attachment WHEN I view THEN it is never summarized for me (scope).

## Edge cases & failure handling
- Mixed text+image PDF → summarize the text layer, note "images not analyzed".
- Spreadsheet/CSV → summarize structure (sheets, headline figures) not row-by-row; mark Inferred for derived totals.
- Corrupt/truncated file → fail-closed message, never throw.
- Malicious file (macro doc, PDF with JS) → parser strips/ignores active content; summarization runs on inert extracted text only.
- Huge document (hundreds of pages) → summarize section-wise with a rolled-up headline; cite sections; say "condensed".
- Multi-tenant/user scope on every read.

## Best-in-class bar
- Attachment summaries are **page/section-cited** and feed the **deal graph** (G09) — Shortwave can answer over attachments but doesn't tie a contract's terms back to your pipeline; we do (Lightfield recall + Monaco intel).
- **Honest on the un-summarizable** (scanned/encrypted/oversized) — a clear capability boundary, never a confident hallucination of a document we couldn't read.

## Design sketch
- **Data:** depends on INBOX-R04/R13 retaining attachments at capture. Store `attachmentSummaries: [{ attachmentId, contentHash, headline, body, citations:[{page|section}], keyTerms[] }]` — either on the activity `metadata` or a small `attachment_summaries` table keyed by content hash (decide with R04's storage). Entities reuse S05.
- **API:** a sandboxed extractor (`lib/inbox/attachment-extract.ts`) using a safe PDF/DOCX text extractor (no exec), then a `generateObject` summary step; triggered in an Inngest function (`enrichment/attachment-summary-requested`) fanned out from capture when an attachment is retained, mirroring the existing extract/thread-intelligence fan-out (`inngest/sync-functions.ts:551,570`). Surface via the detail route + INBOX-Q03 (search over attachments).
- **UI:** an attachment row in the reading pane (R04) gains a "Summary" disclosure. Surface = card section, headline `text-[13px] text-[var(--color-text-primary)]`, bullets with page citations via `cited-claim.tsx`; lucide `FileText`/`Paperclip`/`ChevronDown`; key-term chips reuse S05 chips; "attach to deal" = `ArrowRight` to G09. Unsupported state via `hallucination-fallback.tsx`. Light+dark via tokens, no emoji, no provider name, cited "via Elevay".
- **AI:** model role = grounded document summarizer + entity extractor over extracted text; grounding = the document; autonomy = helper. Fail-closed on no-text/encrypted/oversized.
- **Security/perf:** sandboxed parse (no macro/JS exec, no doc-initiated network); content-hash cache; tenant+user scope; zero-retention + residency honored (P03/P04).

## Tasks (ordered, each with a verify step + test to write)
1. `lib/inbox/attachment-extract.ts` safe extractor (PDF/DOCX/TXT → text+page map; encrypted/scanned/oversized → typed failure). (verify: fixtures extract text + pages; protected/scanned → failure objects) (test: `attachment-extract.test.ts` — no exec; failure typing)
2. `enrichment/attachment-summary-requested` Inngest fn + summary schema; persist by content hash. (verify: a retained PDF gets a cited summary) (test: summary grounded-only + cache key = hash)
3. Attachment-summary disclosure UI in the pane (depends R04). (verify: browser — PDF summary with page citations; scanned PDF → honest message) (test: dom + fallback)
4. Key-term extraction (S05) + "attach to deal" (G09) wiring. (verify: contract terms pulled; deal thread offers log) (test: keyterm + gtm wiring)

## Current-state notes (VERIFY before building)
- Attachments are **not retained today** — capture keeps text/HTML only (`imap.ts:124`); this spec is **blocked on INBOX-R04 (attachments list/preview) + R13 (retain at ingestion)**. Note the dependency prominently.
- Fan-out precedent: `enrichment/email-extract-batch-requested` + `enrichment/thread-intelligence-requested` (`inngest/sync-functions.ts:551,570`) — mirror for attachments.
- Reuses INBOX-S05 (entities over doc text), feeds INBOX-Q03 (attachment search) + INBOX-G09 (log to deal). Sandbox posture per the tenant-isolation/sandbox audit memory. No attachment summarization exists today.
