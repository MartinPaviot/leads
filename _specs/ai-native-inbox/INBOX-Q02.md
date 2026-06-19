# INBOX-Q02 — Ask-AI over the whole inbox with citations
> Theme: T5 · Autonomy rung: helper (agentic) · Priority: P0
> Pillar: P2 reading / P5 GTM moat

## User story
As a founder, I want to ask my inbox questions in plain language ("who's waiting on a reply from
me?", "summarize everything from the Lausanne federation", "did anyone object on price this
week?") and get a formatted, sourced answer with the inbox still visible — so the mailbox answers
me instead of making me hunt.

## Why (audit anchor)
This is Superhuman's Ask AI — a conversational panel ("Find, write, schedule, or ask anything…")
that keeps the inbox on the right (split layout), returns **formatted, product-grounded answers**,
and is in fact an **agent** that joins tools (look up the contact → check voice → check calendar)
with transparent reasoning before answering (teardown findings §E, §I). Shortwave does the same
over **all team mail + attachments** with citations. Our differentiator: their Ask AI answers over
*contacts + calendar*; ours answers over the **whole GTM graph (deals, signals, last interaction)
with a citation on every claim** (Lightfield's 95%-recall-with-citations bar). We already ship the
exact substrate — the chat dock + `/api/chat` agentic loop + RAG with inline entity-link citations
(`formatCitedSources`, `chat/route.ts:144`) + RAG-quality eval — so this is composition, not a build.

## Requirements (EARS)
- WHEN the user opens Ask-AI from the inbox, the system SHALL present the existing chat dock
  (`components/chat/chat-dock.tsx`) scoped to the inbox surface, with the conversation list still
  visible (the dock floats; the inbox is not replaced).
- WHEN the user asks a question, the system SHALL answer using the inbox + CRM graph via the
  existing tool loop (`searchEmailsByMetadata`, `semanticSearchEmails`, `getEmailContent`,
  `searchCRM`, `queryActivities`, `lib/chat/tools/query.ts`) and SHALL ground the answer in
  retrieved records, never free-form recall.
- The system SHALL cite every factual claim with an inline link to the source record/thread
  (the chat renderer linkifies entity hrefs; `formatCitedSources` steers the model to
  `[the account](/accounts/{id})`-style links, `chat/route.ts:159`), and SHALL NOT emit bare
  "[Source N]" text.
- The system SHALL restrict retrieval to the viewer's tenant (every tool filters `tenant_id`) and,
  for inbox-specific reads, to the viewer's own mailbox (apply `getInboxScope`).
- WHEN the answer concerns mail (e.g. "who's awaiting a reply"), the system SHALL prefer
  mailbox-scoped retrieval and link to the inbox thread (`/inbox?conversation=<key>`), not only CRM records.
- The system SHALL stream the answer with a visible "thinking" state and SHALL surface the tools
  it ran (the dock already renders `ToolCallGroup`), so the user can audit the reasoning.
- WHEN retrieval returns nothing relevant, the system SHALL say it couldn't find supporting mail
  rather than answering from general knowledge.
- The system SHALL persist the Ask-AI conversation to chat history (the dock already saves threads
  via `/api/chat/threads`, `chat-dock.tsx:192`) so the user can return to a prior answer.
- The system SHALL never display a provider/model name as a source ("via Elevay").

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN three threads awaiting my reply WHEN I ask "who's waiting on me?" THEN the answer lists
  the three with a one-line reason each, every line linking to its thread, inbox still visible.
- GIVEN a prospect emailed "your price is high" WHEN I ask "any pricing objections this week?"
  THEN that thread is named and cited; threads with no pricing content are not invented.
- GIVEN a teammate's mailbox in the same tenant WHEN I ask an inbox question THEN their private
  threads are not used or cited (mailbox scope), even though both are in one tenant.
- GIVEN an answer with a claim WHEN rendered THEN the claim carries a clickable citation to the
  exact message/record; no bare "[Source 1]" appears.
- GIVEN retrieval finds nothing WHEN I ask THEN the assistant says "I couldn't find mail about X"
  and offers to broaden, instead of guessing.
- GIVEN I close and reopen the dock WHEN I return THEN the prior Q&A is in my chat history.
- GIVEN OpenAI is unset (no embeddings) WHEN I ask THEN structured tools (metadata/date filters)
  still answer; the assistant notes semantic recall is limited.

## Edge cases & failure handling
- Huge result set ("summarize all my mail") → the tool loop caps per-tool limits; the model
  summarizes top-ranked + says it sampled, never silently truncates to a wrong total.
- Ambiguous entity ("the foundation") → the agent disambiguates (lists candidates) before asserting.
- Mixed sales + personal mail → answer over what's retrieved; don't apply the sales-reply taxonomy
  to general mail (consistent with INBOX-T08).
- Model/circuit failure → existing fallback to OpenAI (`chat/route.ts:810`); if both down, the dock's
  error banner + Retry already handle it (`chat-dock.tsx:515`).
- Citation target deleted between retrieval and click → link resolves to a "record no longer
  available" state, never a 404 dead-end.
- Rate/plan limits → reuse `checkPlanLimit("aiQueries")` + per-user rate limit already in `chat/route.ts:389`.
- Cross-tenant: every retrieval tool is tenant-scoped; add mailbox scope for inbox reads.

## Best-in-class bar
- **Citations on every claim, grounded in our own CRM+inbox graph** — Superhuman/Shortwave cite
  help-docs or mail; we cite the *deal, the signal, the last interaction, and the thread*, because
  we own the graph (the moat). The same answer can pivot to "draft the reply" (INBOX-G08) with the
  context already loaded.
- **Split layout that keeps the inbox alive** (the dock floats over `/inbox`, doesn't replace it),
  matching Superhuman's UX in Elevay-light DNA, on self-hostable infra with a zero-retention option.

## Design sketch
- **Data:** `embeddings` (hybrid retrieval), `activities`/`outbound_emails` (mail), `chatThreads`
  (history). No new tables — the dock + `/api/chat` already persist and retrieve.
- **API:** reuse `POST /api/chat` (`app/api/chat/route.ts`) with `contextType:"inbox"`. Two seams:
  (a) `surface-from-path.ts` currently maps `/inbox` to a *global* surface (`surface-from-path.ts:74`)
  — keep global but add an inbox prompt addendum so the model prefers mail tools + mailbox scope;
  (b) inbox reads must apply `getInboxScope` — add a mailbox filter to the inbox-specific tools or a
  thin inbox tool wrapper. Citations: `formatCitedSources` + `extractCitationsFromResponse` already
  in `chat/route.ts:144,778`.
- **UI:** the existing floating dock (`chat-dock.tsx`), opened on `/inbox` via its launcher /
  `Ctrl+J`, with inbox-flavored starter prompts ("Who's waiting on me?", "Summarize the latest
  from <account>", "Any objections this week?") added to `suggestionsFor()` (`chat-dock.tsx:35`).
  Card `--color-bg-card`, `--shadow-panel`, Inter, accent `--color-accent`, `ElevayMark`, citations
  render as accent links via `ChatMarkdown`; light+dark via tokens, no emoji, no provider name, cited.
- **AI:** Sonnet primary / GPT-4o-mini fallback (`chat/route.ts:425`), agentic `stopWhen:
  stepCountIs(10)`, RAG over hybrid search + context graph (`chat/route.ts:466`), RAG-quality
  sampled (`measureRagQuality`). Mandatory-citation instruction already in the cited-sources block.
- **Security:** tenant scope in every tool; add mailbox scope for inbox reads; plan + rate limits
  already enforced; zero-retention option deferred to INBOX-P03.

## Tasks (ordered, each with a verify step + test to write)
1. Add an inbox surface prompt addendum + inbox starter prompts so opening the dock on `/inbox`
   steers the model to mail tools + thread citations. (verify: dock on `/inbox` shows inbox
   suggestions) (test: `surface-from-path` + suggestions unit test)
2. Apply `getInboxScope` to inbox-specific retrieval (wrapper around `searchEmailsByMetadata`/
   `semanticSearchEmails` that filters to the user's mailbox). (verify: teammate threads excluded)
   (test: `inbox-ask-scope.test.ts` cross-mailbox isolation)
3. Ensure inbox-thread links resolve (`/inbox?conversation=<key>`) and the citation renderer accepts
   them. (verify: clicking a cited thread opens it) (test: link-render test)
4. Eval: a fixture set of inbox questions with known cited answers; assert citation presence +
   no-fabrication on empty retrieval. (verify: eval passes) (test: `inbox-ask.eval.ts`)
5. Backstop the "no supporting mail" path (don't answer from general knowledge). (verify: ask about
   a topic with zero mail → assistant declines + offers to broaden)

## Current-state notes (VERIFY before building)
- The chat dock + `/api/chat` agentic loop already exist and persist threads (`chat-dock.tsx`,
  `chat/route.ts`); citations are markdown entity links via `formatCitedSources` (`chat/route.ts:144`)
  and the renderer only linkifies real entity hrefs (so bare "[Source N]" is dead text — already
  steered against).
- Retrieval already fuses context-graph + hybrid vector search (`chat/route.ts:466`,
  `searchContextGraph` + `searchSimilar`); knowledge RAG rides along (`retrieveKnowledge`).
- Tools `searchEmailsByMetadata`, `semanticSearchEmails`, `getEmailContent`, `queryActivities`,
  `searchCRM` exist in `lib/chat/tools/query.ts` — these answer most inbox questions already.
- GAP: `/inbox` resolves to a *global* surface (`surface-from-path.ts:74`) with no mailbox-scope on
  the chat tools — so today the dock on `/inbox` can read tenant-wide mail, not just the user's box.
  Fix in tasks 1–2 before shipping as "inbox Ask-AI". VERIFY against `lib/chat/tools` for any
  existing mailbox filter.
