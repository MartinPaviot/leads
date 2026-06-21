# B2 — inbox-writing-style — Tasks

Total estimate: ~6.0 dev-days (12 half-days). 12 tasks. Branch `feat/inbox-writing-style`.
No migration (reuses `user_preferences`). Each task: action -> verify -> test -> reqs.

| Phase | Tasks | Half-days |
|---|---|---|
| Core store + prompt assembly | B1-B4 | 4 |
| Per-audience | B5-B6 | 2 |
| Derive (Fill it up) | B7-B9 | 3 |
| Settings UI | B10-B11 | 2 |
| Gates (C1 + F1) | B12-B12b | 1 |

---

## B1 `[NEW]` WritingStyle model + store
Action: add `lib/inbox/writing-style.ts` — `WritingStyle`/`Audience`/`AudienceMatch`
types, `DEFAULT_PROMPT` (verbatim Upstream 5 bullets), `clampWritingStyle`,
`normalizeSchedulingLink`, `getWritingStyle`/`saveWritingStyle` (resource="inbox"
key="writing_style"), mirroring `voice-prefs.ts:72-99`.
Verify: in `db:studio`, save a record and read it back; absent record returns
`{...DEFAULT_PROMPT...}` not null.
Test: `writing-style.store.test.ts` — clamp caps (prompt 2000, aboutMe 600, <=8
audiences), bad schedulingLink dropped, default-prompt-on-absent, voice/memory
records untouched.
Reqs: R1.1, R1.2, R1.3, R1.4, R1.5.

## B2 `[NEW]` buildWritingStylePrompt (pure assembly)
Action: implement `buildWritingStylePrompt(style, audienceId?)` — base|audience
prompt + role + aboutMe + signOff + schedulingLink guidance, all scrubbed by
`isAutoSendInstruction` (`ai-memory.ts:49`); return `{ prompt, ignored }`.
Verify: with a seeded style, the returned preamble contains the prompt + sign-off;
with an auto-send phrase in aboutMe, it lands in `ignored`, not `prompt`.
Test: `build-writing-style-prompt.test.ts` — empty style -> default prompt; signOff
composes with memory signOffName (R3.4); schedulingLink line present only when set;
auto-send scrubbed; audienceId replaces base prompt (not appends).
Reqs: R3.1, R3.3, R3.4, R2.4, R4.3.

## B3 `[NEW]` GET/PUT writing-style API
Action: add `app/api/inbox/writing-style/route.ts` — GET returns `{ style }`
(default-seeded), PUT clamps + saves; auth via `getAuthContext` (mirror
`voice/route.ts`).
Verify: `curl` GET on a fresh user returns the default prompt; PUT a new prompt,
GET returns it verbatim.
Test: `writing-style.route.test.ts` — 401 unauth, default on GET, round-trip PUT,
clamp applied, malformed JSON -> 400.
Reqs: R1.1, R2.1, R2.2.

## B4 `[NEW]` Wire into compose/reply (the join point)
Action: at `compose/reply/route.ts:49-51`, resolve recipient from the conversation,
`const style = await getWritingStyle(userId)`, `audienceId = selectAudience(...)?.id`,
prepend `buildWritingStylePrompt(style, audienceId)` -> `instructions =
[stylePrompt, voice, memory].filter(Boolean).join("\n\n")`.
Verify: run a draft with a non-default prompt set; the produced draft reflects the
house style (short/direct) vs a control with the default.
Test: `compose-reply-route.writing-style.test.ts` — injected generator captures the
prompt; assert the style block is FIRST, before voice + memory; AI-off still returns
empty (R3.5).
Reqs: R3.2, R3.5.

## B5 `[NEW]` selectAudience (recipient -> variant)
Action: add `selectAudience(style, recipient)` (pure) — match by domain/title/
contact_tag/all, first-match-wins, order-stable; `recipient = { email, domain,
title?, tags? }`.
Verify: a recipient @acme.com resolves the "Investors" audience when that audience
matches domain="acme.com"; an unmatched recipient -> null (base prompt).
Test: `select-audience.test.ts` — first-match precedence, "all" catch-all last,
no-match -> null, stable across calls, case-insensitive domain.
Reqs: R4.1, R4.2, R4.4.

## B6 `[NEW]` Audience preview endpoint
Action: add `app/api/inbox/writing-style/audience-preview/route.ts` — POST a test
recipient, return the resolved audience label (or "Default").
Verify: POST `{email:"gp@sequoia.com"}` returns the matching audience label.
Test: `audience-preview.route.test.ts` — resolves to expected label, default when
none, 401 unauth.
Reqs: R4.5.

## B7 `[NEW]` Derive prompt builder + PII sanitizer (pure)
Action: add `lib/inbox/derive-style.ts` — `buildDerivePrompt(sentBodies)` (instructs
the LLM to output STYLE-ONLY rules) + `sanitizeDerivedStyle(text)` returning
`{ ok, reason? }` rejecting emails/URLs/proper-noun echoes/numbers/quoted source +
non-style directives.
Verify: feed a derived prompt containing a recipient name/email -> `ok:false`; a
clean tone-only prompt -> `ok:true`.
Test: `derive-style.test.ts` — PII variants rejected (email, domain, $amount, quoted
line, company name from corpus), clean style accepted, empty -> rejected.
Reqs: R5.5, R7.2.

