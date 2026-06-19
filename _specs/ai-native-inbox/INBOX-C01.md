# INBOX-C01 — Voice-matched full draft (agentic compose)
> Theme: T4 · Autonomy rung: helper · Priority: P0
> Pillar: P3 writing / P5 GTM moat (cross)

## User story
As a founder replying to a prospect, I want one click to generate a full reply written in
*my* voice, matched to *their* tone, and grounded in *their* deal context with citations, so
the draft is one I can send almost as-is instead of a generic template.

## Why (audit anchor)
Superhuman's Ask AI is an **agent**, not a chatbot: asked to draft a reply it "checks your
writing style first", "matches the counterparty's tone", auto-fills `To:`, answers their actual
question and knows your company, then offers **Send / Insert Draft** with a plain explanation
(`ai-feature-deep-dive.md` §"AI-assisted REPLY"; `findings.md` §I screenshot 028). That is the
bar. Ours must do the same **plus** ground the draft in the deal/contact/signal graph **with
citations** — Superhuman joins contacts+voice+calendar; we join the whole GTM graph
(`findings.md` §I). We already have the voice seam (`lib/writing-profile.ts`) and a reply
generator (`/api/emails/suggest-reply`) — C01 fuses them into one grounded, cited draft.

## Requirements (EARS)
- WHEN the user invokes "Draft reply" on an open thread, the system SHALL generate ONE full
  reply that (a) auto-fills `To:` from the thread, (b) answers the last inbound message's actual
  ask, and (c) is written in the user's own voice.
- The system SHALL learn the user's voice from their real sent mail via
  `getWritingSamples`/`buildWritingStylePrompt` (`lib/writing-profile.ts`), never a generic style.
- The system SHALL match the counterparty's register (formality/length/warmth) inferred from the
  thread, and state the inferred register in the explanation line.
- WHEN the counterparty resolves to a contact/company/deal, the system SHALL ground the draft in
  that context (deal stage, last interaction, signals) reusing the Call Mode cited brief builders,
  and SHALL attach a citation for every external fact it asserts.
- The system SHALL NOT assert any fact it cannot cite; an unknown fact SHALL be omitted or shown
  as a `[fill in]` placeholder, never fabricated (and the explanation SHALL say what was omitted).
- The system SHALL show a short "what I did / what to check" explanation beneath the draft
  (voice source, tone read, grounding sources, any placeholders).
- The system SHALL offer **Insert draft** (load into the composer to edit) and **Send**; it SHALL
  NOT send without an explicit user action.
- The system SHALL run under the LLM rate limit (`checkRateLimit("llm", userId)`), be tenant- and
  user-scoped, and honour the zero-retention AI option (INBOX-P03) when enabled.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a thread from a known prospect with an open deal WHEN "Draft reply" is clicked THEN the
  draft answers their question, references the deal/last interaction, and each external fact has a
  clickable citation.
- GIVEN the user has ≥1 prior sent email WHEN drafting THEN the draft reproduces their greeting,
  sign-off and sentence rhythm (voice-matched), not a generic business tone.
- GIVEN the user has zero sent mail WHEN drafting THEN the draft uses a neutral direct tone and the
  explanation says voice could not be learned yet (links to INBOX-O03).
- GIVEN the counterparty is unknown (no contact) WHEN drafting THEN the draft still answers the
  thread, asserts no CRM facts, and offers "Add to CRM" (INBOX-G02) in the explanation.
- GIVEN a fact the model wants but cannot cite (e.g. a price) WHEN drafting THEN it renders a
  `[fill in: pricing]` placeholder, never an invented number.
- GIVEN the user clicks **Insert draft** THEN the composer opens pre-filled (To/subject/body) and
  fully editable; nothing is sent.
- GIVEN the model call fails THEN the user gets a non-blocking toast and a blank composer opens
  (degrade like the existing `openReply` catch in `_conversation-pane.tsx:172`).

## Edge cases & failure handling
- Counterparty maps to several open deals → ground in the most relevant; explanation lists the rest.
- Non-English thread → draft in the thread's language (INBOX-C08 path); voice samples may be EN —
  preserve the user's mannerisms but in the thread language, and say so.
- Very long thread → summarize first (reuse INBOX-S08 TL;DR) before drafting so the ask is captured.
- Citation target later deleted → mark the citation stale, never dangle (mirror INBOX-G01 rule).
- Zero-retention mode → no draft/sample persisted beyond the request; explanation notes it.
- Multi-tenant: voice samples + CRM grounding strictly within the viewer's tenant/user scope.

