# B2 — inbox-writing-style — Requirements

The "sounds like you" engine. A Writing Style & Tone settings surface (About-me +
role, sign-off, scheduling link, an EDITABLE writing-style prompt, a "Fill it up
for me!" auto-derive from sent mail, and PER-AUDIENCE style variants), stored as
the system prompt the B1 draft/refine engine prepends. Upstream-parity per
`_research/upstream/teardown/09-settings-writing-style-and-tone.md`.

## Ground truth (verified against live code 2026-06-19)

| Area | State | Evidence |
|---|---|---|
| Per-user tone preset + 300-char free guidance | `[DONE]` | `lib/inbox/voice-prefs.ts` (`getVoicePrefs`/`buildVoicePrompt`/`saveVoicePrefs`, resource="inbox" key="voice") |
| GET/PUT voice API | `[DONE]` | `app/api/inbox/voice/route.ts` |
| Voice settings page (tone radios + guidance) | `[DONE]` | `app/(dashboard)/settings/inbox-voice/page.tsx` (NOT in `settings-sidebar.tsx` nav; direct-URL only) |
| About-me facts: signOffName, companyLine, colleagues | `[DONE]` (memory) | `lib/inbox/ai-memory.ts` `AboutMe` + `buildMemoryPrompt`; `app/api/inbox/memory/route.ts`; `settings/inbox-memory/page.tsx` |
| Voice + memory joined into draft instructions | `[DONE]` | `app/api/inbox/compose/reply/route.ts:49-51`; consumed by `compose-reply.ts:31` `buildReplyPrompt` |
| `user_preferences` JSONB store (no migration) | `[DONE]` | `db/schema/auth.ts:141-164` (`userId`+`resource`+`key` unique) |
| Sent-mail corpus for auto-derive | `[DONE]` (read source) | `outboundEmails` `bodyText`/`subject`/`mailboxId`/`contactId`/`sentAt` (`db/schema/outbound.ts:286-332`) |
| Inngest registry | `[DONE]` | `app/api/inngest/route.ts:94-285` (serve list) |
| Per-mailbox signature / display-name / from | `[HORS SCOPE]` -> A3 | `inbox-mailbox-rail-identity`; writing-style is per-USER, signature/from is per-MAILBOX |
| Editable writing-style PROMPT (literal textarea) | `[NEW]` | no `writing_style` key exists (grep clean) |
| Scheduling link field + draft injection | `[NEW]` | no `schedulingLink` anywhere (grep clean) |
| "Fill it up for me!" derive-from-sent | `[NEW]` | no derive job exists |
| PER-AUDIENCE style variants | `[NEW]` | no audience model exists |
| Voice judge bar >=0.75 on `inbox-draft` | `[NEW]` (re-run gate) | C1 `_specs/inbox-quality-evals/design.md:62,114` |
| Stack: Drizzle/Postgres/Inngest/AI-SDK+Anthropic | `[LOCKED]` | CLAUDE.md |

Net: tone + about-me + the join point already ship. B2 = the editable prompt,
scheduling link, the derive job, per-audience variants, the transparency surface,
and the two gates. We REUSE `user_preferences` (resource="inbox", a NEW key
`writing_style`), EXTEND the `buildVoicePrompt` caller, and do NOT touch the
per-mailbox identity (A3).

## R1 — Storage & data model

- **R1.1** `[NEW]` THE SYSTEM SHALL persist a per-user Writing Style record in
  `user_preferences` with resource="inbox", key="writing_style", value a JSONB
  `WritingStyle` `{ aboutMe, role, schedulingLink, signOff, prompt, audiences[],
  derivedAt? }` — owner-scoped, no migration (reuses `db/schema/auth.ts:141`).
- **R1.2** `[NEW]` THE SYSTEM SHALL seed `prompt` with the verbatim Upstream
  default (5 bullets: clear/direct/friendly low-ego no-hype - 3-6 short lines -
  simple wording avoid buzzwords - one sentence if possible - avoid salesy/
  template-y) when the record is absent, so no user faces a blank textarea.
- **R1.3** `[NEW]` THE SYSTEM SHALL clamp on save: `prompt` <= 2000 chars, `aboutMe`
  <= 600, `role`/`signOff`/`schedulingLink` <= 120, <= 8 `audiences`, each audience
  `label` <= 60 and `prompt` <= 2000; blanks dropped, excess truncated (mirrors
  `voice-prefs.ts:52` `clampVoice` / `ai-memory.ts:54` `clampMemory`).
- **R1.4** `[NEW]` WHERE a `schedulingLink` is set, THE SYSTEM SHALL validate it is
  an http(s) URL or bare domain and store it normalized; IF it is neither, THEN
  THE SYSTEM SHALL drop it on save (never persist a malformed link).
- **R1.5** `[NEW]` THE SYSTEM SHALL keep `key="voice"` (tone preset) intact and
  read it alongside `writing_style`; the new record SHALL NOT delete or rewrite
  the existing voice/memory records (additive, no destructive migration).

## R2 — The editable writing-style prompt (transparency)

- **R2.1** `[NEW]` GIVEN the settings surface, WHEN the user opens Writing Style &
  Tone, THE SYSTEM SHALL render the literal `prompt` text in an editable textarea
  (the exact string the drafter uses) — transparency, not a black box.
- **R2.2** `[NEW]` WHEN the user edits the prompt and saves, THE SYSTEM SHALL
  persist the edited text verbatim (after R1.3 clamp) and use it on the next draft
  with no redeploy.
- **R2.3** `[NEW]` THE SYSTEM SHALL expose a "Reset to default" affordance that
  restores the R1.2 verbatim default prompt without clearing About-me/sign-off/
  scheduling-link/audiences.
- **R2.4** `[NEW]` THE SYSTEM SHALL NOT apply any auto-send / skip-approval text
  found in the prompt or About-me — such phrases are stripped from the injected
  instruction and surfaced as ignored (reuse `ai-memory.ts:46` `AUTO_SEND_RE` /
  `isAutoSendInstruction`), preserving the never-auto-send contract.

## R3 — Prompt assembly into the draft/refine engine

- **R3.1** `[NEW]` THE SYSTEM SHALL provide a pure `buildWritingStylePrompt(style,
  audienceId?)` returning the instruction preamble (style prompt + About-me + role
  + sign-off + scheduling-link guidance), unit-testable with no DB.
- **R3.2** `[NEW]` WHEN `POST /api/inbox/compose/reply` runs, THE SYSTEM SHALL
  prepend `buildWritingStylePrompt(...)` to the draft instructions, composed with
  tone (`buildVoicePrompt`) + memory (`buildMemoryPrompt`) at
  `compose/reply/route.ts:49-51` — writing-style is the lead voice block, tone +
  memory layer on top, joined by blank lines.
- **R3.3** `[NEW]` WHERE a `schedulingLink` is set, THE SYSTEM SHALL instruct the
  drafter to insert that exact booking link only when the reply proposes a meeting
  or call (never gratuitously), and SHALL NOT fabricate a link when empty.
- **R3.4** `[NEW]` WHERE a `signOff` is set, THE SYSTEM SHALL instruct the drafter
  to close with that sign-off; IF both `writing_style.signOff` and memory
  `aboutMe.signOffName` are present, THEN the sign-off word (e.g. "Best") and the
  name compose without contradiction (word + name).
- **R3.5** `[NEW]` IF the writing-style record is absent or AI is off
  (`aiEnabled(getAiProfile)`=false, `ai-profile.ts:39`), THEN THE SYSTEM SHALL
  fall back to the R1.2 default prompt (when absent) or return empty (when AI off),
  fail-closed — the composer stays as-is, never a fabricated draft.

## R4 — Per-audience style variants

- **R4.1** `[NEW]` THE SYSTEM SHALL let the user add/edit/remove named audiences,
  each `{ id, label, match, prompt }` where `match` is a recipient-segment rule
  `{ kind: "domain"|"title"|"contact_tag"|"all", value? }` keyed off the
  recipient/contact the thread is with.
- **R4.2** `[NEW]` WHEN a draft is composed for a thread, THE SYSTEM SHALL resolve
  the recipient's segment (counterparty email domain + the matched `contacts` row's
  `title`/tags, `db/schema/core.ts:160`) and select the FIRST matching audience's
  prompt; IF none match, THEN THE SYSTEM SHALL use the base `prompt`.