## B8 `[NEW]` deriveWritingStyle Inngest fn
Action: add `inngest/inbox-style-derive.ts` — load <=50 human-authored sent
`outboundEmails.bodyText` for the user's mailboxes (exclude sequence/campaign),
`sentAt` desc; <5 -> proposal `{status:"insufficient"}`; else
`tracedGenerateObject` + `sanitizeDerivedStyle` -> proposal "ready"/"rejected";
concurrency-keyed on userId (idempotent). Register in `app/api/inngest/route.ts`.
Verify: trigger via Inngest dev for a seeded user with >5 sent; proposal record
becomes "ready" with a PII-free prompt. With 2 sent -> "insufficient".
Test: `inbox-style-derive.test.ts` — injected loader + generator: insufficient
branch, rejected-on-PII branch, ready branch writes proposal not live prompt
(R5.4), excludes sequence sends (R5.2).
Reqs: R5.1, R5.2, R5.3, R5.4, R5.6.

## B9 `[NEW]` Derive API (enqueue + poll + accept)
Action: add `app/api/inbox/writing-style/derive/route.ts` — POST enqueues (no-op
if pending), GET returns the proposal; accept handled by PUT to B3 record with
proposed fields + `derivedAt`, then clear proposal.
Verify: POST -> GET shows "pending" then "ready"; Accept copies the prompt into the
live record; second POST while pending does not double-enqueue.
Test: `derive.route.test.ts` — pending no-op idempotency, ready payload shape,
accept mutates live record + sets derivedAt, dismiss clears proposal.
Reqs: R5.1, R5.4, R5.6.

## B10 `[NEW]` Writing Style & Tone settings page
Action: add `app/(dashboard)/settings/writing-style/page.tsx` — About-me + role,
Scheduling link (placeholder www.calendly.com/meeting), Sign off (placeholder
Best/Thanks), editable Writing Style Prompt textarea (always visible), Reset to
default, "Fill it up for me!" (gradient CTA) with pending/ready/rejected/insufficient
states + Accept/Dismiss diff, the folded tone preset (read from key="voice"), copy
line. All tokens + shared Button, no emoji.
Verify: drive the live page — edit prompt, Save, reload, value persists; Reset
restores default without clearing other fields; Fill-it-up shows pending then a
proposal. End with a screenshot.
Test: `writing-style-page.test.tsx` (happy-dom) — renders default prompt, Save calls
PUT, Reset restores default, derive button disabled while pending, no emoji in DOM.
Reqs: R2.1, R2.2, R2.3, R6.1, R6.3, R6.4.

## B11 `[NEW]` Audiences UI + nav entry
Action: in the page, add the Audiences list (label + match rule + per-audience
prompt, Add audience, remove) + the audience-match preview field (R4.5); add the
"Writing Style" nav item under Workspace in `settings-sidebar.tsx` (lucide icon).
Verify: add an "Investors" audience matching domain, type a test recipient, the
preview shows "Investors"; the nav item appears and routes to the page.
Test: `writing-style-audiences.test.tsx` — add/remove audience updates PUT payload,
preview reflects selectAudience, cap of 8 enforced in UI.
Reqs: R4.1, R4.5, R6.1, R6.2.

## B12 `[C1 acceptance — G-eval]` Voice judge + derive no-PII gate green
Action: re-run `pnpm eval:run`; confirm the `inbox-draft` voice `dimension_judge`
>= 0.75 @ k>=3 after writing-style leads the prompt (R7.1); add the
`inbox-derive-style.golden.jsonl` fixtures + `sanitizeDerivedStyle` grader to the
`inbox-draft` suite so a PII-leaking derived prompt fails the suite (R7.2).
Verify: `pnpm eval:run` exits 0 with the voice bar green and the derive no-PII
fixtures passing; intentionally PII-poisoned fixture flips the suite red.
Test: `inbox-eval-gate.test.ts` extension — asserts voice judge >=0.75 and
derive-no-PII == 100% pass; report card printed.
Reqs: R7.1, R7.2.

## B12b `[F1 acceptance — G-design]` 12-item checklist PASS
Action: audit the settings surface against the F1 12-item G-design checklist
(`inbox-design-system/design.md:85-101`); fix any miss (cite the failing token).
Verify: record one-line PASS/FAIL per item (1 tokens-only ... 12 state-coverage);
all 12 PASS; run `tokens.contract.test.ts` over the new page.
Test: `writing-style.design-gate.test.ts` — no raw hex/rgb in the page, single
gradient CTA, shared Button only, zero emoji, lucide icons sized 16/13/11.
Reqs: R6.4, R7.3.

---

## Done-when (software DoD, distinct from the OKR)
- B1-B11 merged on `feat/inbox-writing-style`; every task's test green.
- The editable prompt persists + is used verbatim on the next draft (R2.1-R2.2).
- "Fill it up for me!" produces a reviewable, PII-clean proposal from real sent
  mail; <5 messages -> "insufficient", never a hallucinated voice (R5.3, R5.5).
- Per-audience routing resolves deterministically; default prompt when none (R4).
- B12 green: `pnpm eval:run` exit 0, voice judge >=0.75, derive no-PII == 100%.
- B12b: F1 G-design 12/12 PASS on the settings surface.
- A3 untouched (no per-mailbox signature/from added here).
