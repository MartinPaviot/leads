# INBOX-C04 — Rewrite commands (free-form + GTM presets)
> Theme: T4 · Autonomy rung: helper · Priority: P0
> Pillar: P3 writing / P5 GTM moat (cross)

## User story
As a user editing a draft, I want to reshape it with one click — shorten, fix grammar, change
tone, or "propose the next step" — or describe the edit in my own words, so I refine fast without
rewriting by hand.

## Why (audit anchor)
Superhuman's in-composer **AI rewrite** (the composer "ai" icon) selects the draft and opens a
free-form **"Describe how to edit the text"** box plus one-click **Improve writing · Fix spelling
and grammar · Shorten · Lengthen · Simplify · Rewrite (tone)** (`ai-feature-deep-dive.md` §"FULL
AI-reply flow" step 4). That is the exact preset set to match. OUR edge: add **GTM-aware** presets
that respect the deal stage — "tie to their pain", "add the case study", "propose the next step /
book the demo" (`ai-feature-deep-dive.md` §"OUR bar"). It runs on a draft the user already has in
the composer (the existing `setComposer` body in `_conversation-pane.tsx`).

## Requirements (EARS)
- WHEN the user opens the rewrite control in the composer, the system SHALL offer a free-form
  "Describe how to edit" input AND one-click presets: Improve writing, Fix spelling & grammar,
  Shorten, Lengthen, Simplify, Rewrite (tone: pick formal/casual/warm/direct).
- The system SHALL additionally offer GTM presets grounded in the open thread's deal/contact:
  "Tie to their pain", "Add the case study", "Propose the next step / book the demo".
- WHEN a rewrite runs, the system SHALL transform the CURRENT composer body (or the user's text
  selection if any) and return the rewritten text for the user to accept or discard.
- The system SHALL preserve the user's voice (reuse `buildWritingStylePrompt`) on every rewrite —
  a rewrite must not flatten their style into generic business prose.
- For GTM presets, the system SHALL ground in real cited context (deal stage, signals, case-study
  asset) and SHALL NOT invent facts (case study/metric must come from the knowledge base or be a
  `[fill in]` placeholder).
- The system SHALL keep the rewrite reversible: the prior body is restorable (one undo) before send.
- The system SHALL be tenant/user-scoped, rate-limited (`checkRateLimit("llm")`), and honour
  zero-retention (INBOX-P03).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a 200-word draft WHEN "Shorten" is clicked THEN a materially shorter version replaces the
  body, preserving the key ask and the user's voice.
- GIVEN a draft with typos WHEN "Fix spelling & grammar" is clicked THEN errors are corrected with
  no other content change.
- GIVEN the free-form box "make it sound less salesy and add a question" WHEN run THEN the body is
  rewritten accordingly.
- GIVEN an open deal at "proposal" stage WHEN "Propose the next step" is clicked THEN the rewrite
  adds a concrete next step appropriate to that stage (e.g. book the deep-dive), grounded + cited.
- GIVEN "Add the case study" WHEN no matching case study exists in the knowledge base THEN the
  rewrite inserts a `[fill in: case study]` placeholder, never a fabricated customer/metric.
- GIVEN any rewrite WHEN the user clicks Undo THEN the previous body is restored exactly.
- GIVEN a rewrite call fails THEN the original body is untouched and a non-blocking toast shows.

## Edge cases & failure handling
- Empty composer → presets disabled; free-form box prompts the user to draft first (offer INBOX-C01).
- Partial selection vs whole body → operate on the selection if present, else the whole body; state which.
- Tone preset on already-terse text → still apply, but don't pad with filler.
- Non-English draft → rewrite in the same language (INBOX-C08), voice preserved.
- GTM preset on an unknown counterparty (no deal) → fall back to a generic "propose a next step",
  assert no CRM facts, note that context was unavailable.
- Zero-retention → no draft/sample stored beyond the request.
- Multi-tenant: voice samples + knowledge-base assets strictly within the viewer's tenant.

## Best-in-class bar
- The preset set **matches** Superhuman's exactly, then **extends** it with deal-stage-aware GTM
  rewrites tied to our CRM — competitors have no deal graph to reason over.
- GTM presets are **grounded + cited** (case study from the knowledge base, next step from the deal
  stage); a missing asset becomes a visible placeholder, never an invention (Lightfield's no-fabrication bar).
- Every rewrite is **voice-preserving** (reuses the same sent-mail few-shot as compose), so refining
  never makes the email sound like the tool.

## Design sketch
- **Data:** none new. Voice via `lib/writing-profile.ts`; GTM grounding from the open thread's
  contact/deal/signals + the knowledge base (case-study assets) — reuse INBOX-C01's `draft-context`.
- **API:** `POST /api/inbox/rewrite` `{ text, command, tone?, conversationKey? }` → returns
  `{ text, citations?, placeholders? }`. `command ∈ {improve, grammar, shorten, lengthen, simplify,
  tone, gtm_pain, gtm_case_study, gtm_next_step, freeform}`. Freeform carries the user's instruction.
- **UI:** a rewrite popover anchored to a `Wand2` (or `Sparkles`) lucide icon in the composer toolbar
  inside `_conversation-pane.tsx`. Popover = card `--color-bg-card`, `--shadow-floating`, `rounded-lg`;
  free-form `Input` on top, preset buttons (`components/ui/Button` `variant="ghost" size="sm"`) in a
  grid; GTM presets in a labelled "For this deal" group (`text-[10px] uppercase tracking-wider`,
  `--color-text-tertiary`). Result swaps the composer body with an **Undo** chip. Shortcut: a composer
  key (e.g. `⌘J`) opens the popover. Light+dark via tokens, no emoji, no provider name; GTM rewrites
  carry citations.
- **AI:** `claude-sonnet-4-6` via `tracedGenerateObject`; prompt = command + current body +
  `buildWritingStylePrompt(samples)` (+ cited context for GTM presets); `_trace.agentId="rewrite"`.
- **Security/perf:** rate-limited; selection-scoped to avoid wasted tokens; zero-retention honoured;
  one-step undo held in component state (no server round-trip to revert).

## Tasks (ordered, each with verify + test)
1. `POST /api/inbox/rewrite` with the command enum + voice injection; GTM commands pull cited context
   (reuse C01 `draft-context`). (verify: each command returns transformed text; GTM returns citations)
   (test: `rewrite.test.ts` per command + unknown-deal fallback + fabrication guard).
2. Composer rewrite popover in `_conversation-pane.tsx` (free-form + presets + GTM group) replacing the
   body with an Undo chip. (verify: browser — shorten/grammar/tone/freeform/GTM all work; Undo restores)
   (test: popover interaction test).
3. Selection vs whole-body handling + empty-composer disable. (verify: selection-only rewrite; empty →
   presets disabled) (test: selection-scope unit).
4. Voice-preservation + no-fabrication contract: rewrites keep the user's style; missing case study →
   placeholder. (verify: voice retained; no invented metric) (test: prompt-contract unit).
5. Zero-retention + scope. (verify: P03 on → nothing stored; cross-tenant context blocked) (test: retention/scope).

## Current-state notes (VERIFY before building — code moves)
- The composer body is plain state set by `setComposer` in `_conversation-pane.tsx` (e.g. `:137`,
  `:165`); there is NO in-composer rewrite control today — this spec adds it.
- Voice few-shot EXISTS: `lib/writing-profile.ts` (`buildWritingStylePrompt`); reuse for every rewrite.
- No `/api/inbox/rewrite` route exists yet. GTM grounding reuses INBOX-C01's `draft-context` (to build)
  + the knowledge base (case-study assets) — VERIFY the knowledge-base read path before wiring GTM presets.
