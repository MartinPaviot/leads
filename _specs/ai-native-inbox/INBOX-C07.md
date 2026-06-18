# INBOX-C07 — Draft from bullet points
> Theme: T4 · Autonomy rung: helper · Priority: P1
> Pillar: P3 writing

## User story
As a user who knows what to say but not how to phrase it, I want to type a few bullets and get a
full, well-formed email in my voice (grounded in the thread/deal), so I express intent fast and
keep the polish.

## Why (audit anchor)
Voice-matched **draft-full-reply** and **rewrite** are core writing capabilities across Superhuman/
Shortwave (`audit.md` §2 Writing). "Bullets → email" is the dictation-to-draft variant of the same
agentic compose (`findings.md` §I: the AI joins your intent + voice + context). It reuses the C01
generator with the user's bullets as the spec for content, the thread as grounding, and their sent
mail as the voice — OUR edge is grounding the expansion in the **cited deal graph**.

## Requirements (EARS)
- WHEN the user enters bullet points (or shorthand) and invokes "Expand", the system SHALL produce a
  complete email body that says everything the bullets specify, in coherent prose.
- The system SHALL write the expansion in the user's own voice (reuse `buildWritingStylePrompt`) and,
  on a reply, match the thread's register.
- The system SHALL ground the expansion in the open thread + the contact/deal context (cited) where
  the bullets reference the prospect or deal, and SHALL NOT add facts the bullets/context don't support.
- The system SHALL preserve the user's explicit asks/CTAs from the bullets (nothing dropped) and add
  only connective/polishing language, not new commitments.
- The system SHALL return the draft into the composer, fully editable (Insert), not auto-sent.
- The system SHALL be tenant/user-scoped, rate-limited, and honour zero-retention (INBOX-P03).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN bullets "thanks; can do Tue/Wed; send deck; ask about their timeline" WHEN expanded THEN the
  email covers all four points in order, in the user's voice, with a clear CTA.
- GIVEN a bullet referencing the deal ("remind them we cut onboarding to 2 weeks") AND that fact is in
  the cited context THEN it appears with a citation; if it is NOT in context THEN it renders as a
  `[fill in]` placeholder, never invented.
- GIVEN bullets containing a concrete ask WHEN expanded THEN the ask survives verbatim in intent (the
  model doesn't soften or drop it).
- GIVEN the expansion runs on a reply THEN `To:` and subject are inferred from the thread (as in C01).
- GIVEN the user clicks Insert THEN the composer fills and is editable; nothing is sent.
- GIVEN expansion fails THEN the bullets remain in the input and a non-blocking toast shows.

## Edge cases & failure handling
- Empty/one-word bullets → ask for a little more, or expand minimally without padding.
- Contradictory bullets → keep both, surface the tension rather than silently picking one.
- Bullets in another language → expand in that language (INBOX-C08), voice preserved.
- Very long bullet list → expand faithfully but flag if the result is unusually long (offer Shorten via C04).
- Unknown counterparty → expand without CRM facts; note context unavailable.
- Zero-retention → bullets/draft not persisted beyond the request.
- Multi-tenant: voice + grounding strictly within the viewer's tenant/user scope.

## Best-in-class bar
- The expansion is **grounded + cited** against the deal graph, so referencing "what we offered" pulls
  the real, cited fact — competitors expand from the bullets alone and will happily invent.
- It is **voice-matched** from the user's real sent mail, so a 4-bullet sketch becomes an email that
  sounds like them, not a generic assistant.

## Design sketch
- **Data:** none new. Voice via `lib/writing-profile.ts`; grounding via INBOX-C01 `draft-context`.
- **API:** reuse the C01 grounded-draft route with a `mode:"expand"` + `bullets` field (or a thin
  `/api/inbox/expand`): prompt = bullets-as-spec + voice + cited context → `{ body, citations, placeholders }`.
- **UI:** a small "Bullets → email" entry in the composer (a `ListChecks` lucide icon button) opening a
  multiline input; on Expand, the result populates the composer with an Undo (reuse C04's restore).
  Surface = popover card `--color-bg-card`, `--shadow-floating`; light+dark via tokens, no emoji, no
  provider name; deal facts cited.
- **AI:** `claude-sonnet-4-6` via `tracedGenerateObject`; `_trace.agentId="expand-bullets"`; structured
  output with citations/placeholders so the no-fabrication rule is enforceable.
- **Security/perf:** rate-limited; zero-retention honoured; scope on every lookup.

## Tasks (ordered, each with verify + test)
1. Expand mode on the C01 route (bullets-as-spec + voice + cited context; preserve asks; placeholder for
   uncited facts). (verify: 200 with body covering all bullets + citations) (test: `expand.test.ts` incl.
   ask-preservation + fabrication guard).
2. Bullets input + Expand UI in `_conversation-pane.tsx` populating the composer with Undo. (verify:
   browser — bullets become a full email, editable, unsent) (test: interaction test).
3. Edge handling: contradictory/empty/over-long bullets. (verify: contradictions surfaced, no padding on
   sparse bullets) (test: edge unit).
4. Zero-retention + scope. (verify: P03 → nothing stored; cross-tenant blocked) (test: retention/scope).

## Current-state notes (VERIFY before building — code moves)
- No "bullets → email" entry exists in the composer today (`_conversation-pane.tsx`). This spec reuses
  the C01 grounded-draft generator (to build) with a bullets spec, not a new model path.
- Voice few-shot EXISTS (`lib/writing-profile.ts`); reuse. Grounding reuses INBOX-C01 `draft-context`.
- Undo/restore behaviour shared with INBOX-C04 — implement once and reuse.
