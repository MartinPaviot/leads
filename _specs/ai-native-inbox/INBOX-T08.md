# INBOX-T08 — Replace the sales-label badge with an honest AI one-liner
> Theme: T2 · Autonomy rung: helper · Priority: P0
> Pillar: P2 reading / P4 triage

## User story
As a user scanning my inbox, I want the per-conversation badge to tell me in plain language
what the message is and what (if anything) to do — not a cryptic sales label.

## Why (audit anchor)
Today `conv.reason` (`lib/inbox/conversations.ts`, `REASON_BY_LABEL` + fallback `"Replied"`)
is a **sales-reply taxonomy** ("Introduction", "Forwarded internally", "Replied") applied to
ALL mail. On general/automated mail it's nonsense (a confirmation-code email tagged "Forwarded
internally"; a kSuite notification tagged "Replied"). Superhuman/Shortwave show a one-line AI
summary or a meaningful category instead. Martin flagged this directly: "je comprends pas ce
que ça veut dire."

## Requirements (EARS)
- The system SHALL NOT show a sales-reply label on a conversation that has NO outbound email
  (i.e. that is not a reply to one of our sequences).
- WHEN a conversation IS a genuine sequence reply (has a matched outbound), the system MAY show
  its classification (meeting_request, objection_price, …) mapped to friendly text.
- WHEN a conversation is general inbound, the system SHALL show a neutral one-line summary
  (from INBOX-S02), e.g. "Login code from your hosting provider".
- The system SHALL never render the literal fallback string "Replied".
- The badge text SHALL be cached on the conversation/message (no per-render LLM call).
- The badge SHALL carry a tooltip explaining its source ("AI summary" / "Reply: pricing question").

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an automated confirmation-code email (no outbound) WHEN listed THEN the badge is a neutral
  summary, never "Forwarded internally" / "Introduction" / "Replied".
- GIVEN a prospect reply "what's your pricing?" (matched outbound) WHEN listed THEN badge =
  "Asked about pricing".
- GIVEN any conversation WHEN the AI summary is missing THEN the badge is empty (no fallback label),
  not "Replied".
- GIVEN a conversation with an out-of-office reply WHEN listed THEN it stays in Handled with its
  existing handled note (unchanged behaviour).

## Edge cases & failure handling
- Summary generation failed/pending → empty badge, never a guessed sales label.
- Mixed thread (our outbound + later cold inbound) → classify by the LAST inbound; if it's not a
  reply to our mail, treat as general.
- Non-English mail → summary in the user's UI language (or the mail's language; configurable).
- Multi-tenant scoping unchanged (`scopeConversationRows`).

## Best-in-class bar
- We gate the sales taxonomy to ACTUAL sequence replies because we own the outbound graph
  (`outbound_emails`) — Superhuman/Shortwave can't, so their labels guess. Ours is right because
  it's grounded in our send data, and otherwise we show an honest AI summary, not a wrong label.

## Design sketch
- **Data:** reuse `activities.intent` (general taxonomy, see INBOX-S06) + a cached
  `metadata.aiSummaryLine`. A conversation knows if it has outbound (`buildConversations` groups
  both sides).
- **API:** `lib/inbox/conversations.ts` `reason` derivation: if `g.outbound.length === 0`, use
  `aiSummaryLine` (INBOX-S02) and NEVER `REASON_BY_LABEL`/"Replied"; else keep the reply label.
- **UI:** `_conversation-list.tsx:113` + `_conversation-pane.tsx:277` render the new badge + tooltip.
  The badge is a token-colored `Badge` (neutral summary in `--color-text-secondary`; a genuine
  sequence-reply label in its category hue, never status-jewelry); the tooltip (lucide `Info`)
  states the source ("AI summary" / "Reply: pricing question"). No new shortcut (reuses list nav).
  Light+dark via tokens; no emoji; no provider name; the badge's source is cited in the tooltip.
- **AI:** the one-liner comes from INBOX-S02 (per-message summary), cached at capture/enrich.

## Tasks (ordered)
1. Pure: change `reason` derivation in `conversations.ts` — drop the `"Replied"` fallback; gate
   sales labels to `outbound.length>0`. (verify: unit) (test: `conversations.test.ts` cases for
   automated mail → empty/summary, reply → label)
2. Thread `aiSummaryLine` (INBOX-S02) into `Conversation.reason` for general inbound. (verify: API)
3. Badge UI + tooltip in list + pane. (verify: browser — the 3 Infomaniak mails show neutral text)
4. Backfill: recompute `reason` for existing rows. (verify: live inbox no "Replied"/"Forwarded
   internally" on automated mail)

## Current-state notes (VERIFY before building)
- `lib/inbox/conversations.ts` — `REASON_BY_LABEL` (line ~114), `reason` derivation (~270),
  fallback `"Replied"`. The label list is sales-reply-centric by design (built for sequence replies).
- Badge rendered at `_conversation-list.tsx:113`, `_conversation-pane.tsx:277`.
- Depends on INBOX-S02 (summary) + INBOX-S06 (general intent) for the non-sales path.
