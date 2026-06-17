# INBOX-S08 — Long-thread TL;DR + key decisions
> Theme: T3 · Autonomy rung: helper · Priority: P1
> Pillar: P2 reading

## User story
As a user joining or revisiting a long, multi-party email thread, I want a TL;DR plus an explicit
list of the decisions made, open questions, and who-owns-what — each cited to the message where it
happened — so I understand the state of play without rereading the whole chain.

## Why (audit anchor)
Superhuman's Auto Summarize gives a thread TL;DR (`ai-feature-deep-dive.md` step 1), but it's a
single uncited line. Superhuman's MCP **Deal Tracker** skill "summarizes comms history with a
contact/company" (`ai-feature-deep-dive.md` §MCP) — decision tracking over a relationship. We have
neither. This spec extends INBOX-S01 from "what's this thread about" to "**what was decided, what's
open, who owns what**" — the artifact a founder needs on a 30-message negotiation. Our edge: every
decision/owner/open-question is **cited to its source message** (Lightfield recall).

## Requirements (EARS)
- WHEN a thread exceeds a length threshold (e.g. ≥ 6 messages OR ≥ N tokens), the system SHALL
  produce, in addition to the TL;DR (INBOX-S01): a list of **decisions made**, **open questions**,
  and **owners / commitments** (who agreed to do what), each cited to its message, "via Elevay".
- Each decision/open-question/owner item SHALL deep-link to the message + span it was derived from;
  the system SHALL NOT assert a decision the thread didn't contain.
- The system SHALL detect **superseded** decisions (a later message reverses an earlier one) and show
  the current state, citing both ("changed on <date>"), not just the first occurrence.
- The summary SHALL be cached (keyed by conversation + last-message ts) and regenerate only on a new
  message, reusing INBOX-S01's cache slot.
- WHEN a thread is below the threshold, the system SHALL fall back to the plain S01 summary (no
  decisions block), so short threads aren't padded.
- WHEN generation fails/pending, the system SHALL show "Decisions unavailable" (`hallucination-fallback.tsx`),
  never a fabricated decision list.
- The system SHALL respect per-user/tenant scope.
- WHEN zero-retention AI is enabled, generation SHALL run without third-party retention (INBOX-P03).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a 14-message contract thread WHEN opened THEN a TL;DR plus three sections (Decisions / Open questions / Owners) render, each item linking to its source message.
- GIVEN the price was agreed at €40k then later changed to €38k WHEN summarized THEN the Decisions section shows €38k as current and cites the change ("was €40k, changed <date>").
- GIVEN an unresolved "who signs?" in the thread WHEN summarized THEN it appears under Open questions, cited.
- GIVEN a commitment "Marie will send the MSA Friday" WHEN summarized THEN Owners shows "Marie → send MSA (Fri)", cited (and resolvable via S05).
- GIVEN a 3-message thread WHEN opened THEN only the S01 TL;DR shows, no Decisions block.
- GIVEN a decision the thread never made WHEN I read the summary THEN it is absent (grounded only).
- GIVEN a new message arrives WHEN I reopen THEN decisions/owners are recomputed.

## Edge cases & failure handling
- Contradictory messages with no clear resolution → list as an Open question ("price not finalized: €40k vs €38k proposed"), not a fabricated decision.
- Forwarded external sub-threads → scope to messages the user can see; don't infer hidden context.
- Many small decisions → cap the list with "+N more", prioritizing the most material (amounts, dates, go/no-go).
- Non-English / mixed-language thread → summarize in UI language; cite original messages.
- Owners that don't resolve to a contact (S05 Inferred) → show the name as written, don't link to a wrong contact.
- Multi-tenant/user scope enforced.

## Best-in-class bar
- A **decision ledger with supersession** ("was X, now Y, changed <date>"), cited — neither Superhuman's one-line TL;DR nor a generic summarizer tracks reversals; a founder negotiating reads the *current* state with provenance.
- Owners/commitments resolve through our CRM graph (S05) and can become next actions (G05) — Deal-Tracker-grade, but native and cited.

## Design sketch
- **Data:** extend INBOX-S01's `metadata.threadSummary` with `{ decisions:[{text, current, supersedes?, citations[]}], openQuestions:[{text, citations[]}], owners:[{who, commitment, dueAt?, citations[]}] }`. Same JSONB slot on the newest inbound activity; no migration.
- **API:** the same thread-level pass (`enrichment/thread-intelligence-requested`, `inngest/sync-functions.ts:570`) that already groups by thread and extracts "buying signals, objections, urgency" — extend its schema with decisions/open-questions/owners. Surface via the detail route alongside S01. Reuse S05 for owner resolution + due dates.
- **UI:** below the S01 TL;DR card in `_conversation-pane.tsx`, three labeled sections (Decisions / Open questions / Owners). Surface = card sections, headers `text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)]`, items with citations via `cited-claim.tsx`; supersession shown as `text-[var(--color-text-tertiary)]` strikethrough on the old value + current value primary; lucide `GitCommitHorizontal`/`HelpCircle`/`UserCheck`; shortcut: extends the `i` summary toggle (S01). Light+dark via tokens, no emoji, no provider name, cited "via Elevay".
- **AI:** model role = grounded decision/owner/question extractor with supersession reasoning; grounding = thread messages; autonomy = helper. Fail-closed: contradiction ⇒ Open question, never a guessed decision.
- **Security/perf:** reuses S01 cache key; folds into the thread pass; scoped; zero-retention honored.

## Tasks (ordered, each with a verify step + test to write)
1. Extend the thread-intelligence schema with decisions/openQuestions/owners (+ supersession). (verify: a seeded 14-msg thread yields cited decisions; a reversal shows current+old) (test: `thread-decisions.test.ts` — supersession; contradiction→open question; grounded-only)
2. Surface the new sections via the detail route on `threadSummary`. (verify: API returns them) (test: load-shape)
3. Decisions/Owners/Questions UI sections under the S01 card. (verify: browser on a long real thread — sections render, citations link, supersession visible) (test: dom render)
4. Owner resolution (S05) + next-action wiring (G05). (verify: an owner commitment offers a next action) (test: owner→action mapping)

## Current-state notes (VERIFY before building)
- Builds on **INBOX-S01** (shares `metadata.threadSummary` + cache key + `i` toggle) and the existing thread-level pass `enrichment/thread-intelligence-requested` (`inngest/sync-functions.ts:557–574`, writes `metadata.threadIntelligence`, surfaced at `conversations.ts:330–336`). VERIFY.
- Reuses **INBOX-S05** for owner→contact resolution and due dates; can feed **INBOX-G05** (next action).
- No decision/owner tracking exists today. Superhuman's "Deal Tracker" MCP skill is the conceptual bar; ours is native + cited.
