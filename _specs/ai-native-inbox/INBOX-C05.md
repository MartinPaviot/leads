# INBOX-C05 — Intelligent autocomplete grounded in your history
> Theme: T4 · Autonomy rung: helper · Priority: P1
> Pillar: P3 writing / P5 GTM moat (cross)

## User story
As a user typing a reply, I want inline completions that finish my sentence with the right facts,
links and phrasing pulled from my own history and the prospect's context — so I write faster and
never paste the wrong link or price.

## Why (audit anchor)
Superhuman ships **Autocomplete** (Settings, ON by default — `feature-inventory.md` §"Autocomplete")
and Shortwave's differentiator is **autocomplete with real links/facts from your history**
(`audit.md` §3). The bar is not generic next-word prediction — it's completion grounded in *your*
sent mail and *your* data. OUR edge: ground completions additionally in the **CRM/deal graph** so a
completion can surface the prospect's real next step or a cited fact, not just a remembered phrase.

## Requirements (EARS)
- WHILE the user is typing in the composer, the system SHALL offer an inline (ghost-text) completion
  of the current sentence/phrase that the user can accept with `Tab`.
- The system SHALL ground completions in (a) the user's own recent sent mail (phrasing/links) and
  (b) the open thread's contact/deal context (facts/next step), never generic boilerplate.
- The system SHALL NOT complete with an unverifiable fact (price, date, customer name); when a fact
  would be needed it SHALL stop the suggestion at a safe boundary rather than invent.
- The system SHALL be dismissible (`Esc`) and non-intrusive: typing past or around the ghost text
  cancels it; it SHALL never auto-insert without `Tab`.
- The system SHALL debounce requests and cancel stale ones so typing stays smooth (no lag/jank).
- The system SHALL be tenant/user-scoped, rate-limited, and honour zero-retention (INBOX-P03 →
  feature disabled or local-only, never persisting keystrokes).
- The system SHALL be toggleable per user (default on), matching the autonomy-settings hub (INBOX-O06).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN the user types "Let me send you the" WHEN a completion is offered THEN it suggests a phrase
  consistent with their past sent mail (e.g. "the deck and a short Loom"), accepted with `Tab`.
- GIVEN the open thread has an open deal WHEN typing "The next step would be" THEN the completion
  proposes the deal-stage-appropriate next step.
- GIVEN a completion would require a price not in context WHEN offered THEN it stops before the
  number (e.g. "Our pricing is ") rather than inventing one.
- GIVEN the user keeps typing different text WHEN a ghost completion is shown THEN the stale
  completion is cancelled and not inserted.
- GIVEN the user presses `Esc` WHEN a completion is shown THEN it disappears and typing continues.
- GIVEN autocomplete is toggled off WHEN typing THEN no completions are requested or shown.
- GIVEN zero-retention is enabled WHEN typing THEN keystrokes are not persisted server-side.

## Edge cases & failure handling
- Slow network → no ghost text rather than late/janky insertion; never block the keystroke.
- Mid-word vs end-of-sentence → only suggest at safe token boundaries.
- Pasting / IME composition → suppress completions during composition to avoid corrupting input.
- Non-English typing → complete in the same language (INBOX-C08).
- Unknown counterparty → fall back to voice/history-only completions, no CRM facts.
- Multi-tenant: history + CRM facts strictly within the viewer's tenant/user scope.

## Best-in-class bar
- Completions are grounded in **both** the user's real sent mail **and** the cited deal graph —
  Superhuman/Shortwave complete from your mailbox alone; ours can finish "the next step is …" with the
  actual deal-stage move.
- **No-fabrication guarantee**: the model stops before a fact it can't verify, so autocomplete never
  inserts a wrong price/date — a trust property generic LLM autocomplete lacks.

## Design sketch
- **Data:** user sent mail (`activities` `email_sent`, via `lib/writing-profile.ts`) + the open
  thread's cited context (reuse INBOX-C01 `draft-context`). No new tables.
- **API:** `POST /api/inbox/autocomplete` `{ prefix, conversationKey? }` → `{ completion }` (short,
  bounded). Server fetches a compact voice/context snippet; aggressively length-capped for latency.
- **UI:** ghost text inside the composer `textarea`/editor in `_conversation-pane.tsx` (overlay span
  in `--color-text-placeholder`); `Tab` accepts, `Esc` dismisses. No icon/badge needed inline; a small
  "Autocomplete on" affordance in settings (INBOX-O06). Light+dark via tokens, no emoji, no provider
  name; CRM-derived completions are themselves cited only when surfaced as a fact (otherwise they're phrasing).
- **AI:** a fast model (`claude-sonnet-4-6` or a cheaper short-output model) via `tracedGenerateObject`/
  text generation; tight `maxTokens`; `_trace.agentId="autocomplete"`. Debounce ~250ms, cancel inflight.
- **Security/perf:** rate-limited + debounced + cancellable; zero-retention → disable or local-only;
  per-user toggle; never log raw keystrokes.

## Tasks (ordered, each with verify + test)
1. `POST /api/inbox/autocomplete` returning a bounded completion grounded in voice + (optional) cited
   context, with a no-fabrication stop rule. (verify: returns a short completion; stops before unknown
   facts) (test: `autocomplete.test.ts` incl. fact-stop + unknown-deal fallback).
2. Ghost-text UI + `Tab`/`Esc` + debounce/cancel in `_conversation-pane.tsx`. (verify: browser — smooth
   typing, Tab accepts, Esc/typing cancels) (test: editor interaction test).
3. IME/paste suppression + boundary-only suggestions. (verify: no corruption during composition)
   (test: composition-guard unit).
4. Per-user toggle + zero-retention. (verify: off → no requests; P03 → no persistence) (test: toggle/retention).

## Current-state notes (VERIFY before building — code moves)
- No inbox autocomplete exists today; the composer is a plain controlled field in `_conversation-pane.tsx`.
- Voice/history seam EXISTS (`lib/writing-profile.ts`); CRM grounding reuses INBOX-C01 `draft-context`
  (to build). VERIFY the composer is a contenteditable/textarea that can host an overlay before
  choosing the ghost-text rendering approach.
- Rate-limit helper EXISTS (`lib/infra/rate-limit.ts` `checkRateLimit("llm", userId)`); reuse and add
  debounce to keep token spend and latency in check.
