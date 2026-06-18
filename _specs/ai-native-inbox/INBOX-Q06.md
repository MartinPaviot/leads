# INBOX-Q06 — "Find that file/attachment" intent
> Theme: T5 · Autonomy rung: helper (agentic) · Priority: P1
> Pillar: P2 reading / P5 GTM moat

## User story
As a user, I want to ask for a file the way I remember it — "the deck Marc sent me", "that signed
PDF from last quarter", "the spreadsheet with the pricing tiers" — and have the assistant find the
exact attachment, name it, and hand me a one-click download/preview with its thread — so retrieving
a file is a sentence, not a hunt through threads.

## Why (audit anchor)
Superhuman's Ask AI is an **agent** that recognizes intent and runs the right tools (find the
contact → check voice → check calendar; teardown §I). "Find me X" is one of its four core verbs
("Find, write, schedule, or ask anything…"). Shortwave's Ask-AI searches attachments directly
(audit §3). The *intent* layer — recognizing "find that file" and resolving it to a specific
attachment with sender + date provenance — is what turns INBOX-Q03's attachment index into a natural
capability. We have the agentic tool loop (`/api/chat`, `stopWhen: stepCountIs(10)`) and, once Q03
lands the attachment index, the retrieval to answer this precisely with citations.

## Requirements (EARS)
- WHEN the user expresses a find-file intent (by sender, recency, type, or content), the system
  SHALL resolve it to the most likely attachment(s) and present each with filename, type, size,
  sender, date, and a link to its thread.
- The system SHALL combine **structured cues** (sender, date, `has:attachment`, file type) with
  **content semantics** (what the file is about) to disambiguate — reusing INBOX-Q03's attachment
  index + INBOX-Q04's operators.
- WHEN multiple attachments plausibly match, the system SHALL present a short ranked list with the
  distinguishing facts (who/when/which thread), not a single guess, and SHALL ask to narrow if needed.
- The system SHALL offer a one-click action on a result: open the safe preview (INBOX-R04),
  download, or jump to the thread — and SHALL cite the source message for provenance.
- The system SHALL scope all candidates to the viewer's mailbox + tenant.
- WHEN no attachment matches, the system SHALL say so and offer the closest alternatives (e.g. "no
  PDF from Marc; here are 2 files he sent") rather than fabricating a file.
- The system SHALL never expose a provider name; the file's origin reads as the sender + "via Elevay".

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN Marc emailed a PDF deck WHEN I ask "find the deck Marc sent me" THEN that PDF is returned
  with Marc as sender, its date, and a link to the thread, plus a download/preview action.
- GIVEN two spreadsheets about pricing WHEN I ask "the spreadsheet with the pricing tiers" THEN both
  are listed with distinguishing facts and the assistant asks which, rather than guessing.
- GIVEN a teammate received that deck (different mailbox) WHEN I ask THEN it is not returned to me.
- GIVEN no matching file WHEN I ask THEN the assistant says none matched and offers the closest
  files from that sender, with zero fabricated results.
- GIVEN a found attachment WHEN I click "preview" THEN it opens via the safe-render path, not a raw
  blob, and "download" fetches the scoped file.
- GIVEN OCR is off and the file is an image WHEN I ask by content THEN the assistant matches on
  filename/sender/date and says contents weren't indexed.

## Edge cases & failure handling
- Attachment index not yet built (Q03 pending) → the assistant falls back to filename/sender/date
  matching via `searchEmailsByMetadata` + says content search is unavailable, never silent-empty.
- Sender ambiguity ("Marc" → two contacts) → disambiguate by company/email before resolving the file.
- File deleted/unavailable at provider → show the metadata + "file no longer available", offer the
  thread; don't 404.
- Very common filename ("invoice.pdf") → rank by recency + thread relevance; show enough context to pick.
- Huge result count → cap + ask to narrow (by sender/date/type).
- Cross-tenant/mailbox: the parent message's scope governs; never resolve a file outside the viewer's box.

## Best-in-class bar
- **Intent → exact file with provenance + one-click action**, grounded in our attachment index and
  the CRM graph (so "the deck from the account's champion" resolves through the deal, not just a name)
  — Superhuman can't search file contents; Shortwave finds files but isn't deal-aware.
- The same agent that finds the file can **act on it** (attach it to a reply, summarize it via
  INBOX-S07) without leaving the dock — find → use, in one place, cited.

## Design sketch
- **Data:** `email_attachments` + `embeddings(entity_type='attachment')` from INBOX-Q03;
  `activities`(email) metadata (`from`/`to`/date) for structured cues.
- **API:** a new chat tool `findAttachment` in `lib/chat/tools/query.ts` (alongside
  `getEmailContent`/`searchEmailsByMetadata`): inputs `{ sender?, type?, before?, after?, about? }`,
  runs structured filter + (if `about`) `searchSimilar` over `entity_type='attachment'`, scoped to
  mailbox + tenant, returns ranked attachments with `_sourceLink` to the thread + a `download`/
  `previewUrl`. Surfaced through the agentic `/api/chat` loop (Q02).
- **UI:** results render in the chat dock as attachment cards (filename + type icon `Paperclip`/
  `FileText`, sender, date, size, "via Elevay") with `Download`/`Eye` (preview) actions; multi-match
  shows a ranked list with a "which one?" prompt. Light+dark via tokens, no emoji, no provider name, cited.
- **AI:** the orchestrator/tool-router (`lib/agents/orchestrator`, `lib/chat/tool-router`) routes
  find-file phrasing to `findAttachment`; Sonnet drives disambiguation + the one-line provenance.
- **Security/perf:** scope by parent message; safe preview (R04); SSRF-safe provider fetch
  (`lib/infra/ssrf-guard.ts`); cap candidates; never stream raw bytes through the model.

## Tasks (ordered, each with a verify step + test to write)
1. (Dep) INBOX-Q03 attachment index live. (verify: attachment rows + embeddings exist)
2. `findAttachment` tool (structured + semantic, scoped, ranked, with thread link + download/preview).
   (verify: returns the right PDF for "deck Marc sent me") (test: `find-attachment-tool.test.ts` incl.
   mailbox scope + multi-match ranking + no-match)
3. Route find-file intent to the tool (orchestrator/tool-router phrasing). (verify: the phrasing
   triggers `findAttachment`) (test: routing unit test)
4. Attachment result cards + download/preview + "which one?" disambiguation in the dock. (verify:
   ask for a file in the live app → card with working preview/download) (test: card render test)
5. Fallback when Q03 index absent (filename/sender/date only + note). (verify: with index off,
   filename match still works)

## Current-state notes (VERIFY before building)
- Depends on INBOX-Q03 (attachment persistence + extraction + embedding) and INBOX-R04 (safe preview/
   download). Without them, only filename/sender/date matching is possible (via `searchEmailsByMetadata`,
   `lib/chat/tools/query.ts:388`).
- The agentic tool loop + orchestrator + tool-router already exist (`chat/route.ts:624`,
  `lib/agents/orchestrator`, `lib/chat/tool-router`) — add a tool + routing, don't build a new agent.
- `getEmailContent`/`semanticSearchEmails` (`query.ts:665,763`) are the nearest existing tools and
  share the `_sourceLink` convention — match it so citations render as inbox/record links.
- Inbound attachments are not persisted today (see INBOX-Q03 current-state) — VERIFY R04/Q03 status
  before promising content-based file search.
