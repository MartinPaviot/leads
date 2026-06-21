# B7 `inbox-followup-timing` — Requirements (EARS)

> Track B / Upstream-parity. ROADMAP row B7 (`_specs/inbox-overhaul/ROADMAP.md:34`):
> "Awaiting-reply detection + computed follow-up time + pre-drafted nudge." P2, deps C1, B1.
>
> Verified against live code 2026-06-20 (worktree `app/apps/web`):
> conversations.ts, sla.ts, compose-reply.ts, compose/reply/route.ts, reply-worthy.ts,
> splits.ts, business-days.ts, _conversation-pane.tsx, _types.ts, conversations/route.ts,
> conversations/detail/route.ts, inbox-draft-gate.test.ts, inbox-draft.golden.jsonl.

## Tag legend
[DONE] shipped, do not re-spec / [CFG] tenant config / [NEW] real gap / [LOCKED] stack decision / [HORS SCOPE] tracked elsewhere.

## Ground-truth inventory (what already exists — DO NOT rebuild)

- [DONE] Awaiting-their-reply detection. `awaitingTheirReply` (we sent, they owe a reply) is already
  computed per-conversation: `conversations.ts:475` (`lane === "attention" && lastMessage.direction === "outbound"`),
  field declared `conversations.ts:126`, emitted `conversations.ts:533`. Its mirror `awaitingOurReply`
  (`:432`) and the response-SLA breach (`checkSla` in `sla.ts`, surfaced as `slaHoursOverdue`
  `conversations.ts:439`) are also done. B7 builds ON these — it adds NO new detection.
- [DONE] Follow-ups split. `resolveSplit` already buckets every `awaitingTheirReply` attention thread into
  the `follow_ups` built-in split (`splits.ts:52`), counted + filterable in the list route
  (`conversations/route.ts:166-170`). The optional due-follow-ups count/filter REUSES this — no new lane.
- [DONE] B1 voice-matched draft engine. `composeReply` (`compose-reply.ts:71`) + `buildReplyPrompt`
  (`:31`) + `POST /api/inbox/compose/reply` (`compose/reply/route.ts:58`), gated on `aiEnabled`
  (`route.ts:70`), fail-closed empty, never sent (the draft lands in the approval-gated composer).
  The nudge REUSES this generator + route.
- [DONE] Business-day arithmetic. `addBusinessDays` / `rollToBusinessDay` (`business-days.ts:7,21`),
  weekend-skipping, UTC, time-of-day preserving. `computeFollowupDue` REUSES these — no new date math.
- [DONE] Snooze / triage plumbing. Natural-language + preset snooze in the pane
  (`_conversation-pane.tsx:60-88, 628-692`) writes `triage.snoozedUntil`. Any snooze-until-followup
  reuses this store; B7 adds no migration.
- [DONE — distinct] Adjacent timers, intentionally NOT reused for the core. `follow-up-step.ts`
  (`nextFollowUp`) is sequence-cadence/enrollment-bound; `no-reply-nudge.ts` (`shouldResurface`) is the
  conditional snooze-if-no-reply resurfacer. Neither computes a deterministic business-day backoff for an
  ad-hoc, non-sequence awaiting-their-reply thread — the B7 gap. R6.2/R6.3 record why they are not extended.
- [DONE] Inbox-draft eval gate. `inbox-draft-gate.test.ts` + `inbox-draft.golden.jsonl` (15 cases,
  trap-fact leakage + non-empty), wired into `pnpm eval:run`. The nudge golden MIRRORS this shape.
- [LOCKED] Stack. AI SDK v6 + `@anthropic-ai/sdk` via `composeReply` `defaultGenerate`
  (`claude-haiku-4-5`), Drizzle/Postgres, no new provider, no new table.

---

## R1 — `computeFollowupDue` (pure, deterministic, injectable clock) — [NEW]

> The autonomously-verifiable CORE. New file `src/lib/inbox/followup-due.ts`. Pure: no DB, no network,
> no LLM, no ambient clock. Reuses `addBusinessDays` / `rollToBusinessDay` from `business-days.ts`.

- R1.1 THE SYSTEM SHALL expose a pure function `computeFollowupDue(lastOutboundAt, opts)` that, given the
  epoch-ms instant of our last outbound on a thread with no inbound since, returns a deterministic result
  `{ dueAt: number | null; stage: number; overdue: boolean; daysUntilDue: number; businessDaysOverdue: number }`.
- R1.2 THE SYSTEM SHALL compute `dueAt` as a business-day backoff over `lastOutboundAt`: the Nth pending
  nudge is due `BACKOFF_BUSINESS_DAYS[N-1]` business days after the last outbound, default ladder
  `[3, 5, 8]` (1st nudge +3, 2nd +5, 3rd +8 business days), the final entry repeating for further stages —
  escalating, never shrinking.
