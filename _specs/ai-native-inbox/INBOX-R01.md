# INBOX-R01 — Sanitized HTML body rendering
> Theme: T1 · Autonomy rung: passive · Priority: P0
> Pillar: P1 fidelity

## User story
As a user reading my mail, I want each message rendered as faithful, safe HTML
(formatting, links, images, layout), so the inbox reads like a real mailbox instead of
a plain-text dump.

## Why (audit anchor)
Every credible client (Gmail, Superhuman, Shortwave) renders HTML faithfully — table
stakes. We currently render `<p className="whitespace-pre-wrap">{m.body}</p>`
(`_conversation-pane.tsx:471`) and discard HTML at capture (`imap.ts:124`:
`parsed.text || parsed.html`). This single gap is the root of "70% of a classic mailbox,
worse" — raw URLs instead of links, no images, no formatting.

## Requirements (EARS)
- The system SHALL persist the full sanitized HTML part of every captured email (INBOX-R13).
- WHEN a message has an HTML body, the system SHALL render sanitized HTML in the reading
  pane, not the plain-text fallback.
- The system SHALL sanitize HTML with a strict allowlist: no `<script>`, no `on*` handlers,
  no `<iframe>`/`<object>`/`<embed>`, no remote CSS `@import`, no `javascript:` URLs.
- The system SHALL preserve safe formatting: headings, lists, tables, blockquotes,
  bold/italic/underline, links, inline images, basic inline color/background.
- The system SHALL scope email CSS to the message container so author styles never leak
  into app chrome.
- WHEN no HTML part exists, the system SHALL render the plain-text body with linkified URLs
  and preserved line breaks.
- The system SHALL render inside a responsive, max-width container and never overflow the pane.
- The system SHALL never pass unsanitized email HTML to `dangerouslySetInnerHTML`.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an HTML email with a table + links WHEN opened THEN the table renders formatted and
  links are clickable with `target="_blank" rel="noopener noreferrer"`.
- GIVEN an email containing `<script>alert(1)</script>` WHEN opened THEN no script executes
  and the node is absent from the DOM.
- GIVEN an email with `<style>*{color:red}</style>` or inline broad CSS WHEN opened THEN app
  chrome outside the message container is visually unaffected.
- GIVEN a plain-text-only email WHEN opened THEN URLs are clickable and newlines preserved.
- GIVEN an email with `<a href="javascript:…">` WHEN opened THEN the href is neutralized.
- GIVEN a 2 MB HTML email WHEN opened THEN it renders without freezing the pane (see INBOX-R11).

## Edge cases & failure handling
- Malformed/partial HTML → sanitize best-effort, never throw; fall back to text on parser error.
- HTML-only email with no text part → render HTML (already retained by INBOX-R13).
- Remote images → gated by INBOX-R02 (proxy) + INBOX-R07 (pixel block), default-blocked.
- Quoted reply chains / signatures → collapsed by INBOX-R05.
- Dark mode → INBOX-R08 (don't let white email backgrounds blind the user).
- Multi-tenant: never render another user's message (scope via `lib/inbox/user-scope.ts`).

## Best-in-class bar
- Sanitization is **server-side + CSP-enforced** (defense in depth), not only client DOMPurify.
- Email renders in a **scoped/Shadow container** so author CSS can't fight our theme — cleaner
  isolation than Gmail's iframe, with less perf cost and instant dark-mode adaptation.

## Design sketch
- **Data:** persist `bodyHtml` (sanitized) alongside `rawContent` (text). Depends INBOX-R13.
  `ConversationMessage` (`lib/inbox/conversations.ts`) gains `bodyHtml: string | null`.
- **API:** shared `lib/inbox/sanitize-html.ts` (server, vetted allowlist lib e.g. sanitize-html/
  DOMPurify-isomorphic). `loadConversationRows` + detail route return `bodyHtml`.
- **UI:** new `_email-body.tsx` (`<EmailBody html text />`, scoped container) replacing the
  plain-text `<p>` at `_conversation-pane.tsx:471`. Keep text fallback path. Body sits on
  `--color-bg-card` / `--color-text-primary`, links in `--color-accent`; no chrome icon of its own
  (the body IS the content). No keyboard shortcut (passive render). Light+dark via tokens (email
  colors clamped for legibility on `.dark`, INBOX-R08); no emoji; no provider name; the message's
  own provenance is shown by INBOX-R06, not this component.
- **AI:** none.
- **Security/perf:** container CSP `sandbox` + `script-src 'none'`; link rewrite (INBOX-R03);
  tracking strip (INBOX-R07); lazy-render bodies (INBOX-R11).

## Tasks (ordered)
1. `lib/inbox/sanitize-html.ts` + unit tests (script/iframe/on*/javascript: stripped; tables/
   links/lists/images kept). (verify: tests green) (test: `sanitize-html.test.ts`)
2. Persist sanitized HTML (depends INBOX-R13); thread `bodyHtml` through `load.ts` +
   `ConversationMessage`. (verify: API returns bodyHtml) (test: load-shape test)
3. `_email-body.tsx` scoped-container component + text fallback. (verify: render test)
4. Swap the plain-text `<p>` at `_conversation-pane.tsx:471`. (verify: browser screenshot of a
   real HTML email rendering formatted) (test: dom render)
5. CSP/sandbox on the container. (verify: a `<script>` email is inert in the live app)

## Current-state notes (VERIFY before building — code moves)
- `imap.ts:124` discards HTML when a text part exists → must fix first (INBOX-R13).
- `_conversation-pane.tsx:471` renders plain text only (`whitespace-pre-wrap`).
- `lib/inbox/conversations.ts` `ConversationMessage.body` is plain text; list snippet is plain.
