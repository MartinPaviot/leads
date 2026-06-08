# Page Elevation Spec — `/chat` (Page 1)

Protocol: `_harness/PAGE-ELEVATION-PROTOCOL.md`. Date 2026-06-06.
Method: 3 best-in-market teardowns (product behaviors · citations/trust UX · agentic tech+RAG,
all 2025-2026) + deep read of real code (page.tsx, api/chat/route.ts, lib/chat/tools/query.ts,
lib/prompts/chat-system-prompt.ts, components/chat-markdown.tsx). Live Playwright test: PENDING.

---

## A. Intrinsic purpose (JTBD + Forces)

Job: "When I have a question about my pipeline or need to act on it, I want to ask in plain
language and get a trustworthy, sourced answer or action — without learning the CRM UI — so I can
run founder-led sales without an ops team."
- Functional: answer/act over real CRM data, grounded.
- Emotional: trust — every claim verifiable; never second-guess the AI.
- Social: feels like a senior sales teammate, not a chatbot.
Success moment: ask "which deals are stalling?" -> sourced, actionable table with one-click next
steps, trusted enough to ACT without opening the CRM to double-check.
Forces: pull = speed + no-CRM-learning; anxiety (the thing to kill) = "can I trust what it says?"
-> citations are the load-bearing force-reducer.

## B. Place in the global flow

Chat is the UNIVERSAL LENS over the whole object graph (accounts/contacts/deals/activities/notes/
tasks/meetings/knowledge) + the action layer (create/update/sequence/email).
- Upstream entries: sidebar "New chat"; persistent bar (`?q=`); Skills (`?skill=`); SHOULD be every
  record ("Ask about this" -> `?contextType=&contextId=`).
- Downstream: write actions (create cards -> /api/contacts|accounts|deals), navigate to sequences,
  open email composer.
- Cross-page contract: Chat READS everything -> every other page's data quality bounds Chat's
  answer quality; Chat WRITES via approval cards. It is where the intelligence loop
  (capture -> understand -> act) becomes conversational. Citations make Chat the trust hub and the
  front door to every record.

## C. How it must work (correct model)

- Grounding: text-to-tool FIRST (precise predicates), vector SECOND (unstructured); every claim
  anchored to a real row id.
- Citations: every claim -> clickable record badge OR numbered source with HOVER-PREVIEW of the
  cited content; transcript -> `[mm:ss]` seek chips; a Sources rail aggregates provenance,
  permissions-safe.
- Streaming: visible, collapsible tool/research steps ("Querying deals in proposal... found 7"),
  collapse to one line when done.
- Actions: propose -> diff/preview card -> one-click approve (HITL); batched for bulk.
- Honesty: 3 distinct states — "I don't know" vs "no data" vs "no access".
- Scoping: auto-anchor to the current record when entered from one.
- States: empty / streaming-steps / partial-scoped / error / no-data / no-access.

## D. Current reality (code-verified — corrects the coverage audit)

Chat is MATURE, not a stub:
- AI SDK v6 `useChat`; `streamText` with **claude-sonnet-4-6** (route.ts:419), OpenAI fallback +
  circuit breaker; RLS tenant scoping (setTenantId); plan + rate limits.
- Rich **text-to-tool** layer (query.ts): queryContacts/Accounts/Deals/Activities/Notes/Tasks,
  `runBasicReport` (count/sum/avg group-by, allow-list injection guard), semantic search over
  notes/emails/calls, getRecordsByIds, findDuplicateContacts, audit listRecentToolCalls. Every
  result carries `id` + `_sourceLink` (/contacts|accounts|opportunities/[id]).
- Orchestrator (intent -> specialists @>0.8) + routeTools over 126 tools; capability resolver by
  role/surface; there is also a code-execution tool (tools/code-execution.ts, `executeCode`).
- RAG hybrid: context-graph + vector (pgvector via OpenAI embeddings, sim>0.5) merged; knowledge
  retrieval; agent memory (chatMemories, auto-extract /20 turns); work queue; context-budget +
  compaction; prompt canary + A/B; RAG-quality eval sampling (10%).
