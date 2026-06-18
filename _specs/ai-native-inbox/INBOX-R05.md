# INBOX-R05 — Quote/signature collapse & thread folding
> Theme: T1 · Autonomy rung: helper · Priority: P1
> Pillar: P1 fidelity / P2 reading

## User story
As a user reading a long thread, I want quoted reply chains and signatures collapsed by default,
and earlier messages folded, so each message shows only its new content and I'm not scrolling
through ten copies of the same quoted history.

## Why (audit anchor)
Superhuman folds aggressively: messages collapse/expand, "Expand message header", and a "…" trim
control to reveal quoted/trimmed content (`findings.md` §C). It's a core readability feature.
Today our pane dumps the **entire** body as one plain-text block (`_conversation-pane.tsx:471`
`whitespace-pre-wrap`) — quoted chains, signatures and disclaimers included — so a 6-reply thread
is a wall of repeated text. Once INBOX-R01 gives us real HTML, we must fold it like a real client.

## Requirements (EARS)
- WHEN a message body contains a quoted prior message (`>` lines, `On … wrote:`, Gmail/Outlook
  quote blocks, `<blockquote>`), the system SHALL collapse the quoted region behind a "…" toggle and
  show only the new content by default.
- WHEN a message body ends with a signature block (delimiter `-- `, or a detected signature region),
  the system SHALL collapse it behind a "Show signature" affordance.
- The system SHALL detect and collapse legal/disclaimer boilerplate ("This email and any
  attachments…") into the same trimmed region.
- In a multi-message thread, the system SHALL render the latest message expanded and earlier messages
  folded to a one-line header (sender + time + snippet), expandable on click.
- The system SHALL expose an "Expand all / show quoted text" control so nothing is ever truly hidden.
- The system SHALL preserve exact content when expanded (collapse is presentation-only, never
  destructive; the stored body is untouched).
- The system SHALL fall back gracefully when quote boundaries can't be detected (show full body, no error).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a reply whose body includes the quoted previous email WHEN opened THEN only the new text shows,
  with a "…" control that reveals the quote.
- GIVEN a message ending in `-- \nJane\nVP Sales` WHEN opened THEN the signature is collapsed behind
  "Show signature".
- GIVEN a 6-message thread WHEN opened THEN the newest is expanded and the older five are folded to
  one-line headers, each expandable.
- GIVEN a folded older message WHEN clicked THEN it expands in place showing its full (quote-collapsed) body.
- GIVEN a message with a long legal disclaimer WHEN opened THEN the disclaimer is trimmed into the
  collapsed region.
- GIVEN a body with no detectable quote/signature WHEN opened THEN the full body renders with no toggle.

## Edge cases & failure handling
- Top-posting vs interleaved replies → only collapse contiguous trailing quote blocks; never hide
  text the user wrote between quotes.
- Non-English quote intros ("Le … a écrit :", "Am … schrieb:") → detect localized patterns.
- Nested quotes (quote within quote) → collapse the whole trailing quoted region as one.
- HTML-only quotes (no `>` markers, just `<blockquote>`/Gmail `gmail_quote` class) → detect by markup.
- Signature false-positive (a `--` in body) → require the RFC `-- ` (dash-dash-space) or a strong
  heuristic before collapsing.
- Plain-text bodies (INBOX-R09) → apply the `>`-line + `On…wrote:` heuristics.

## Best-in-class bar
- We fold by both **markup and text heuristics** AND localize the quote intros (FR/DE/EN) for our
  francophone/sovereign users — Superhuman folds well in English; ours is correct for Suisse-romande mail.
- Folding is **presentation-only over the retained full body** (INBOX-R13), so AI summaries (INBOX-S01/
  S08) still see the complete thread — we hide noise from the human without blinding the model.

## Design sketch
- **Data:** none new — operates on the rendered body (HTML from INBOX-R13/R01, or text from R09).
- **API:** none (client-side fold). Optional: precompute a `newContentOffset` at capture later (out of scope).
- **AI:** none required (deterministic). Summaries elsewhere benefit from the full retained body.
- **UI:** in `_email-body.tsx` (INBOX-R01) + the message map in `_conversation-pane.tsx:445-475`:
  a "…" trim toggle (`MoreHorizontal` lucide) for quotes, "Show signature" (`ChevronDown`), and
  fold/expand per message (`ChevronRight`/`ChevronDown`). Folded header reuses the existing message
  header row style (`_conversation-pane.tsx:455-467`). Tokens: toggles `--color-text-tertiary`,
  hover `--color-bg-hover`, collapsed-region rule `--color-border-default`. Keyboard: `Enter`/Space
  toggles the focused fold; an "Expand all" affordance. Light+dark via tokens, no emoji, no provider
  name, cited.
- **Perf:** folding reduces DOM for long threads, complements INBOX-R11 virtualization.

## Tasks (ordered)
1. `lib/inbox/quote-fold.ts` — pure: split(body, format) → { newContent, quotedRegion, signature,
   disclaimer }, with EN/FR/DE intros + `<blockquote>`/`gmail_quote`. (verify: unit across fixtures)
   (test: `quote-fold.test.ts`)
2. Per-message collapse UI (quote "…", signature, disclaimer) in `_email-body.tsx`. (verify: browser —
   reply shows only new text) (test: render)
3. Thread folding (latest expanded, earlier folded) in the message map. (verify: 6-msg thread folds)
   (test: render)
4. "Expand all" + non-destructive guarantee. (verify: expanding shows exact stored body) (test: unit)

## Current-state notes (VERIFY before building)
- `_conversation-pane.tsx:471` renders the whole body as one plain `<p whitespace-pre-wrap>` — no
  quote/signature awareness, no per-message fold; the message map is `:445-475`.
- All messages are rendered expanded today (no folding); `ConversationMessage.body` is plain text
  (`conversations.ts:309`) until INBOX-R13/R01 add HTML.
- No quote/signature module exists in `lib/inbox/`.
