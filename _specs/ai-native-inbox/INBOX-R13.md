# INBOX-R13 — Capture: retain full HTML + text at ingestion
> Theme: T1 · Autonomy rung: passive · Priority: P0
> Pillar: P1 fidelity

## User story
As the system capturing inbound mail, I want to persist BOTH the plain-text and the
original HTML part of every email at ingestion, so the reading pane can render a faithful
mailbox instead of a text dump — and so every downstream feature (summaries, links, images,
attachments) has the real source to work from.

## Why (audit anchor)
This is the single root cause behind "70% of a classic mailbox, worse." `imap.ts:124` does
`const body = (parsed.text || parsed.html || "").toString()` — when a text part exists the
HTML is **thrown away at the transport**, before capture ever sees it. Gmail/Superhuman keep
the HTML; we discard it. Every other T1 spec (R01 render, R02 images, R03 links, R04
attachments, R05 quote-collapse) is impossible until the HTML survives ingestion. The audit
calls this out explicitly (`ai-native-mailbox-audit.md` §5: "capture keeps `parsed.text ||
parsed.html` (HTML discarded)").

## Requirements (EARS)
- The system SHALL capture the HTML part AND the text part of every email separately, never
  collapsing one into the other at the transport layer.
- WHEN an email has only a text part, the system SHALL persist text and leave HTML null.
- WHEN an email has only an HTML part, the system SHALL persist that HTML and derive a text
  fallback (HTML→text) so existing text-only readers keep working.
- The system SHALL persist the sanitized HTML at rest (sanitize at capture, store clean —
  via `lib/infra/sanitize-html.ts`), never raw author HTML in the database.
- The system SHALL carry the HTML through the SAME ingestion seam (`captureInboundEmail`) for
  ALL transports — IMAP poll, Gmail pull, EmailEngine webhook — so no path diverges (the
  unification invariant in `email-capture.ts`).
- The system SHALL bound stored HTML size (cap + truncate marker) so a pathological email
  cannot bloat a row unboundedly (perf tie-in INBOX-R11).
- The system SHALL be backward compatible: rows captured before this change (HTML null) MUST
  still render via the text path (INBOX-R09).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an inbound email with both text and HTML parts WHEN captured THEN the activity stores
  the sanitized HTML in `metadata.bodyHtml` AND the text in `raw_content`.
- GIVEN an HTML-only email WHEN captured THEN `metadata.bodyHtml` is populated and `raw_content`
  holds a derived text fallback (not empty).
- GIVEN a text-only email WHEN captured THEN `metadata.bodyHtml` is null and `raw_content` is the text.
- GIVEN an email whose HTML contains `<script>` WHEN captured THEN the stored `bodyHtml` has no
  `<script>` (sanitized at rest).
- GIVEN the same message arriving via webhook then cron WHEN captured twice THEN dedup holds
  (one row) and the stored HTML is identical (idempotent on `messageId`/`gmailMessageId`).
- GIVEN a 5 MB HTML email WHEN captured THEN stored HTML is capped with a truncation marker, no row error.

## Edge cases & failure handling
- Unparseable MIME → transport already `continue`s (`imap.ts:114`); no HTML, no crash.
- HTML present but sanitizer throws → store text only, log, never drop the message.
- Multipart with several HTML alternatives → keep the richest (last `text/html`).
- Inline `cid:` image references → keep the references in HTML; resolution handled by INBOX-R02/R04.
- Multi-tenant: HTML stored under the same `tenant_id`-scoped activity; no cross-tenant exposure.

## Best-in-class bar
- We sanitize **at rest** (store-clean), so even a DB dump or a future raw API can never leak
  active content — stronger than clients that store raw HTML and sanitize only on render.
- One ingestion seam means fidelity is uniform across Gmail/IMAP/webhook — no "renders in Gmail
  account but not the Zimbra one" class of bug (the sovereignty path is first-class, not a port).

## Design sketch
- **Data:** add HTML to the captured activity's `metadata` JSONB (`activities.metadata.bodyHtml`,
  `db/schema/core.ts`) — no migration (JSONB). `raw_content` stays the text SSOT. Cap length.
- **API/transport:** extend `SyncedEmail` (`gmail.ts:61`) with `bodyHtml: string | null`. In
  `imap.ts:124` stop collapsing: set `body = parsed.text ?? htmlToText(parsed.html)` and
  `bodyHtml = parsed.html ?? null`. Gmail fetch path: populate `bodyHtml` from the HTML MIME part.
  Thread `bodyHtml` into `InboundEmailInput` + `captureInboundEmail` (`email-capture.ts:79`,
  `:362` metadata block), sanitize via `sanitizeHtml` before store.
- **UI:** none here (R13 is capture-only); R01 consumes `metadata.bodyHtml`.
- **AI:** none.
- **Security/perf:** sanitize at rest; cap stored HTML (e.g. 512 KB) with a marker; htmlToText
  derivation is pure + cheap.

## Tasks (ordered)
1. Add `bodyHtml` to `SyncedEmail` (`gmail.ts:61`) + populate in the Gmail fetch path. (verify:
   unit on a fixture with HTML) (test: gmail-shape test)
2. Fix `imap.ts:124` to keep HTML separately + derive text fallback; add `htmlToText` helper.
   (verify: IMAP fixture yields both fields) (test: `imap.test.ts` text+html, html-only, text-only)
3. Thread `bodyHtml` through `InboundEmailInput` + store sanitized into `metadata.bodyHtml`
   (`email-capture.ts:362`), with size cap. (verify: captured activity has clean HTML) (test:
   `email-capture.test.ts` — script stripped, cap applied, dedup identical)
4. Backward-compat read: confirm a null-HTML legacy row still loads (INBOX-R09). (verify: load test)

## Current-state notes (VERIFY before building — code moves)
- `imap.ts:124` `const body = (parsed.text || parsed.html || "").toString()` — **discards HTML**;
  this is the line to change. `SyncedEmail` (`gmail.ts:61`) has no `bodyHtml` field.
- `captureInboundEmail` (`email-capture.ts:179`) writes `metadata` at `:362` (messageId/threadId/
  from/to/subject/snippet) and `raw_content` from `input.text`; no HTML field today.
- `lib/infra/sanitize-html.ts` exists (used by `email-composer.tsx:6,289`) — REUSE it to sanitize
  at rest; note its server branch is regex-only (DOM parse only in the browser), adequate for
  store-clean but see INBOX-R01 for the render-time hardening.