- **Citations ARE rendered** (audit was wrong): `<citation_rules>` mandates "no link = no claim"
  with `[Name](/contacts/{id})` etc.; ChatMarkdown -> parseEntityHref -> `<EntityLink>` clickable
  badge; transcript `[mm:ss]` -> seek chips; tables with entity links in cells; action cards
  (create contact/account/deal) with approve/dismiss + batch.

Code-verified GAPS (the real, high-leverage targets):
1. TWO citation formats, one DEAD: the vector-RAG path emits `[Source N]` (route.ts:144
   formatCitedSources) which ChatMarkdown does NOT linkify -> dead text; inconsistent with the
   entity-link format. Vector-retrieved sources are not clickable.
2. NO Sources/provenance rail — citations inline only; no aggregated, hover-previewable panel.
3. NO hover-preview of cited content — badge links to the record but doesn't show the quoted line
   (Glean's 200-char context card is the bar).
4. MODEL = Sonnet 4.6; extended thinking DROPPED (route.ts:710-717) while `<thinking_guidance>`
   still says "extended thinking enabled" — stale, contradictory.
5. PERSISTENCE drops tool/card/citation parts (page.tsx:154 keeps only `type==="text"`); reload
   rebuilds text-only -> the rich sourced transcript is lost on reload.
6. STRUCTURED FILTERS shallow: queryDeals = stage/name only (query.ts:116); no value/closeDate/
   owner predicate -> "deals > 50k closing this quarter" not precisely answerable.
7. HITL via client POST (page.tsx approveCard -> /api/contacts) + synthetic `[Approved:]` message,
   not the AI-SDK stream-resume pattern; update actions have NO diff-preview (only create cards).
8. NO record-anchored entry on the main /chat page (API supports contextType/getEntityContext; the
   page never passes it — only a separate ScopedChat does).
9. NO conversation branching/tree (Attio bar) — linear list; can't edit/fork a turn.
10. Minor: voice `lang="en-US"` hardcoded (page.tsx:278) breaks FR; email detect = regex
    `Subject:/To:`; PDF attach read as text (garbage).

## E. Best-in-market bar (top 0.1%)

- Citations: Glean (text-level deep-link + hover card w/ 200-char context, permissions-safe);
  Perplexity (8.2 sources/answer, buffer-before-stream, no dangling `[N]`); HubSpot Breeze
  (citation = live CRM record); Microsoft Deep Citations (jump to exact section/line); Claude
  Citations API (sentence-level, 0% URL hallucination).
- Grounding: text-to-tool; Lightfield (CODE EXECUTION as grounding primitive — Python sandbox over
  CRM, Feb-2026); Hex (show-the-SQL behind every number).
- Streaming steps: Cursor + Perplexity Deep Research (live collapsible tool/research steps) —
  UNOCCUPIED in CRM chat = highest-differentiation gap.
- Scoped-to-record entry: Attio (Ask Attio from a call), MS Copilot (from email thread).
- HITL: Glean Canvas (inline add/del diff), Lightfield (propose -> approve). "The diff IS the
  answer."
- Honesty: Claude (strongest); 3-state don't-know/no-data/no-access.
- Branching: Attio (fork on edit/regenerate). Memory: Lightfield living model; Claude Dreaming.
- Proactive scope escalation ("also found 4 deals with the same pattern — run across all?") — no
  product ships it = next frontier.

## F. Four-lens scoring (current -> target; >=7 requires primary evidence)

| Lens | Now | Target | Why / what moves it |
|---|---|---|---|
| Feature | 6 | 9 | Has NL+tools, create cards, coaching, drafts, memory, code-exec. Missing: record-anchored entry everywhere, diff-preview for UPDATES, conversation branching, proactive scope escalation. |
| Technologie | 5 | 9 | Sonnet 4.6 -> Opus 4.8 adaptive thinking; fix stale thinking prompt; unify citation format on row-ids; deepen structured filters (numeric/date/owner). |
| Technique | 5 | 9 | Grounding plumbing 80% there (id+_sourceLink everywhere). Kill dead `[Source N]`; Sources rail; hover-preview; persist rich transcript; stream-resume HITL. Wiring/craft = high leverage. |
| UI | 6 | 9 | Good empty state, badges, tables, transcript chips, cards, follow-ups, skeleton. Add Sources rail + hover cards, visible collapsible tool-steps w/ human labels, 3-state honesty, diff cards for updates, FR voice. |

## G. Working-Backwards PR-FAQ + Kiro tasks (RICE-ranked)

PR-FAQ (the elevated experience): "A founder opens Chat from a deal and asks 'why is this
stalling?' Elevay streams its work — 'Reading 3 emails and the last call...' — then answers in two
sentences, each claim a chip that on hover shows the exact line ('Sarah, Apr 1: we need CFO
sign-off') and on click opens the record. A Sources rail lists the 4 records it used. It proposes a
next step as a one-click diff card ('Stage Proposal -> Negotiation; add task: call CFO'). The
founder approves. Tomorrow's reload shows the whole sourced transcript intact. The founder never
opened the CRM to verify — every claim carried its proof."

Kiro tasks (ordered; each ships with a test; RICE = Reach·Impact·Confidence / Effort):

QUICK WINS (low effort, high impact — do first):
T1. Opus 4.8 + adaptive thinking for the orchestrator; delete the stale "thinking enabled" prompt
    or wire real thinking budget < maxOutputTokens. [route.ts] Test: trace shows opus + thinking.
T2. Persist the RICH transcript — save tool/card/citation parts (not only text), rehydrate on load.
    [page.tsx saveMessages + threads API + load] Test: reload keeps tool steps + badges + cards.
T3. Kill the dead `[Source N]` — make the vector-RAG path emit row-id entity links (or numbered
    sources the renderer linkifies). [route.ts formatCitedSources] Test: a vector-sourced claim
    renders a clickable source, never dead text.
T4. Deepen structured filters: queryDeals gains value/closeDate/owner predicates (numeric+date).
    [query.ts] Test: "deals > 50k closing this quarter" returns the exact set.

BIG ROCKS (the differentiation):
T5. Sources rail + hover-preview cards — aggregate provenance panel; hovering a citation shows the
    quoted line + ~200 chars context; permissions-safe. [new SourcesRail + CitationHover;
    chat-markdown] Test: every answer with claims shows a rail; hover shows the source snippet.
T6. Visible collapsible tool-steps with human labels ("Querying deals in proposal... found 7"),
    collapse to one line when done. [tool-call-panel] Test: live stream shows labeled steps.
T7. Diff-preview cards for UPDATES + stream-resume HITL (the diff IS the answer; before/after
    fields; batch with overrides). [action-card + update tools + AI-SDK resume] Test: a stage
    update shows a before/after card; approve resumes the model turn.
T8. Record-anchored entry — "Ask about this" on every record -> `/chat?contextType=&contextId=`,
    and the /chat page passes contextType so the answer auto-scopes. [record pages + page.tsx]
    Test: opening chat from a deal answers "why stalling?" without naming the deal.
T9. 3-state honesty rendering — distinct "I don't know" / "no data (show the query)" / "no access".
    [prompt + a small result component] Test: a zero-row query renders the no-data state w/ query.

PHASE 2 (bigger, after the above):
T10. Conversation branching/tree (edit/regenerate forks; restore any branch). [thread model + UI]
T11. Proactive scope escalation ("also found 4 with this pattern — run across all?").
T12. Minor: FR voice (lang from tenant), real PDF parse, structured email tool (drop the regex).

Verify code-exec grounding (tools/code-execution.ts / executeCode) renders artifacts inline (Hex/
Lightfield bar) — likely partially met; confirm in live test.

## Live test (Playwright — DONE 2026-06-06; screenshots in ./screenshots/)

Env: local `next dev --turbopack`, authenticated session (E2E Test Workspace).

Findings:
1. App builds + runs; auth session live; empty state renders cleanly (greeting, composer, 4
   starters, recent threads). [01-empty-state.png]
2. NEW live query "Which deals are at risk of stalling?" -> ERROR banner "Something went wrong"
   [02-stalling-query-12s.png]. Root cause (dev server log): `AI_APICallError: unable to verify
   the first certificate` on BOTH api.anthropic.com and api.openai.com. This is a LOCAL TLS / root-
   CA / proxy issue (NODE_EXTRA_CA_CERTS), NOT a product bug and NOT a missing key (both keys are
   SET). It blocks every LLM/embedding-dependent live check locally. (Same symptom family as the
   prod audit's chat failure — worth a permanent env fix.) Note the error UX is a single generic
   "Something went wrong / Retry" — it does NOT distinguish provider-down vs no-data vs rate-limit
   (reinforces the 3-state honesty gap, T9).
3. Reloaded a saved thread (top-5-deals table) WITHOUT needing the LLM -> confirms:
   - CITATIONS DO RENDER: the saved answer is a markdown table with clickable EntityLink BADGES
     per cell (View Deal: DataForge / View Account: NovaTech with avatar initials), and inline
     badges in the closing paragraph. The coverage-audit "citations never rendered" was WRONG.
     [03-existing-thread-reload-duplicated.png]
   - Follow-up pills render on the last assistant message.
   - CONFIRMED gap T2/#5: the reloaded transcript is text+table+badges ONLY — NO tool-call step
     panels survive reload. Tool/step parts are dropped at persistence (badges survive only because
     they are encoded in the markdown text).
4. NEW BUG (live-only): on reload, the entire user+assistant exchange renders DUPLICATED (identical
   Q + identical table answer twice). Persistence/rehydration correctness bug in saveMessages /
   thread load (likely lastSavedCount mis-tracking double-saving, or load appending to a non-empty
   message list). Add task:

T13. Fix reload duplication — a saved thread must rehydrate each turn exactly once. [page.tsx
     saveMessages/load + threads API] Test: reload a 1-exchange thread -> exactly 1 user + 1
     assistant message. (Raises T2 from "persist rich parts" to "persist rich parts correctly".)

TLS unblocked 2026-06-06 by injecting the Windows root/CA store into Node via
NODE_EXTRA_CA_CERTS (verification stays ON) — dev `.dev-ca-bundle.pem`. Live LLM turns now work.

Live re-test after TLS fix:
- Chat answers end-to-end. Tool calls render as a labeled COLLAPSIBLE panel ("Checked deal
  risk") [04-working-answer-toolstep-honest.png] -> T6 is PRESENT (deepen, not add).
- Honest no-data answer observed: "No open deals ... 767 accounts and no deals tracked ... want
  me to create some?" -> T9 baseline is good; the 3-state distinction is the refinement.
- Test-tenant data state: 767 accounts, 0 contacts, 0 deals (the old "top 5 deals" thread was
  stale April data).

## Fixes applied (2026-06-06, branch feat/page-elevation, commit 43e67ecb)
- T13 reload duplication — FIXED + VERIFIED. Re-entrancy guard (savingRef) in page.tsx
  saveMessages. Root cause: a double-invoked save effect double-POSTed each exchange (4 rows for a
  1-turn thread, inserts 3 ms apart; duplicated on reload). Verified: fresh thread stores exactly
  [user, assistant]; a follow-up appends exactly one pair (4 total, not 6); reload renders once.
  NOTE: pre-existing threads stay doubled (StrictMode is dev-only, so prod may be clean — verify;
  optional one-off dedup migration if prod is affected).
- T3 dead [Source N] — FIXED. route.ts formatCitedSources exposes each record path + steers the
  model to the clickable entity-link format (chat-markdown.tsx only linkifies real entity hrefs).
  Route verified to recompile + answer post-edit.

Deferred to Pass 2 (elevations, not defects): persist rich transcript parts (tool/cards lost on
reload); Opus 4.8 + adaptive thinking + remove the stale `<thinking_guidance>` ("extended thinking
enabled" is false — thinking is dropped in route.ts); Sources rail + hover-preview; deepen
structured filters; diff cards for updates; record-anchored entry; branching UI (server DAG already
exists in the threads route).
