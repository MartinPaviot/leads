# INBOX-TRIAGE — Office hours

**Date**: 2026-06-10
**Branch**: feat/inbox-triage

## Problem statement (one sentence)

The page named "Inbox" is an outbound delivery log (a table of sent emails, default view = your own sends) where you cannot read a full message, cannot see a conversation, cannot mark anything done, and where the prospect's reply — the most valuable object in the product — lives in a 250px truncated column.

## Premise challenge

- **Do we even need an inbox page when Mail clients exist?** Yes — the differentiator is not reading email, it is *triage with revenue judgment*: every conversation arrives pre-classified (intent, sentiment, thread intelligence already computed by the sync pipeline) and pre-prepared (reply-handler already generates draft replies that today are visible nowhere). Gmail can't do that.
- **Should this be merged into the agent Up-Next feed instead?** Considered. The feed is "what the agent thinks you should do next" across all channels; the inbox is "conversations awaiting a human decision". They share a priority philosophy but not a unit (work item vs conversation). v1 keeps them separate; the reopen/priority logic lives in a pure lib so the feed can consume it later.
- **Is a new DB table justified?** Yes. Triage state (done/snoozed per conversation) has no home: activities.metadata merge is fragile (jsonb_set footgun, multi-row threads), and outbound_emails rows are per-message not per-conversation.

## Alternatives explored

1. **Keep the table, add a row-expand drawer** (completeness 4/10) — still message-centric, no done state, no thread.
2. **Master-detail conversation view + triage state + surfaced intelligence/drafts** (completeness 9/10) — chosen. Missing vs 10/10: true SMTP threading on replies (composer sends "Re:" as a new message; In-Reply-To headers are a follow-up), and feed/inbox unification.
3. **Full Superhuman clone (command palette, split inboxes, undo send)** (ocean) — flagged, not boiled. Keyboard basics (j/k/e/r) only.

## Layer check

- Layer 1 (tried and true): master-detail mail UI (Front, Superhuman, HEY), "done/snooze" triage verbs, deterministic priority buckets.
- Layer 2 (new and popular): "agent handled it for you" collapsed lane — scrutinized: we only show what the pipeline *actually did* (processReply already reschedules OOO and opts out unsubscribes; we surface it, we don't invent it).
- No new LLM step is introduced. All intelligence shown is already computed and persisted (activities.sentiment/intent, metadata.threadIntelligence, draft replies). Fail-closed: missing intelligence = section not rendered.

## Completeness target

9/10. Every conversation lane, reopen-on-new-inbound, keyboard, empty states, pagination, tests on the pure assembly logic. Documented gaps: SMTP reply threading, feed unification, undo send.
