# INBOX-C02 — Instant one-tap replies (3 suggestions)
> Theme: T4 · Autonomy rung: helper · Priority: P0
> Pillar: P3 writing

## User story
As a user clearing my inbox fast, I want three short, ready-to-send reply suggestions on a
thread so I can pick one with a single tap (or key) instead of writing from scratch.

## Why (audit anchor)
Superhuman ships **Instant Reply** (`audit.md` §3; `findings.md` §G) — one-tap suggested replies
that move a thread forward in a keystroke; the sidebar even offers quick-action buttons
("Refer" / "no thanks", `ai-feature-deep-dive.md`). We already have the generator
(`/api/emails/suggest-reply` returns exactly 3 toned replies) but it is only reachable as a
hidden fallback inside `openReply`; C02 surfaces the three as **tappable chips** with our tokens.

## Requirements (EARS)
- WHEN a thread with a last inbound message is open, the system SHALL offer up to three one-tap
  reply suggestions (brief / detailed / decline), each a complete sendable body + subject.
- The system SHALL generate suggestions grounded in the last inbound message (reference its
  specifics), in the user's voice (reuse `buildWritingStylePrompt`), never a generic template.
- WHEN the user taps a suggestion, the system SHALL load it into the composer fully editable; it
  SHALL NOT send without a further explicit action.
- The system SHALL be keyboard-operable: a shortcut opens suggestions; `1`/`2`/`3` pick one.
- The system SHALL cache the generated suggestions on the open conversation so re-opening the
  same thread does not re-call the LLM unless the thread changed.
- The system SHALL degrade gracefully: on generation failure, show no chips and a non-blocking
  toast, and keep the manual composer available.
- The system SHALL be tenant/user-scoped and respect the LLM rate limit and zero-retention option.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a prospect email asking a question WHEN suggestions load THEN three chips appear (brief /
  detailed / decline), each referencing the question, each under its length rule.
- GIVEN the user presses `2` WHEN chips are shown THEN the "detailed" suggestion loads into the
  composer, editable, unsent.
- GIVEN a thread with no inbound message (outbound-only) WHEN opened THEN no suggestion chips show
  (nothing to reply to).
- GIVEN the LLM returns fewer than 3 options WHEN rendering THEN only the returned chips show (no
  empty/placeholder chip), never a fabricated "Replied"-style stub.
- GIVEN suggestions already cached for the current thread state WHEN re-opened THEN they render
  instantly with no new LLM call.
- GIVEN generation fails WHEN opening THEN a warning toast shows and the blank composer is usable
  (parity with `_conversation-pane.tsx:171-174`).

## Edge cases & failure handling
- Very long inbound → summarize first (INBOX-S08) so the suggestion answers the real ask.
- Sensitive/legal-sounding thread → still suggest, but the "decline/defer" option is offered first.
- Non-English inbound → suggestions in the inbound language (INBOX-C08), voice preserved.
- Duplicate/near-identical options → de-dupe so the three chips are genuinely distinct.
- Zero-retention mode → suggestions not persisted; regenerated on demand.
- Multi-tenant: never surface or cache another user's thread suggestions.

## Best-in-class bar
- The "decline/defer" option is a real GTM move — gracious, door-open, with a concrete alternative
  path (the existing prompt already enforces "zero guilt, door stays open",
  `suggest-reply/route.ts:55`) — Superhuman's generic instant replies don't reason about the deal.
- Suggestions are **voice-matched** from the user's actual sent mail, so even the one-tap option
  sounds like them, not the tool.

## Design sketch
- **Data:** none new; uses the open thread + voice samples (`lib/writing-profile.ts`). Cache the
  three options in component state keyed by `conversationKey` + `lastInboundAt`.
- **API:** reuse `POST /api/emails/suggest-reply` (already returns `replies[{tone,subject,body}]`);
  extend its body to optionally pass `conversationKey` so the server can fetch the user's voice
  samples and last inbound rather than the client posting raw content.
- **UI:** a chip row under the thread header in `_conversation-pane.tsx` (between header `:289` and
  body). Chips = `components/ui/Button` `variant="outline" size="sm"` with a lucide leading icon per
  tone (`Reply` brief, `AlignLeft` detailed, `XCircle` decline), labels in token text colors;
  selected = `--color-bg-selected`. Shortcut: a "Suggestions" affordance + `1`/`2`/`3` to pick;
  light+dark via tokens, no emoji, no provider name, citation-free (these are generated, not facts —
  but a "voice-matched" tooltip explains the source).
- **AI:** `claude-sonnet-4-6` via `tracedGenerateObject` (existing route); structured 3-tone schema
  (existing `suggestReplySchema`); `_trace.agentId="suggest-reply"`.
- **Security/perf:** rate-limited (existing); per-thread cache avoids repeat calls; zero-retention honoured.

## Tasks (ordered, each with verify + test)
1. Extend `/api/emails/suggest-reply` to accept `conversationKey` → server-side fetch last inbound +
   `getWritingSamples`, so the client need not post raw bodies. (verify: 200 with 3 toned replies
   from a key) (test: route test, key + legacy raw-content paths).
2. Chip row UI in `_conversation-pane.tsx` with per-thread cache + `1/2/3` shortcuts → tap loads
   `setComposer`. (verify: browser — three chips, key picks, composer fills, unsent) (test: pane test).
3. Empty/partial/dedup guards: no inbound → no chips; <3 options render cleanly; near-dupes dropped.
   (verify: outbound-only thread shows none) (test: render-guard unit).
4. Zero-retention + scope: suggestions not persisted under P03; cross-tenant key rejected. (verify:
   P03 on → nothing stored) (test: scope/retention test).

## Current-state notes (VERIFY before building — code moves)
- Generator EXISTS and already returns 3 toned replies: `app/api/emails/suggest-reply/route.ts`
  (schema :8, prompt :45, brief-tone selection mirrored in `_conversation-pane.tsx:164`).
- Today the 3 options are NOT surfaced as chips — `openReply` only auto-picks the `brief` one
  (`_conversation-pane.tsx:164-170`). C02 = expose all three as one-tap chips.
- Voice samples via `lib/writing-profile.ts`; currently suggest-reply does NOT inject them (the
  email-generation route does, `app/api/emails/route.ts:132`) — add for voice-matched suggestions.
