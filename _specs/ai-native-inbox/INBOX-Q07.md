# INBOX-Q07 — Ask-AI scoped to a single thread
> Theme: T5 · Autonomy rung: helper (agentic) · Priority: P0
> Pillar: P2 reading / P3 writing / P5 GTM moat

## User story
As a user reading a thread, I want to ask the assistant about *this* conversation — "what are they
actually asking for?", "summarize where we landed", "what did I promise?", "draft the reply" — and
get an answer grounded in this thread plus the prospect's CRM context, with citations to the exact
messages — so I understand and respond without re-reading the whole chain.

## Why (audit anchor)
Superhuman's open-thread AI is thread-grounded: `i` summarizes the thread to a one-line TL;DR,
then Ask AI **checks your voice, matches the counterparty's tone, and drafts a reply grounded in
the thread** (auto `To:`, answers their actual question) before offering Send/Insert (deep-dive
§AI-assisted REPLY, screens 033–034). The whole flow is *about the open conversation*. Our reading
pane (`_conversation-pane.tsx`) has the full thread and a prepared-draft seam already
(`inbox/conversations/detail` returns `preparedDraft`), and the chat dock + agentic loop exist — but
the dock on `/inbox` is **global-scoped** today (`surface-from-path.ts:74`), so it can't yet be
pinned to one thread. This spec closes that: a thread-scoped Ask-AI that reuses the dock and grounds
on the open conversation + its CRM cluster, with citations.

## Requirements (EARS)
- WHEN a thread is open and the user invokes Ask-AI (a per-thread affordance or the dock while a
  thread is focused), the system SHALL scope the assistant to that conversation — its messages are
  the primary context.
- The system SHALL ground answers in the thread's full message bodies (via
  `GET /api/inbox/conversations/detail?key=`, which already returns scoped messages with complete
  bodies) plus the counterparty's CRM cluster (contact/company/deal/signals/last interaction, reuse
  INBOX-G01), and SHALL cite the specific message(s) a claim comes from.
- The system SHALL support the core thread verbs: **summarize** (one-line TL;DR + expandable),
  **answer a question about the thread**, **extract what I committed to / what they asked**, and
  **draft a reply** (hand off the composing flow to INBOX-G08/C01 with the thread context preloaded).
- WHEN drafting, the system SHALL preload `To:` from the thread and answer the counterparty's actual
  question, and SHALL route the draft through the approval-gated composer (the dock already opens
  `EmailComposerPanel`, `chat-dock.tsx:584`), never auto-send.
- The system SHALL enforce that the thread belongs to the viewer's mailbox (the detail route already
  scopes via `getInboxScope`; `conversations/detail/route.ts:28`) and SHALL refuse a thread key the
  user can't access.
- The system SHALL show its reasoning/tools (the dock renders `ToolCallGroup`) and SHALL persist the
  thread-scoped chat to history keyed to that conversation.
- WHEN the thread has no answer to the question (out of scope), the system SHALL say so and offer to
  search the wider inbox (escalate to INBOX-Q02), not invent an answer.
- The system SHALL never render a provider name; citations read "via Elevay".

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an open thread WHEN I ask "what are they asking for?" THEN the answer summarizes the request
  and cites the message where it was asked.
- GIVEN a long thread WHEN I ask for a summary THEN I get a one-line TL;DR with an expandable detail,
  each key point citing its message (matches Superhuman's `i` behaviour).
- GIVEN I made a commitment earlier WHEN I ask "what did I promise?" THEN the assistant quotes my
  prior message and cites it.
- GIVEN I ask "draft the reply" WHEN it drafts THEN `To:` is prefilled from the thread, the draft
  answers their question, and it opens in the composer for approval (no auto-send).
- GIVEN a thread key for a teammate's mailbox WHEN I try to scope Ask-AI to it THEN it is refused
  (mailbox scope), even within one tenant.
- GIVEN a question the thread can't answer WHEN I ask THEN the assistant says so and offers to search
  my inbox (Q02), instead of guessing.
- GIVEN I reopen the thread later WHEN I return THEN the thread-scoped Q&A is retrievable in history.

## Edge cases & failure handling
- Very long thread exceeding the context budget → reuse the chat route's compaction
  (`compactMessages`, `chat/route.ts:75`) / budget manager; summarize older messages, keep the recent
  tail + the focal question.
- Thread with mixed languages → answer/summary in the user's UI language (or the thread's), per INBOX-T08.
- Counterparty not in CRM → answer from the thread alone; offer "Add to CRM" (INBOX-G02) for the cluster.
- Prepared draft already exists (`detail.preparedDraft`) → offer to refine it rather than starting cold.
- Model/circuit failure → existing OpenAI fallback + dock error/Retry (`chat-dock.tsx:515`).
- Citation points to a message later deleted → mark stale, never dangle.
- Cross-tenant/mailbox: the detail route's `getInboxScope` is the gate — never bypass it for the AI path.

