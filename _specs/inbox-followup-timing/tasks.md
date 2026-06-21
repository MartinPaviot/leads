# B7 `inbox-followup-timing` — Tasks

> Total estimate: ~4.5 dev-days (9 half-day units). 9 tasks. Branch `feat/inbox-followup-timing`.
> Per task: code -> test -> verify -> commit (one logical change each). Order respects deps.
> The pure-core tasks (B1.x) are autonomously verifiable with `pnpm test` and need no LLM key or browser.

## Estimate roll-up
| Task | Tag | Est (half-days) |
|------|-----|-----|
| B1.1 computeFollowupDue + tests | [NEW] | 1 |
| B1.2 followupLabel formatter + tests | [NEW] | 0.5 |
| B2.1 attach followup in buildConversations | [NEW] | 1 |
| B2.2 plumb followup through types + routes | [NEW] | 1 |
| B2.3 render indicator (row + pane) | [NEW] | 1 |
| B3.1 mode param in compose engine + route | [NEW] | 1 |
| B3.2 Generate-nudge affordance in pane | [NEW] | 1 |
| B4.1 followupsDueCount + sort | [NEW] | 0.5 |
| B5.1 nudge golden + gate (G-eval) | [NEW] | 1 |
| — total | — | 9 (~4.5 days) |

---

## B1.1 — Pure `computeFollowupDue` [NEW]
- Action: create `src/lib/inbox/followup-due.ts` with `computeFollowupDue(lastOutboundAt, opts)` +
  `businessDaysBetween` helper, reusing `addBusinessDays`/`rollToBusinessDay` from `src/lib/util/business-days.ts`.
- Verify: `pnpm test src/lib/inbox/__tests__/followup-due.test.ts` green; `pnpm tsc` clean.
- Test (`followup-due.test.ts`): null/NaN/future `lastOutboundAt` -> sentinel (R1.7); stage 1/2/3/4 picks
  `[3,5,8,8]` business days from a fixed Monday `now` (R1.2/R1.4); a `dueAt` landing on Sat/Sun rolls to
  Monday (R1.5); `now>=dueAt` -> overdue + correct `businessDaysOverdue` (weekend-excluding) (R1.6);
  `now<dueAt` -> `daysUntilDue` ceil (R1.6); custom `backoffBusinessDays` override (R1.8); determinism:
  same inputs -> deep-equal twice (R1.9).
- Reqs: R1.1–R1.10.

## B1.2 — `followupLabel` pure formatter [NEW]
- Action: add `followupLabel(f: FollowupDue): string | null` to `followup-due.ts`.
- Verify: covered by `followup-due.test.ts`; `pnpm tsc` clean.
- Test: null `dueAt` -> null; overdue -> "Follow up overdue · {n}d"; `daysUntilDue===0` -> "Follow up due
  today"; else "Follow up in {x}d".
- Reqs: R2.7, R2.3, R2.4.

## B2.1 — Attach `followup` in `buildConversations` [NEW]  (dep B1.1)
- Action: in `src/lib/inbox/conversations.ts`, after `awaitingTheirReply` (`:475`), derive `lastOutboundMs`
  + `priorNudgeCount` from `messages`, call `computeFollowupDue` only when `awaitingTheirReply`, attach the
  ISO-`dueAt` `followup` field to the `Conversation` (add it to the interface near `:126`, emit near `:533`).
- Verify: `pnpm test` for conversations suite green; build clean.
- Test (extend `conversations` test): awaiting-their-reply single outbound -> `followup.dueAt` set, stage 1;
  two trailing outbounds -> stage 2; awaiting-OUR-reply / done / snoozed / inbound-led -> sentinel (R2.2);
  SLA and follow-up never both populated on one conversation (R2.6).
- Reqs: R2.1, R2.2, R2.6.

## B2.2 — Plumb `followup` through types + routes [NEW]  (dep B2.1)
- Action: add `followup` to `ConversationListItem` in `src/app/(dashboard)/inbox/_types.ts` (+ the
  `ConversationDetail.conversation` intersection); project `c.followup` in the list-route row map
  (`src/app/api/inbox/conversations/route.ts:225-250`); confirm it rides the spread in
  `conversations/detail/route.ts:181-183` (type-only change there).
- Verify: `pnpm tsc` clean; `GET /api/inbox/conversations` and `/detail` responses include `followup`
  (curl the dev server on a seeded awaiting-their-reply thread, or assert in a route unit test).
- Test: a route/projection unit test asserting `followup` is present and equals the built value for an
  awaiting-their-reply fixture, and is the sentinel otherwise.
- Reqs: R2.5.

## B2.3 — Render the follow-up indicator (row + pane) [NEW]  (dep B2.2, B1.2)
- Action: in `src/app/(dashboard)/inbox/_inbox-row.tsx` render `followupLabel(c.followup)` adjacent to the
  SLA chip (`:131-140`) using `--color-warning` (overdue) / `--color-text-tertiary` (upcoming); in
  `_conversation-pane.tsx` add the same label to the header meta row (`:514-535`).