- **R4.3** `[NEW]` WHERE an audience matches, THE SYSTEM SHALL use that audience's
  prompt IN PLACE OF the base style prompt (not appended) while still applying
  About-me / sign-off / scheduling-link, so an investor draft and a customer draft
  read differently from one base identity.
- **R4.4** `[NEW]` THE SYSTEM SHALL make audience matching deterministic and pure
  (`selectAudience(style, recipient)` unit-testable, no DB) and order-stable so the
  same recipient always resolves the same audience.
- **R4.5** `[NEW]` THE SYSTEM SHALL surface, in the settings UI, WHICH audience a
  given test recipient would resolve to (a preview field), so the user can verify
  the routing without sending mail.

## R5 — "Fill it up for me!" (auto-derive from sent mail)

- **R5.1** `[NEW]` WHEN the user clicks "Fill it up for me!", THE SYSTEM SHALL
  enqueue an Inngest job `inbox/writing-style.derive` (event-triggered, per
  user+tenant) that reads the user's recent SENT mail and proposes a writing-style
  prompt + About-me + sign-off; it SHALL run in the background (non-blocking UI).
- **R5.2** `[NEW]` THE SYSTEM SHALL derive from the most recent <= 50 human-authored
  sent messages — `outboundEmails.bodyText` whose `mailboxId` belongs to the user,
  ordered by `sentAt` desc (`db/schema/outbound.ts:286-332`) — EXCLUDING
  sequence/automated and bulk campaign mail (learn how the user writes 1:1, not
  templates).
