# INBOX-S01 — Per-thread summary with citations
> Theme: T3 · Autonomy rung: helper · Priority: P0
> Pillar: P2 reading

## User story
As a user opening a long email thread, I want a one-line TL;DR at the top that expands to a
detailed, cited summary, so I can grasp the whole conversation before I read or reply.

## Why (audit anchor)
Superhuman's **Auto Summarize** (`i`) collapses a thread to a one-line TL;DR at the top
("Zeno Rocha introduces Resend and offers tips") with a chevron → detailed summary
(`ai-feature-deep-dive.md` §"FULL AI-reply flow" step 1; `findings.md` §C/E). Shortwave puts an
AI summary on *every* email (audit §3). We have **no thread summary today** — the pane renders
raw messages (`_conversation-pane.tsx:471`). Our edge over both: the summary **cites the source
messages** (Lightfield's 95%-recall-with-citations bar, audit §3), where theirs is uncited prose.

## Requirements (EARS)
- WHEN a conversation has ≥ 2 messages, the system SHALL render a one-line TL;DR at the top of the
  reading pane, expandable (chevron) to a detailed multi-sentence summary.
- The detailed summary SHALL attribute each statement to the message(s) it came from (citation =
  sender + timestamp, deep-linking to that message in the thread), produced "via Elevay".
- The system SHALL generate the summary from the thread's persisted message bodies only (no web,
  no other threads); it SHALL NOT assert any fact not present in the thread.
- The summary SHALL be cached (keyed by conversation + last-message timestamp) so opening a thread
  triggers no per-render LLM call; it regenerates only when a newer message arrives.
- WHEN the user presses `i` on an open thread, the system SHALL toggle the summary panel
  (collapse/expand), matching Superhuman's shortcut.
- WHEN generation fails or is pending, the system SHALL show a neutral "Summary unavailable" state
  (via `hallucination-fallback.tsx`), never a fabricated or partial summary.
- The system SHALL respect per-user/tenant scope — only the viewer's own messages are summarized
  (`scopeConversationRows`, `lib/inbox/user-scope.ts`).
- WHEN the tenant has the zero-retention AI option enabled, the system SHALL generate the summary
  without persisting message bodies to any third-party retention store (per INBOX-P03).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a 6-message thread WHEN opened THEN a one-line TL;DR shows at the top; the chevron expands
  to a paragraph where each claim links to its source message.
- GIVEN the expanded summary WHEN I click a citation THEN the pane scrolls to / highlights the cited
  message.
- GIVEN a fact NOT in the thread WHEN I read the summary THEN it never appears (grounded only).
- GIVEN a thread I already summarized WHEN I reopen it with no new message THEN no LLM call fires
  (cache hit) and the same summary renders instantly.
- GIVEN a new reply arrives WHEN I reopen THEN the summary is regenerated to include it.
- GIVEN a single-message thread WHEN opened THEN no thread summary shows (per-message summary S02 covers it).
- GIVEN summary generation failed WHEN opened THEN "Summary unavailable" shows, no guessed text.
- GIVEN `i` pressed twice WHEN open THEN the summary collapses then expands (toggle).

## Edge cases & failure handling
- Very long thread (> token budget) → summarize most-recent N + a rolled-up older-context line; never truncate silently without saying "older messages condensed".
- Mixed-language thread → summary in the user's UI language; cite original-language messages.
- Thread with only outbound (our sends, no reply) → summarize our side, label it as such; lives in Outbound tab anyway (`conversations.ts:236`).
- Quoted-reply noise / signatures → strip before summarizing (reuse INBOX-R05 collapse boundaries).
- Empty/blank bodies (snippet-only capture) → summarize from snippets, mark confidence "Inferred" (`confidence-state.tsx`).
- Multi-tenant: never summarize across tenants or another user's mailbox.

## Best-in-class bar
- **Cited** thread summary (each claim → source message), not Superhuman's uncited TL;DR — provenance is auditable, the Lightfield bar.
- Cache keyed on last-message timestamp = instant reopen with zero LLM cost; regenerate only on change.
- Reuses our grounded-summary fail-closed discipline (Call Mode brief) so it never hallucinates a decision the thread didn't contain.

## Design sketch
- **Data:** persist `metadata.threadSummary = { tldr, detailed, citations:[{messageId, at, from}], model, generatedForMessageAt }` on the newest inbound activity of the thread (reuse the `metadata` JSONB on `activities`, `db/schema/core.ts`; same place `threadIntelligence` already lives, `conversations.ts:331`). No migration.
- **API:** generate in the existing thread-level pass — `enrichment/thread-intelligence-requested` (`inngest/sync-functions.ts:570`) already groups by `threadId`; add a thread-summary step alongside it (one `generateObject` call, schema `{ tldr, detailed, citations }`). `loadConversationRows`/`conversations.ts` surface `threadSummary` on `Conversation`. `GET /api/inbox/conversations/detail` returns it; a `POST /api/inbox/summary/regenerate?key=` forces a refresh.
- **UI:** a summary header card at the top of `_conversation-pane.tsx` (above the message list, replacing nothing — additive). Surface = card `--color-bg-card`, border `--color-border-default`, `rounded-lg`, `--shadow-card`; TL;DR in `text-[13px] text-[var(--color-text-primary)]`; "Summary" eyebrow `text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]`; chevron = lucide `ChevronDown`/`ChevronRight`; citations rendered via `components/ai-ui/cited-claim.tsx` + `source-link.tsx`; shortcut `i` toggles. Light+dark via tokens, no emoji, no provider name, cited "via Elevay".
- **AI:** model role = grounded extractive/abstractive summarizer over thread bodies; grounding source = the thread's own messages; citation = message id+timestamp; autonomy = helper (shown on open, never sends). Fail-closed: empty `detailed` ⇒ fallback state.
- **Security/perf:** tenant + user scope; cache keyed by last-message ts (no per-render call); zero-retention path honored (INBOX-P03); bodies sanitized before prompt (no script/markup injection into the model).

## Tasks (ordered, each with a verify step + test to write)
1. Thread-summary schema + `generateObject` step folded into the thread-intelligence pass; writes `metadata.threadSummary`. (verify: a seeded thread gets `{tldr, detailed, citations}`) (test: `thread-summary.test.ts` — grounded-only: a fact absent from input never appears; cache key = last-message ts)
2. Thread `threadSummary` through `load.ts` + `Conversation` + detail route. (verify: API returns it) (test: load-shape test)
3. Summary header card in `_conversation-pane.tsx` with chevron expand + citation links + `i` toggle. (verify: browser on a real ≥2-msg thread — TL;DR shows, expands, citations scroll to source) (test: dom render + toggle)
4. `POST /summary/regenerate` + auto-regenerate-on-new-message. (verify: new reply → summary updates) (test: route test)
5. Fail-closed + zero-retention paths. (verify: forced generation error → "Summary unavailable", no guessed text) (test: fallback render)

## Current-state notes (VERIFY before building — code moves)
- No thread summary exists; pane renders raw plain-text messages (`_conversation-pane.tsx:471`).
- `metadata.threadIntelligence` already persisted per-thread (`conversations.ts:330–336`) — same JSONB slot + same producer pass to extend (`sync-functions.ts:557–574`). VERIFY both line ranges.
- AI-UI primitives exist: `components/ai-ui/cited-claim.tsx`, `source-link.tsx`, `confidence-state.tsx`, `hallucination-fallback.tsx`.
- Depends on INBOX-R05 (quote/signature boundaries) for clean input; pairs with INBOX-S08 (decisions) and INBOX-S02 (per-message). Shortcut `i` is shared with the summary feature family — register once.