- Verify (do it yourself): seed an overdue + an upcoming awaiting-their-reply thread, screenshot the list +
  pane showing "Follow up overdue · Nd" and "Follow up in Xd"; confirm no chip on awaiting-our-reply.
- Test (`inbox-row.test.tsx`, extend): renders overdue label for overdue `followup`; renders upcoming label;
  renders nothing when `followup.dueAt===null`; never renders both SLA and follow-up chips.
- Reqs: R2.3, R2.4, R2.6; G-design (F1 §8) acceptance: tokens only, no bespoke styling.

## B3.1 — `mode` param in compose engine + route [NEW]  (dep none; parallel to B2)
- Action: add `mode?: "reply" | "nudge"` to `ComposeReplyOpts`/`buildReplyPrompt` in
  `src/lib/inbox/compose-reply.ts` (swap only the task sentence for nudge; keep grounding/no-fabrication
  lines); read `mode` from the body in `src/app/api/inbox/compose/reply/route.ts` and pass it through.
- Verify: `pnpm tsc` clean; POST `{ key, mode: "nudge" }` on a seeded thread returns a non-empty, gentle
  follow-up that invents no facts; AI-off profile returns `{subject:"",text:""}` (R4.1).
- Test (`compose-reply` unit, injected generator): `buildReplyPrompt(_, { mode:"nudge" })` contains the
  gentle-follow-up task + the no-new-facts/never-pushy constraints and NOT the "answer their question"
  reply task; default mode unchanged (regression).
- Reqs: R3.2, R3.3, R3.4, R4.1.

## B3.2 — Generate-nudge affordance in the pane [NEW]  (dep B3.1, B2.2)
- Action: in `_conversation-pane.tsx` add `generateNudge` (clone of `generateDraft` `:339-371`, posts
  `{ key, mode:"nudge" }`) + a "Generate nudge" button in the header action row (`:567-588`), shown only
  when `conversation.awaitingTheirReply && conversation.followup.dueAt`; lands in the composer, fail-closed.
- Verify (do it yourself): on an overdue thread click Generate nudge -> editable composer with a gentle
  follow-up, NOT auto-sent; on an awaiting-our-reply thread the button is absent; with AI off, the button is
  inert/empty. Screenshot before+after.
- Test (`inbox-actions.test.tsx`, extend): button present iff awaiting-their-reply + due; click calls
  `/api/inbox/compose/reply` with `mode:"nudge"`; empty response leaves composer state per fail-closed.
- Reqs: R3.1, R3.5, R3.6, R3.7, R4.2, R4.3.

## B4.1 — `followupsDueCount` + overdue-first sort [NEW]  (dep B2.1)
- Action: in `conversations/route.ts` compute `followupsDueCount` over `visible` (R5.1) and add it to the
  response; in `sortConversations` (`conversations.ts:551`) break attention-lane ties so overdue follow-ups
  lead (R5.2). No new lane/split/route (R5.3).
- Verify: response carries `followupsDueCount` equal to the count of visible due follow-ups; the follow_ups
  split still lists ALL awaiting-their-reply threads, overdue first.
- Test (`splitCounts`/sort unit): `followupsDueCount` matches a hand-built fixture; overdue sorts before
  non-overdue within equal importance; non-follow-up ordering unchanged.
- Reqs: R5.1, R5.2, R5.3.

## B5.1 — Nudge golden + gate (G-eval / C1) [NEW]  (dep B3.1)
- Action: create `src/lib/evals/fixtures/inbox/inbox-nudge.golden.jsonl` (>=15 cases, mirroring
  `inbox-draft.golden.jsonl`: thread messages where the LAST is OUR unanswered outbound, `trapFacts`,
  `idealDraft` = a gentle no-fabrication nudge); create `src/__tests__/inbox-nudge-gate.test.ts` cloned from
  `inbox-draft-gate.test.ts` (deterministic floor: ideal nudges leak 0 trap facts + non-empty; LLM tier
  skipIf-`ANTHROPIC_API_KEY`: run `composeReply(_, {mode:"nudge"})`, assert leaks<=1, empty==0). Add the
  test path to the `eval:run` script in `package.json`.
- Verify: `pnpm test src/__tests__/inbox-nudge-gate.test.ts` green with NO key (floor only); `pnpm eval:run`
  includes the new gate.
- Test: the gate IS the test (fixture-integrity + deterministic floor + LLM tier), reusing `trapFactHits`
  from `src/lib/evals/inbox-metrics.ts`.
- Reqs: G-eval (C1), R3.3, R6.5.

## Definition of done (software, separate from the OKR)
- `computeFollowupDue` + `followupLabel` unit tests green with no LLM key; `pnpm tsc`/`pnpm lint` clean.
- `followup` present on list + detail responses; indicator renders (overdue/upcoming) and is SLA-exclusive.
- Generate-nudge produces an editable, grounded, never-auto-sent draft; absent off-state + wrong-direction.
- `inbox-nudge-gate` wired into `pnpm eval:run`, deterministic floor green.
- No migration, no new Inngest fn, no new provider added.