- **R5.3** `[NEW]` IF the user has fewer than 5 eligible sent messages, THEN THE
  SYSTEM SHALL NOT overwrite the prompt and SHALL return a "not enough sent mail
  yet" status (no hallucinated voice from an empty corpus).
- **R5.4** `[NEW]` THE SYSTEM SHALL store the derived prompt as a PROPOSAL the user
  reviews and accepts (never silently replacing the live prompt), recording
  `derivedAt`; on accept it becomes the active `prompt`, on dismiss nothing changes
  — Upstream "Fill it up" is one-click, but Elevay keeps the human accept to honor
  the editable-prompt trust contract.
- **R5.5** `[NEW]` THE SYSTEM SHALL run a no-PII / no-hallucination check on the
  derived prompt before surfacing it: the proposal SHALL contain only STYLE
  directives (tone, length, phrasing), SHALL NOT echo a recipient name, email,
  company, dollar amount, or any quoted content from the source mail, and SHALL be
  rejected (status "rejected", live prompt unchanged) if it does (C1 gate, R7.2).
- **R5.6** `[NEW]` WHILE a derive job is running, THE SYSTEM SHALL show a pending
  state and SHALL be idempotent — a second click while pending SHALL NOT enqueue a
  duplicate job.

## R6 — Settings surface (UX)

- **R6.1** `[NEW]` THE SYSTEM SHALL present a single "Writing Style & Tone" page
  with: About-me (textarea) + role (input, placeholder "Founder at Acme"),
  Scheduling link (input, placeholder "www.calendly.com/meeting"), Sign off (input,
  placeholder "Best/Thanks"), the editable Writing Style Prompt (textarea),
  "Fill it up for me!" button, and an Audiences list with "Add audience".
- **R6.2** `[NEW]` THE SYSTEM SHALL add this page to `settings-sidebar.tsx` under
  Workspace ("Writing Style", lucide icon, no emoji) and SHALL fold the existing
  inbox-voice tone preset into the same page (one voice surface, not three), while
  leaving `inbox-voice`/`inbox-memory` reachable by direct URL during transition.
- **R6.3** `[NEW]` THE SYSTEM SHALL show the copy line "These settings define the
  personalized prompt that makes the AI sound like you" and keep the prompt visible
  at all times (transparency, Upstream parity).
- **R6.4** `[NEW]` THE SYSTEM SHALL provide save / saved / saving / loading / error
  states and pass the F1 G-design 12-item checklist (R7.3).

## R7 — Gates & non-goals

- **R7.1 (C1 / G-eval)** `[NEW]` THE SYSTEM SHALL keep the `inbox-draft` voice
  `dimension_judge` >= 0.75 @ k>=3 in `pnpm eval:run` after the writing-style prompt
  becomes the lead voice block (re-run; `inbox-quality-evals/design.md:62,114`).
- **R7.2 (C1 / G-eval)** `[NEW]` THE SYSTEM SHALL gate "Fill it up for me!" with a
  golden no-PII/no-hallucination check (source-mail -> expected PII-free prompt)
  that fails the suite if any derived prompt leaks PII or invents a directive the
  corpus does not support.
- **R7.3 (F1 / G-design)** `[NEW]` THE SYSTEM SHALL pass the F1 12-item G-design
  checklist (`inbox-design-system/design.md:85-101`) on the settings surface
  (tokens-only, one button system, type scale, no emoji lucide-only, focus/motion,
  empty/loading/error states), recorded one-line PASS/FAIL per item in tasks.md.
- **R7.4 (non-goal)** THE SYSTEM SHALL NOT manage per-mailbox signature, display
  name, or From identity — that is A3 (`inbox-mailbox-rail-identity`).
- **R7.5 (non-goal)** THE SYSTEM SHALL NOT auto-send or skip approval; every draft
  stays approval-gated (R2.4), the derived prompt is always a reviewable proposal
  (R5.4).
- **R7.6 (non-goal)** THE SYSTEM SHALL NOT introduce a new dependency or AI provider
  — derive runs on the existing AI-SDK + Anthropic via `tracedGenerateObject`
  (`compose-reply.ts:50-68`), Inngest, and `user_preferences` (LOCKED stack).
- **R7.7 (non-goal)** THE SYSTEM SHALL NOT build the generate-draft button, refine,
  or selectivity — those are B1 (`inbox-ai-draft`); B2 only supplies the voice the
  B1 engine consumes.