- R1.3 THE SYSTEM SHALL accept an injected clock via `opts.now` (epoch ms); WHERE `opts.now` is omitted,
  THE SYSTEM SHALL read `Date.now()` exactly once at entry, so every path that supplies `now` is fully
  deterministic and unit-testable.
- R1.4 THE SYSTEM SHALL accept `opts.priorNudgeCount` (count of follow-up nudges WE already sent since
  `lastOutboundAt`, default 0) and use it to select the backoff stage, so a twice-nudged thread computes
  the 3rd interval, not the 1st.
- R1.5 WHERE the computed `dueAt` lands on a Saturday or Sunday, THE SYSTEM SHALL roll it forward to the
  next business day (`rollToBusinessDay`), so a follow-up is never surfaced as due on a weekend.
- R1.6 WHEN `opts.now >= dueAt`, THE SYSTEM SHALL return `overdue: true` and `businessDaysOverdue` = whole
  business days between `dueAt` and `now` (>= 0); otherwise `overdue: false` and `daysUntilDue` = whole
  calendar days from `now` to `dueAt` (ceil, >= 0).
- R1.7 IF `lastOutboundAt` is null, NaN, or in the future relative to `now`, THEN THE SYSTEM SHALL return
  the non-due sentinel (`dueAt: null`, `overdue: false`, `stage: 0`) — never throw, never surface a follow-up.
- R1.8 THE SYSTEM SHALL accept an optional `opts.backoffBusinessDays: number[]` override (tenant tuning
  later) and fall back to the default ladder when absent or empty. [CFG-ready]
- R1.9 THE SYSTEM SHALL be pure: identical inputs (including `opts.now`) always yield an identical result,
  with no side effects, matching the purity contract of `sla.ts` / `reply-worthy.ts`.
- R1.10 THE SYSTEM SHALL NOT classify, send, schedule, or persist anything — it returns a value only.

## R2 — Surfacing the follow-up indicator on awaiting-their-reply threads — [NEW wiring over DONE detection]

- R2.1 WHILE a conversation has `awaitingTheirReply === true`, THE SYSTEM SHALL compute its follow-up
  timing inside `buildConversations` from the thread last outbound `at` and the count of our follow-up
  touches since the last inbound, and attach a `followup` field
  (`{ dueAt: string | null; overdue: boolean; daysUntilDue: number; businessDaysOverdue: number; stage: number }`).
- R2.2 WHERE `awaitingTheirReply` is false (we owe the reply, or it is done/snoozed/handled, or
  inbound-led), THE SYSTEM SHALL set `followup` to the non-due sentinel — the indicator shows ONLY on
  follow-up-eligible threads.
- R2.3 WHEN `followup.overdue` is true, THE SYSTEM SHALL render an overdue follow-up indicator on the
  list row AND the reading-pane header reading "Follow up overdue · Nd" (business days overdue).
- R2.4 WHEN `followup.overdue` is false AND a `dueAt` exists, THE SYSTEM SHALL render a muted
  "Follow up in Xd" indicator (X = `daysUntilDue`); WHERE `daysUntilDue === 0` it SHALL read "Follow up due today".
- R2.5 THE SYSTEM SHALL plumb `followup` through `ConversationListItem` (`_types.ts`), the list-route row
  projection (`conversations/route.ts`), and the detail route (`conversations/detail/route.ts`, which
  already spreads the whole conversation) with NO new query and NO migration — derived from loaded timestamps.
- R2.6 THE SYSTEM SHALL keep the `slaHoursOverdue` (awaiting-OUR-reply) indicator and the new follow-up
  (awaiting-THEIR-reply) indicator mutually exclusive — a thread is in exactly one state
  (`conversations.ts:432` vs `:475`, mutually exclusive by `lastMessage.direction`).
- R2.7 THE SYSTEM SHALL derive the indicator copy via a pure formatter `followupLabel(followup)` so it is
  unit-testable without rendering.

## R3 — Pre-drafted nudge (reuses the B1 compose engine) — [NEW]

- R3.1 WHEN the user requests a nudge on an awaiting-their-reply thread whose follow-up is due (overdue or
  due today), THE SYSTEM SHALL generate a draft via the B1 engine (`composeReply`) with a NUDGE instruction
  and land it in the existing editable composer (`_conversation-pane.tsx` composer state) — exactly as
  `generateDraft` does for a reply.
- R3.2 THE SYSTEM SHALL build the nudge instruction so the model writes a gentle, brief follow-up that
  references the prior unanswered message, restates one clear next step, invents no new facts or
  commitments, and is never pushy or guilt-tripping (a `buildNudgePrompt` task variant in the same generator).
- R3.3 THE SYSTEM SHALL ground the nudge only in the thread existing messages plus the user
  voice/standing-instructions/tone preamble already assembled at `compose/reply/route.ts:90-102` — it SHALL
  NOT fabricate a price, date, name, or commitment absent from the thread (the cardinal draft sin).
