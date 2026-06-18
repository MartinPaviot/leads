# INBOX-R04 — Attachments: list, inline preview, download
> Theme: T1 · Autonomy rung: passive · Priority: P0
> Pillar: P1 fidelity

## User story
As a user reading mail, I want to see an email's attachments — listed with type/size, previewable
inline for common formats, and downloadable — so I never have to fall back to Gmail to open a PDF
or image someone sent me.

## Why (audit anchor)
Attachments are core mailbox fidelity; Superhuman has a Downloads workflow setting and renders
attachments (`feature-inventory.md` → Workflow › Downloads; `findings.md` §C — demo data was
plain so rich attachments weren't observable, but the surface exists). Today our capture discards
non-text/HTML parts entirely (`imap.ts` parses with `mailparser` but only reads `parsed.text`/
`parsed.html` at `:124`; `parsed.attachments` is never persisted) and the pane has no attachment
UI. This blocks `cid:` inline images (INBOX-R02), attachment summarization (INBOX-S07) and
attachment search (INBOX-Q03). This spec persists + surfaces attachments.

## Requirements (EARS)
- WHEN an email has attachments, the system SHALL persist each part's metadata (filename, MIME
  type, size, `contentId` for inline) at capture, and store the bytes in object storage (not the DB row).
- The system SHALL list attachments in the reading pane with filename, a type-appropriate icon, and
  human-readable size.
- WHEN an attachment is a previewable type (PDF, common images, plain text), the system SHALL offer an
  inline preview without forcing a download.
- The system SHALL offer a download for every attachment via a first-party, scope-checked URL.
- The system SHALL distinguish inline (`cid:`-referenced) parts from true attachments, hiding inline
  signature/logo parts from the attachment list (they render in-body via INBOX-R02).
- The system SHALL cap stored attachment size and count per message, and skip/flag oversize parts
  rather than failing the whole capture.
- The system SHALL serve and preview attachments only to users allowed to read the message
  (per-user/tenant scope), via signed, short-lived URLs.
- The system SHALL never execute attachment content (no inline HTML/SVG-as-active, no auto-open of
  executables).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an email with a 1.2 MB PDF WHEN opened THEN the pane lists "report.pdf · 1.2 MB" with a file
  icon and a Preview + Download action.
- GIVEN the user clicks Preview on the PDF WHEN it opens THEN it renders inline (no forced download).
- GIVEN an email with an inline signature logo (`cid:`) and a real PDF attachment WHEN opened THEN
  only the PDF appears in the attachment list (the logo renders in-body, INBOX-R02).
- GIVEN an attachment download WHEN requested by a user NOT allowed to read the message THEN the
  request is denied (scope check).
- GIVEN an `.exe`/`.scr` attachment WHEN listed THEN it shows download-only with a caution, never
  inline-previewed or auto-run.
- GIVEN a 40 MB attachment over the cap WHEN captured THEN it is flagged "too large to store" with no
  capture failure.

## Edge cases & failure handling
- Filename collisions / missing filename → derive a safe name from type; never trust the raw filename
  for the storage key (path-traversal safe).
- Encrypted/corrupt part → list it, mark "couldn't read", offer raw download only.
- `Content-Disposition: inline` images with no `cid` → treat as inline body image (INBOX-R02), not a
  list item.
- SVG attachments → never render inline as active markup (sanitize or download-only).
- Storage write fails → capture the email anyway (text/HTML), mark attachment unavailable.
- Multi-tenant: storage keys namespaced by tenant; signed URLs validate reader scope.

## Best-in-class bar
- Inline preview for PDFs/images/text with **no forced download** and a **first-party scoped URL**
  (no third-party viewer, no leak) — matches Gmail's convenience while keeping bytes on sovereign
  storage (Pilae-friendly), which a US-SaaS client can't promise.
- Attachments become **searchable + summarizable** (feeds INBOX-Q03/S07) because we persist them as
  first-class objects, not just render-and-forget.

## Design sketch
- **Data:** new `email_attachments` table (`tenant_id, activity_id, message_id, filename, mime,
  size_bytes, content_id, storage_key, is_inline, status`) keyed to the captured activity. Bytes in
  object storage (the existing blob/storage layer — VERIFY which the repo uses). Migration required.
- **Transport/capture:** `imap.ts` already has `parsed.attachments` from `mailparser` — persist them;
  Gmail path fetches attachment parts by id. Extend `SyncedEmail` + `InboundEmailInput` with an
  `attachments[]` descriptor; `captureInboundEmail` writes rows + uploads bytes (with caps).
- **API:** `GET /api/inbox/attachments/:id` (download, scope-checked, signed) and a preview variant
  (range-served for PDF). Reuse the proxy/scope pattern from INBOX-R02.
- **UI:** an attachment strip below the message body in `_conversation-pane.tsx` / `_email-body.tsx`:
  chips with `Paperclip`, type icons (`FileText` PDF, `Image`, `File`), size; `Download`/`Eye`
  (preview) actions. Tokens: chip `--color-bg-card`, border `--color-border-default`, text
  `--color-text-secondary`, hover `--color-bg-hover`, accent `--color-accent` for actions. Keyboard:
  attachments focusable; Enter previews, `d` downloads the focused one. Light+dark via tokens, no
  emoji, no provider name, cited.
- **Security/perf:** size/count caps; path-safe storage keys; signed short-lived URLs; no inline
  active content; lazy-fetch previews.

## Tasks (ordered)
1. `email_attachments` schema + migration. (verify: migration applies) (test: schema present)
2. Persist attachments at capture (IMAP `parsed.attachments`; Gmail part fetch) with caps + storage
   upload. (verify: rows + bytes for a fixture) (test: `email-capture.test.ts` attachments)
3. `GET /api/inbox/attachments/:id` download + preview, scope-checked + signed. (verify: serves to
   allowed user, denies others) (test: route test)
4. Attachment strip UI + inline/`cid:` distinction. (verify: browser — PDF lists with preview/download,
   inline logo excluded) (test: list render)

## Current-state notes (VERIFY before building)
- `imap.ts:124` reads only text/HTML; `parsed.attachments` (from `simpleParser`) is **never
  persisted** — the bytes exist at parse time and are dropped.
- `SyncedEmail` (`gmail.ts:61`) + `InboundEmailInput` (`email-capture.ts:79`) have no attachment field.
- No `email_attachments` table and no attachment route exist (`_CODEBASE-NOTES.md` schema list).
- Object-storage helper: VERIFY which the repo uses (blob layer) before choosing the storage key scheme.
- Depends on INBOX-R13 (parts retained at ingestion) and feeds INBOX-R02 (`cid:`), S07, Q03.
