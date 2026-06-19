# INBOX-R09 — Plaintext & malformed-MIME graceful fallback
> Theme: T1 · Autonomy rung: passive · Priority: P1
> Pillar: P1 fidelity

## User story
As a user, I want plain-text emails and broken/malformed messages to still render cleanly and
readably — never a blank pane, a crash, or a wall of raw MIME — so every email in my mailbox is
openable regardless of how it was built.

## Why (audit anchor)
A faithful mailbox (audit P1) must degrade gracefully: not all mail is well-formed HTML. Once
INBOX-R01 makes HTML the primary path, the **text path must remain first-class** (formatted,
linkified, quote-folded), and malformed MIME must fall back instead of erroring. Today the pane
is text-only (`_conversation-pane.tsx:471`) — which is robust but unformatted — and the IMAP
transport already skips unparseable MIME with `continue` (`imap.ts:114`), meaning some messages
are silently dropped rather than captured-degraded. This spec guarantees a readable result for
plaintext + malformed cases and ensures legacy rows (HTML null, from before INBOX-R13) still render.

## Requirements (EARS)
- WHEN a message has no HTML part (text-only), the system SHALL render the text with preserved line
  breaks, linkified URLs (INBOX-R03), and quote/signature folding (INBOX-R05).
- WHEN a stored row has `metadata.bodyHtml = null` (legacy / pre-INBOX-R13), the system SHALL render
  via the text path without error.
- WHEN HTML parsing/sanitization fails at render, the system SHALL fall back to the text body, never
  throw or blank the pane.
- WHEN MIME parsing fails at capture, the system SHALL still record what is recoverable (headers,
  subject, any decodable text) rather than dropping the message silently.
- The system SHALL detect when a "text" body is actually raw HTML/markup (mis-typed parts) and route
  it through the HTML path instead of showing tags.
- The system SHALL handle empty bodies with a clear "(no content)" state, distinct from a load error.
- The system SHALL decode common transfer encodings/charsets correctly for the text path
  (quoted-printable, base64, non-UTF-8 charsets) — feeding INBOX-R10.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a plain-text email with two paragraphs and a URL WHEN opened THEN paragraphs are separated, the
  URL is clickable, and any quoted tail is folded (R05).
- GIVEN a legacy activity with `bodyHtml = null` WHEN opened THEN it renders via text with no error.
- GIVEN an email whose HTML is malformed (unclosed tags) WHEN opened THEN it renders best-effort and, on
  sanitizer failure, falls back to text — never a blank pane.
- GIVEN a message that is `text/plain` but actually contains `<html>…` WHEN opened THEN it renders as
  HTML (mis-typed-part detection), not literal tags.
- GIVEN a truly empty message WHEN opened THEN it shows "(no content)" (not "no longer available").
- GIVEN a quoted-printable / base64 text body WHEN opened THEN it is correctly decoded (no `=20`, no raw base64).

## Edge cases & failure handling
- Parser throws at capture → record headers/subject + any decodable text; mark `bodyHtml` null;
  never `continue`-drop silently (change the IMAP behavior to capture-degraded).
- Mixed valid+invalid parts → keep the valid ones.
- Non-UTF-8 charset with no declared encoding → best-effort decode, replacement chars over crash (R10).
- Body is only an attachment (no text/HTML) → show the attachment list (R04) + "(no message body)".
- Extremely long single-line text → wrap, don't overflow (R01 container).
- Multi-tenant: degraded capture still tenant-scoped; no leak.

## Best-in-class bar
- The **text path is a first-class rendered experience** (formatted + linkified + folded), not an ugly
  monospace dump — so plaintext senders (common in dev/ops/sovereign contexts) read as nicely as HTML.
- We **capture-degraded instead of drop**: a malformed message still becomes a record (so it appears in
  the inbox and in CRM last-interaction), where many clients silently lose it — directly fixing the
  silent-loss class of bug we already burned on (memory: dead-letter dates incident).

## Design sketch
- **Data:** none new; relies on `raw_content` (text SSOT) + `metadata.bodyHtml` (nullable, INBOX-R13).
- **API/transport:** change `imap.ts:114` from bare `continue` to a degraded-capture path (record what's
  parseable). Charset/transfer decoding handled by `mailparser` where possible; add a fallback decoder.
- **AI:** none.
- **UI:** the `_email-body.tsx` component (INBOX-R01) takes `{ html, text }` and chooses: HTML when
  present + valid, else the text renderer (preserved breaks via `whitespace-pre-wrap` reusing the
  current `_conversation-pane.tsx:471` style, plus linkify + fold). Empty → "(no content)" in
  `--color-text-tertiary`. No new shortcut. Light+dark via tokens, no emoji, no provider name, cited.
- **Security/perf:** fallback never executes content; mis-typed-HTML still goes through the sanitizer.

## Tasks (ordered)
1. `_email-body.tsx` text renderer path (breaks + linkify + fold + mis-typed-HTML detection + empty
   state). (verify: unit across text/empty/mistyped) (test: `email-body.test.ts`)
2. Sanitizer-failure → text fallback guard at render. (verify: malformed HTML renders text) (test: render)
3. Capture-degraded in `imap.ts` (replace silent `continue`-drop). (verify: malformed MIME yields a
   recorded activity) (test: `imap.test.ts` malformed case)
4. Transfer/charset decode fallback for the text path (feeds R10). (verify: QP/base64 decoded) (test: decode unit)

## Current-state notes (VERIFY before building)
- `_conversation-pane.tsx:471` already renders text with `whitespace-pre-wrap` (the robust floor) — keep
  it as the fallback inside `_email-body.tsx`; it is NOT linkified/folded today.
- `imap.ts:114` does `continue` on parse failure (silent drop) — change to degraded capture.
- `ConversationMessage.body` falls back to `metadata.snippet` when `rawContent` is null
  (`conversations.ts:309`) — preserve that chain.
- Depends on INBOX-R01 (render host), R03 (linkify), R05 (fold), R10 (decode/Unicode).