- R3.4 THE SYSTEM SHALL expose the nudge via the existing `POST /api/inbox/compose/reply` route extended
  with an optional `mode: "nudge"` body field (default "reply"), reusing the same scoping, voice assembly,
  and fail-closed contract — no new route file.
- R3.5 WHEN the compose result is empty or errors, THE SYSTEM SHALL fail closed: leave an open composer
  untouched, or open a blank one, and toast a non-blocking warning (mirroring `_conversation-pane.tsx:359-367`)
  — it SHALL NOT fabricate a nudge.
- R3.6 THE SYSTEM SHALL render a Generate-nudge affordance in the pane header ONLY where
  `awaitingTheirReply` is true AND `followup.dueAt` is non-null (due or overdue), so the nudge is never
  offered on a thread we owe a reply on or whose follow-up is not yet due.
- R3.7 THE SYSTEM SHALL place the nudge draft in the composer editable and SHALL NOT auto-send it —
  sending always goes through the approval-gated `EmailComposerPanel`.

## R4 — AI gating + never-auto-send contract — [NEW guard, reuses DONE gates]

- R4.1 WHERE the user AI profile resolves to `off` (`aiEnabled(getAiProfile(userId)) === false`,
  `ai-profile.ts:39`), THE SYSTEM SHALL return an empty nudge draft (`{ subject: "", text: "" }`) and the
  pane SHALL leave the composer as-is — identical to the reply path (`compose/reply/route.ts:70`).
- R4.2 THE SYSTEM SHALL gate the Generate-nudge affordance behind the same client guards as the reply
  affordance (a conversation is loaded; awaiting-their-reply; due) — no new permission surface.
- R4.3 THE SYSTEM SHALL NOT introduce any autonomous/background send of a nudge — B7 ships the manual,
  human-in-the-loop nudge only; autonomous follow-up is [HORS SCOPE] (R6.3).

## R5 — Optional: due-follow-ups count + filter — [NEW, thin, reuses DONE split]

- R5.1 THE SYSTEM SHALL expose in the list-route response a `followupsDueCount` = number of visible
  attention conversations whose `followup.dueAt` is non-null AND (overdue or due today), computed over the
  already-built `visible` set (`conversations/route.ts`) — no extra query.
- R5.2 WHERE the user selects the existing `follow_ups` split, THE SYSTEM SHALL keep showing ALL
  awaiting-their-reply threads (unchanged, `splits.ts:52`), with due ones marked by the R2 indicator and
  sorted so overdue follow-ups surface first.
- R5.3 THE SYSTEM SHALL NOT create a new lane, split, route, or table for this count — it is a derived
  number plus a sort tweak. [Anti-over-scope guard.]

## R6 — Non-goals / boundaries

- R6.1 THE SYSTEM SHALL NOT re-implement awaiting-reply detection, SLA breach, splits, business-day math,
  or the compose engine — all [DONE] (see inventory).
- R6.2 THE SYSTEM SHALL NOT extend the sequence-cadence follow-up (`follow-up-step.ts`) — B7 targets
  ad-hoc, non-enrollment threads; an enrolled thread cadence stays the sequence job (the nudge affordance
  MAY defer when an active enrollment will touch the contact next — best-effort, not required).
- R6.3 THE SYSTEM SHALL NOT auto-send, auto-schedule, or background-sweep nudges. [HORS SCOPE] —
  autonomous follow-up belongs to the autonomy hub (`autonomy-hub.ts:35` `nudge` rule), tracked separately.
- R6.4 THE SYSTEM SHALL NOT add a Drizzle migration, a new `user_preferences` key beyond the optional
  deferred backoff override (R1.8), or a new background Inngest function.
- R6.5 THE SYSTEM SHALL NOT block CI on an LLM key: `computeFollowupDue` unit tests and the nudge golden
  deterministic floor MUST pass with no `ANTHROPIC_API_KEY` (the LLM tier is `skipIf`-gated, mirroring
  `inbox-draft-gate.test.ts:57`).

## Gates (cross-cutting, per ROADMAP §11)

- G-eval (C1): the nudge re-runs the inbox-draft faithfulness bar on nudge fixtures
  (`inbox-nudge.golden.jsonl`): trap-fact leakage = 0 on ideal drafts (deterministic floor) and a
  send-without-edit proxy (non-empty + zero leaks) on the model output (LLM tier), wired into `pnpm eval:run`.
- G-design (F1 §8): the follow-up indicator + Generate-nudge affordance use design-system tokens
  (`--color-accent` / `--color-warning`, 11–12px type, existing pane button density) — a design-review
  acceptance criterion, no bespoke styling.

## Requirement count
27 requirements across R1–R6. [NEW]: R1.1–R1.10, R2.1–R2.7, R3.1–R3.7, R4.1–R4.3, R5.1–R5.3 (pure core + wiring).
[DONE] (inventory, not re-specced): awaiting-reply detection, SLA, splits, compose engine, business-days, snooze.
[CFG-ready]: R1.8 backoff override. [HORS SCOPE]: R6.3 autonomous send.