## Best-in-class bar
- Thread answers are **cited to the exact message AND enriched with the deal/contact/signal cluster**
  — Superhuman grounds on the thread + your voice + calendar; we add the **GTM graph with citations**,
  so "summarize where we landed" includes the deal stage and the last interaction, not just the text.
- One affordance does **understand → answer → draft** on the open conversation, in the same dock,
  approval-gated and sovereign — no context switch, no copy-paste, no auto-send surprise.

## Design sketch
- **Data:** `GET /api/inbox/conversations/detail?key=` (scoped thread + bodies + enrollment +
  preparedDraft; `conversations/detail/route.ts`). CRM cluster from INBOX-G01's
  `GET /api/inbox/context`. History via `chatThreads` keyed to the conversation.
- **API:** reuse `POST /api/chat` with a **new thread surface**: extend `surface-from-path.ts` /
  the dock body so a focused inbox thread posts `contextType:"inbox_thread"`, `contextId:<conversationKey>`;
  `chat/route.ts inferSurface`/`getEntityContext` gain an `inbox_thread` branch that loads the scoped
  thread (detail route logic) + G01 cluster into the system prompt; citations via `formatCitedSources`.
- **UI:** an "Ask about this thread" affordance in `_conversation-pane.tsx` (header action, `lucide-react`
  `Sparkles`/`MessageSquare`) that opens the dock pinned to the thread (chip reads the subject/contact,
  reuse the dock's context chip, `chat-dock.tsx:347`); summary renders as a TL;DR card with a chevron
  (mirror Superhuman `i`); "Draft reply" opens `EmailComposerPanel`. Shortcut: a thread-local key
  (e.g. `a`) to open, `i` to summarize. Light+dark via tokens, no emoji, no provider name, cited.
- **AI:** Sonnet primary / GPT-4o-mini fallback; thread bodies + CRM cluster as grounded context;
  `stopWhen: stepCountIs(10)`; compaction for long threads; mandatory citations to messages.
- **Security:** mailbox scope via the detail route's `getInboxScope`; approval-gated drafts (no auto-send);
  plan + rate limits (existing).

## Tasks (ordered, each with a verify step + test to write)
1. Add an `inbox_thread` surface: dock posts `contextType:"inbox_thread"`+conversationKey; `chat/route.ts`
   loads the scoped thread (detail logic) + refuses unauthorized keys. (verify: thread context reaches
   the model; foreign key refused) (test: `inbox-thread-scope.test.ts` incl. cross-mailbox refusal)
2. Inject the thread messages + G01 CRM cluster into the system prompt with message-level citation
   hints. (verify: answers cite specific messages) (test: thread-grounding test)
3. "Ask about this thread" + `i`-summary affordances in `_conversation-pane.tsx`; pinned-dock chip.
   (verify: open a thread, ask "what are they asking for?" in the live app → cited answer) (test:
   pane affordance + chip test)
4. "Draft reply" hands off to the composer with `To:` prefilled + thread context (compose with
   INBOX-G08). (verify: draft opens in composer, no auto-send) (test: draft-handoff test)
5. Out-of-thread escalation to Q02 + long-thread compaction. (verify: an unanswerable question offers
   inbox-wide search; a 100-message thread still answers)

## Current-state notes (VERIFY before building)
- `GET /api/inbox/conversations/detail?key=` already returns the **scoped** thread with full bodies +
  `enrollment` + `preparedDraft`, gated by `getInboxScope` (`conversations/detail/route.ts:28`) — this
  is the thread-context source; reuse it.
- The dock on `/inbox` is **global-scoped** today: `surface-from-path.ts:74` maps `/inbox` to a global
  surface with no thread context. Q07's task 1 adds the `inbox_thread` surface — this is the key seam.
- `_conversation-pane.tsx` renders the thread (body plain-text at `:471` until INBOX-R01 lands) and has
  a prepared-draft path (~140–168) — add the Ask affordance here.
- The dock already opens `EmailComposerPanel` from an assistant message (`chat-dock.tsx:584`) and
  persists threads — reuse both for the draft handoff + history.
- Chat-route compaction/budget (`compactMessages` `chat/route.ts:75`) covers long threads — don't
  reinvent truncation. VERIFY `inferSurface`/`getEntityContext` for the cleanest place to add the branch.
