# INBOX-O03 — Voice / tone calibration
> Theme: T12 · Autonomy rung: helper · Priority: P1
> Pillar: P3 writing

## User story
As a user, I want the inbox AI to write like me — my greeting and sign-off, my sentence length,
my level of formality — learned from my own sent mail and adjustable with a couple of dials, so
drafts and replies sound like I wrote them and I rarely have to rewrite the voice.

## Why (audit anchor)
Superhuman's **Personalization [BETA]** explicitly teaches the AI how you write across five
sections — **Greeting & Signoff · Writing (tone, length, formatting) · Scheduling · Events ·
About Me** — and the agentic reply flow "checks your writing style first" before drafting and
matches the counterparty's tone (`teardown-superhuman/ai-feature-deep-dive.md` "Personalization"
+ §"AI-assisted REPLY"; `findings.md` §I). We already learn voice implicitly: `writing-profile.ts`
fetches the user's real sent emails as few-shot style examples and tells the model to reproduce
their voice — **no classification, no manual style picker** (matches our "infer over asking"
doctrine). O03 keeps that as the spine and adds the smallest set of explicit overrides
(greeting/sign-off + a formality/length nudge) for when inference isn't enough.

## Requirements (EARS)
- The system SHALL, by default, calibrate voice from the user's **own sent mail** (few-shot
  examples) with no manual configuration required.
- WHEN drafting/replying/rewriting in the inbox, the system SHALL inject the user's writing-style
  examples (via `buildWritingStylePrompt(getWritingSamples(...))`) so output matches their voice.
- The system SHALL let the user set a small number of **explicit overrides** stored per-user
  (`user_preferences`, resource `inbox`, key `voice`): preferred greeting, preferred sign-off,
  and a coarse formality + length nudge (e.g. formality: casual|neutral|formal; length:
  shorter|match|longer). Strong defaults; all optional.
- WHEN an explicit override is set, the system SHALL apply it **over** the inferred style (e.g.
  the chosen sign-off replaces whatever the samples imply).
- The system SHALL, on reply, also account for the **counterparty's tone** from the thread (match
  founder-to-founder warmth vs. a formal procurement thread) without overriding the user's own
  voice overrides.
- The system SHALL show a small **live preview** ("Here's how a reply sounds") so the user can
  judge calibration before trusting it, regenerable on demand.
- The system SHALL fall back gracefully when there are too few sent samples (new user): use only
  the explicit overrides + a neutral baseline, and say so, never invent a fake voice.