## Best-in-class bar
- Theirs grounds on contacts+voice+calendar; **ours grounds on the deal/signal/last-interaction
  graph with a citation per fact** — the draft is right because it's tied to our CRM, not guessed.
- The voice match uses the user's **actual sent emails** (already in `activities` as `email_sent`),
  so it's their real rhythm, not a settings questionnaire — and it improves as they send more.
- Every draft is **auditable**: the explanation names its voice source, tone read and grounding
  sources, so the founder trusts what they send (Lightfield's cited-recall bar).

## Design sketch
- **Data:** voice from `activities` (`activityType="email_sent"`, body in `metadata`) via
  `lib/writing-profile.ts`. Grounding from contacts/companies/deals + `lib/accounts/last-interaction.ts`
  + signals (freshness-gated) — reuse the Call Mode brief assembler (jsonb-cached, fail-closed).
- **API:** extend `POST /api/emails/suggest-reply` (or a sibling `/api/inbox/draft-reply`) to accept
  `conversationKey`, resolve scope (`getInboxScope`), fetch the brief + voice samples, and return
  `{ subject, body, citations[], explanation, placeholders[] }` (single grounded draft, not 3 tones).
- **UI:** a "Draft reply" action in `_conversation-pane.tsx` header (next to the existing **Reply**
  button at `:292`). Surface = inline card above the composer (card `--color-bg-card`, `--shadow-panel`,
  `rounded-lg`), body in Inter `text-[13px]`, citations as superscript chips that open a popover
  (reuse INBOX-G01 citation popover), explanation in `--color-text-secondary text-[12px]`. Primary
  button **Insert draft** (`Sparkles` lucide icon) + secondary **Send** (`Send` icon); accent
  `var(--color-accent)`. Shortcut: open with `r` (reuse the existing `replySignal` path) and a
  "Draft" affordance; light+dark via tokens, no emoji, no provider name, cited.
- **AI:** `anthropic("claude-sonnet-4-6")` via `tracedGenerateObject` (as in suggest-reply:74);
  prompt = thread + `buildWritingStylePrompt(samples)` + the cited brief; structured output with a
  `citations` array so every fact is traceable; `_trace.agentId="draft-reply"`.
- **Security/perf:** `checkRateLimit("llm")`; tenant/user scope on every lookup; fail-closed grounding
  (omit unciteable facts); zero-retention honoured (INBOX-P03).

## Tasks (ordered, each with verify + test)
1. Brief assembler reuse: a `lib/inbox/draft-context.ts` that, given `conversationKey`+scope, returns
   the cited GTM bundle (compose Call Mode brief + last-interaction + freshness). (verify: returns
   cited fields for a known contact, empty+flagged for unknown) (test: `draft-context.test.ts`).
2. `/api/inbox/draft-reply` route: scope → voice samples + brief → single grounded draft with
   `citations`/`explanation`/`placeholders`. (verify: 200 with citations on a known thread; 401 unauth)
   (test: route test incl. unknown-sender + zero-samples branches).
3. Composer integration in `_conversation-pane.tsx`: "Draft reply" → inline card → **Insert draft**
   pre-fills `setComposer`; **Send** routes through existing send + `handleSent` (`:186`). (verify:
   browser — draft inserts, edits, sends; nothing auto-sends) (test: pane interaction test).
4. Voice-absent + fabrication guards: no samples → neutral tone + note; unciteable fact → placeholder.
   (verify: zero-sent-mail tenant gets the note; no invented prices) (test: prompt-contract unit).
5. Zero-retention + scope: no persistence in zero-retention mode; cross-tenant lookups blocked.
   (verify: P03 on → nothing stored; cross-tenant key 404s) (test: scope/retention test).

## Current-state notes (VERIFY before building — code moves)
- Voice seam EXISTS: `lib/writing-profile.ts` (`getWritingSamples` :10, `buildWritingStylePrompt` :38);
  already used by `app/api/emails/route.ts:132` and `lib/chat/tools/action.ts:97`. REUSE, don't rebuild.
- Reply generator EXISTS: `app/api/emails/suggest-reply/route.ts` (3 tones, `claude-sonnet-4-6`,
  `tracedGenerateObject`, rate-limited). C01 = a grounded **single-draft** sibling/extension.
- Composer seam EXISTS: `_conversation-pane.tsx` `openReply` (:132) already prefers `preparedDraft`,
  falls back to suggest-reply, opens `setComposer`; `handleSent` (:186) consumes the draft.
- Cited brief EXISTS (Call Mode prospect brief, jsonb-cached, fail-closed) — compose it; no inbox
  draft-context endpoint exists yet. NO citations array in suggest-reply today (must add).