- The system SHALL keep voice per-user (one rep's voice never colors another's drafts) and tenant-
  scoped on the sample query (`getWritingSamples(tenantId)` filtered to the user's sent mail).
- The system SHALL respect the zero-retention option (INBOX-P03): samples are sent to the model
  only for the user's own drafting actions.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a user with ≥3 substantive sent emails WHEN the AI drafts a reply THEN the draft mirrors
  their greeting/sign-off/sentence-length without any manual setup.
- GIVEN an explicit sign-off "À bientôt, Martin" WHEN the AI drafts THEN that exact sign-off is
  used, overriding the inferred one.
- GIVEN formality set to "formal" WHEN the AI drafts a reply to a casual thread THEN the draft is
  noticeably more formal than the inferred baseline, while still recognizably the user.
- GIVEN a brand-new user with no sent mail WHEN they open voice calibration THEN the preview says
  it's using a neutral baseline + their overrides, not a fabricated style.
- GIVEN a formal procurement thread WHEN the AI replies THEN it matches that register while still
  honoring the user's sign-off override.
- GIVEN user A's sent mail WHEN user B drafts THEN B's draft is not influenced by A's samples.

## Edge cases & failure handling
- Sparse/auto-reply-only sent mail → `getWritingSamples` already filters tiny bodies (<50 chars);
  if too few remain, fall back to overrides + baseline and label it.
- Non-English sent mail / mixed languages → samples carry the language; draft in the mail's
  language, overrides applied regardless of language.
- Very long sample bodies → already trimmed to ~600 chars for style (not content) in
  `getWritingSamples`; keep that bound.
- Override conflicts with thread tone (formal override on a warm thread) → user override wins for
  *voice*, counterparty match informs *register* only.
- Signature noise in samples (the user's own HTML signature) → don't treat a boilerplate signature
  as voice; prefer body text (compose with R05 quote/signature collapse where available).
- Multi-tenant/per-user: the sample query is tenant- + user-scoped; voice overrides are per-user.

## Best-in-class bar
- We learn voice from **real sent mail with zero configuration** (the "infer over asking"
  doctrine) and add only the **fewest explicit dials** — Superhuman's Personalization is a manual
  five-section form; ours is mostly automatic with optional overrides.
- A **live, regenerable preview** lets the user verify calibration before trusting it, instead of
  guessing whether the AI "got" their voice.
- Voice composes with our **GTM grounding** (O02 memory + G08 context): the draft sounds like the
  user *and* is grounded in the prospect's real deal context — Superhuman matches voice + calendar,
  we match voice + the whole GTM graph.

## Design sketch
- **Data:** spine = `lib/writing-profile.ts` (`getWritingSamples(tenantId, limit)` over
  `activities` where `activity_type='email_sent'`, `buildWritingStylePrompt`). Overrides =
  `user_preferences` (resource `inbox`, key `voice`): `{ greeting?, signOff?, formality?, length? }`.
  Counterparty tone derived from the open thread at draft time (no storage).
- **API:** reuse `GET/PUT /api/user-preferences` (resource `inbox`) for overrides — no migration.
  Extend the inbox draft/reply endpoint to call `buildWritingStylePrompt` + apply the `voice`
  overrides + a counterparty-tone hint; a small `POST /api/inbox/voice-preview` returns a sample
  reply for the settings preview (reuses the same builder, fixed demo thread).
- **UI:** a "Voice" subsection in `/settings/mail-calendar` (or `/settings/inbox`, shared with
  O02). Surface = `Card`/`CardBody`; greeting/sign-off via `LabeledField` + `Input`; formality +
  length via a small segmented control (same idiom as `DisplayPanel`'s density buttons, tokens
  `--color-bg-hover` active / `--color-border-default`); a "Preview a reply" `Button` →
  regenerable preview in a bordered block. Tokens (`--color-text-secondary`, `--color-accent`).
  lucide: `PenLine` / `Sparkles` (section), `RefreshCw` (regenerate preview). No keyboard shortcut.
  Light + dark via tokens, no emoji, no provider name; preview states its source ("from your sent
  mail" / "neutral baseline").
- **AI:** model role = drafting/rewrite; grounding = the user's own sent-mail few-shot + overrides;
  counterparty tone read from the thread. Autonomy: helper (drafts on request; staged for approval
  in C03/T11). The draft is never auto-sent.
- **Security/perf:** sample query tenant + user scoped; overrides per-user; bounded sample size;
  zero-retention respected.

## Tasks (ordered, each with a verify step + test to write)
1. Add `voice` overrides to the inbox draft path: read `user_preferences:inbox.voice`, apply over
   `buildWritingStylePrompt` output + a counterparty-tone hint. (verify: sign-off override appears
   in a draft) (test: `voice-overrides.test.ts` — override beats inferred, sparse-sample fallback)
2. `POST /api/inbox/voice-preview` returning a sample reply via the same builder. (verify: returns
   a styled sample) (test: route returns non-empty preview + source label)
3. Settings "Voice" UI: greeting/sign-off inputs + formality/length segmented controls + preview.
   (verify: change sign-off → preview reflects it) (test: render + PUT shape)
4. New-user fallback labeling (too few samples → baseline + overrides, stated). (verify: empty
   sent mail → "neutral baseline" copy) (test: fallback branch)
5. Confirm per-user/tenant scope on `getWritingSamples` + overrides. (verify: A's voice never in
   B's draft) (test: scope test)

## Current-state notes (VERIFY before building — code moves)
- `lib/writing-profile.ts` EXISTS: `getWritingSamples(tenantId, limit=5)` selects sent-mail bodies
  from `activities` (`activity_type='email_sent'`, trimmed to 600 chars, filters <50-char bodies);
  `buildWritingStylePrompt(samples)` emits the "match this style exactly" few-shot block. It is
  **already consumed** by `app/api/emails/route.ts` and the chat action tool
  (`lib/chat/tools/action.ts`) — reuse the same module for the inbox.
- `getWritingSamples` is currently keyed by `tenantId` only — for per-user voice, VERIFY the inbox
  path filters to the user's own sent mail (the inbox is personal; sent mail is per-mailbox). If
  the sent-mail query isn't already user-scoped, scope it here (do not change the tenant-wide
  email API behavior unless intended).
- Voice overrides are greenfield on `user_preferences` (resource `inbox`, key `voice`) — no
  migration. Composes with O02 memory (instructions/facts) in the same prompt.
- The agentic-reply bar (check voice first → match counterparty tone → draft grounded → Send/Insert)
  is captured in `ai-feature-deep-dive.md` §"AI-assisted REPLY" / `findings.md` §I — O03 supplies
  the *voice* half of that flow; C01/G08 supply the grounding half.
