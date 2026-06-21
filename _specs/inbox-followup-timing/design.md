# B7 `inbox-followup-timing` — Design

> Reuse-first, no migration. The pure `computeFollowupDue` is the load-bearing core; everything else is
> thin wiring over already-shipped detection (`awaitingTheirReply`), the B1 compose engine, and the
> follow-ups split. File:line anchors are against the worktree `app/apps/web` as of 2026-06-20.

## 1. Architecture diff vs existing

ALREADY THERE (do not touch the logic, only read from it):
- `src/lib/inbox/conversations.ts` — `buildConversations` computes `awaitingTheirReply` (`:475`),
  `awaitingOurReply` (`:432`), `slaHoursOverdue` (`:439`), per-message `at` ISO timestamps (`:415`),
  `lastMessageAt` (`:538`). The `Conversation` interface (`:94-140`) is where the new `followup` field lands.
- `src/lib/inbox/sla.ts` — `checkSla` is the purity + shape template `computeFollowupDue` mirrors.
- `src/lib/util/business-days.ts` — `addBusinessDays` (`:7`), `rollToBusinessDay` (`:21`). REUSED.
- `src/lib/inbox/compose-reply.ts` — `composeReply` (`:71`), `buildReplyPrompt` (`:31`). The nudge adds a
  task variant here, sharing `defaultGenerate` + the fail-closed wrapper.
- `src/app/api/inbox/compose/reply/route.ts` — assembles voice/style/memory/mailbox preamble (`:90-102`),
  gates on `aiEnabled` (`:70`). The nudge reuses this route via a `mode` param.
- `src/lib/inbox/splits.ts` — `resolveSplit` `follow_ups` branch (`:52`). The due-count reuses it.
- `src/app/(dashboard)/inbox/_conversation-pane.tsx` — `generateDraft` (`:339`), composer state (`:125`),
  reply-worthy affordance block (`:572-588`), Cmd/Ctrl+J handler (`:382-393`). The nudge mirrors this.
- `src/app/(dashboard)/inbox/_types.ts` — `ConversationListItem` (`:15-49`), `ConversationDetail` (`:81`).
- `src/app/api/inbox/conversations/route.ts` — row projection (`:225-250`), splits counting (`:166-180`).
- `src/app/api/inbox/conversations/detail/route.ts` — spreads the whole conversation (`:181-183`).
- `src/__tests__/inbox-draft-gate.test.ts` + `src/lib/evals/inbox-metrics.ts` (`trapFactHits`) +
  `src/lib/evals/fixtures/inbox/inbox-draft.golden.jsonl` — the eval template the nudge golden copies.

ADDED:
- `src/lib/inbox/followup-due.ts` (NEW) — `computeFollowupDue` + `followupLabel` (pure).
- `src/lib/inbox/nudge-prompt.ts` (NEW, small) — `buildNudgePrompt` (the gentle-follow-up task line),
  OR an exported `buildReplyPrompt(messages, opts, { mode })` overload in `compose-reply.ts`. Pick the
  in-file overload (Decision D2) to keep one generator + one fail-closed path.
- `src/lib/evals/fixtures/inbox/inbox-nudge.golden.jsonl` (NEW) — nudge faithfulness fixtures.
- `src/__tests__/inbox-nudge-gate.test.ts` (NEW) — wired into the `eval:run` script list.
- Unit tests: `src/lib/inbox/__tests__/followup-due.test.ts` (NEW).

CHANGED (additive, no behaviour removed):
- `conversations.ts` — compute + attach `followup` on the `Conversation` (one block near `:475-483`,
  guarded by `awaitingTheirReply`); sort tweak in `sortConversations` (`:551`) so overdue follow-ups lead
  within the attention lane after the existing importance ordering.
- `compose-reply.ts` / `compose/reply/route.ts` — `mode: "reply" | "nudge"` (default reply).
- `_types.ts` — add `followup` to `ConversationListItem`.
- `conversations/route.ts` — project `followup`; add `followupsDueCount`.
- `conversations/detail/route.ts` — `followup` rides along the spread (no change needed beyond the type).
- `_conversation-pane.tsx` — Generate-nudge button + `generateNudge` callback + the header indicator.
- list-row component (`_conversation-list*` / row renderer) — render the follow-up chip from `followup`.

(Correction: the list-row that renders `slaHoursOverdue` is `_inbox-row.tsx:131-140`; the follow-up chip
renders in the SAME row, adjacent, mutually exclusive with the SLA chip per R2.6.)

## 2. Data model diff

NONE. No Drizzle CREATE/ALTER, no new `user_preferences` key (the R1.8 backoff override is deferred and,
when built, reuses the existing JSONB `user_preferences` store like `ai-profile.ts` — out of B7 scope).
`followup` is a derived, read-time field computed from `outbound_emails.sent_at` / activity timestamps
already loaded by `loadConversationRows`. The only TypeScript type additions:

```ts
// followup-due.ts (NEW)
export interface FollowupDue {
  dueAt: number | null;          // epoch ms, rolled off weekends; null = not eligible
  stage: number;                 // 1-based pending-nudge index; 0 = not eligible
  overdue: boolean;
  daysUntilDue: number;          // calendar days now->dueAt, ceil, >=0 (0 when overdue)
  businessDaysOverdue: number;   // business days dueAt->now, >=0 (0 when not overdue)
}
export interface FollowupOpts {
  now?: number;
  priorNudgeCount?: number;
  backoffBusinessDays?: number[]; // default [3,5,8]
}
export function computeFollowupDue(lastOutboundAt: number | null, opts?: FollowupOpts): FollowupDue
export function followupLabel(f: FollowupDue): string | null  // R2.7 pure formatter

// conversations.ts Conversation + _types.ts ConversationListItem (NEW field, ISO-string dueAt for the wire)
followup: { dueAt: string | null; stage: number; overdue: boolean; daysUntilDue: number; businessDaysOverdue: number };
```

## 3. The pure core — `computeFollowupDue` (followup-due.ts)

Algorithm (mirrors `sla.ts` shape + reuses `business-days.ts`):
1. Resolve `now = opts.now ?? Date.now()` (R1.3).
2. Guard (R1.7): `lastOutboundAt` null/NaN/`> now` -> return sentinel `{dueAt:null, stage:0, overdue:false,
   daysUntilDue:0, businessDaysOverdue:0}`.
3. `ladder = (opts.backoffBusinessDays?.length ? opts.backoffBusinessDays : [3,5,8])` (R1.8).
4. `stage = (opts.priorNudgeCount ?? 0) + 1` (R1.4); `interval = ladder[min(stage-1, ladder.length-1)]` (R1.2).
5. `dueAt = rollToBusinessDay(addBusinessDays(new Date(lastOutboundAt), interval)).getTime()` (R1.2/R1.5).
6. If `now >= dueAt` -> `overdue:true`, `businessDaysOverdue = businessDaysBetween(dueAt, now)` (R1.6).
   Else `daysUntilDue = ceil((dueAt-now)/86_400_000)` (R1.6).
   `businessDaysBetween` is a small local helper (count weekday boundaries), unit-tested alongside.
7. Return the populated `FollowupDue`. No side effects (R1.9/R1.10).

`followupLabel(f)` (R2.7): `null` when `dueAt===null`; `Follow up overdue · {businessDaysOverdue}d` when
overdue; `Follow up due today` when `daysUntilDue===0`; else `Follow up in {daysUntilDue}d`.

## 4. Wiring `followup` into the conversation (conversations.ts)

In `buildConversations`, immediately after `awaitingTheirReply` is computed (`:475`):
- `lastOutboundMs` = ms of the last OUTBOUND message in `messages` (already sorted; the thread last
  outbound is `messages` filtered to `direction === "outbound"` last `at`). When `awaitingTheirReply`,
  `lastMessage` is itself outbound, so `lastOutboundMs = toMs(lastMessage.at)`.
- `priorNudgeCount` = number of OUR outbound messages sent after the most recent INBOUND (i.e. consecutive
  trailing outbounds minus the first) — derived from `messages`, no query. A single outbound -> 0.
- `const fu = awaitingTheirReply ? computeFollowupDue(lastOutboundMs, { now: nowMs, priorNudgeCount }) : NON_DUE;`
- Attach `followup: { ...fu, dueAt: fu.dueAt == null ? null : new Date(fu.dueAt).toISOString() }` (R2.1/R2.2).

`sortConversations` (`:551`): within the attention lane, after the importance tier/score comparison, break
ties so `followup.overdue` true sorts before false (R5.2) — additive, never reorders non-follow-up threads
relative to the existing importance order.

## 5. The nudge (compose-reply.ts + compose/reply/route.ts + pane)

- `buildReplyPrompt(messages, opts)` gains a `mode` in `opts` (`"reply" | "nudge"`, default reply). For
  `nudge` it swaps the task sentence to: "Write a SHORT, friendly follow-up to your OWN last message in
  this thread, which has gone unanswered. Reference what you previously asked, restate ONE clear next step,
  add no new facts/prices/dates/commitments, and never sound pushy, impatient, or guilt-tripping." The
  grounding/no-fabrication/never-already-sent constraints stay verbatim (`compose-reply.ts:43-44`).
- `composeReply(messages, opts, generate)` passes `opts` through unchanged; `defaultGenerate` + the
  try/catch fail-closed wrapper (`:76-84`) are shared — one generator, one empty-on-error contract (R3.5).
- `POST /api/inbox/compose/reply` reads `mode` from the body (default reply), threads it into
  `composeReply(messages, { instructions, mode })`. Scoping (`getInboxScope`), the `aiEnabled` gate
  (`route.ts:70`, R4.1) and voice assembly (`:90-102`, R3.3) are unchanged.
- `_conversation-pane.tsx`: a `generateNudge` callback cloned from `generateDraft` (`:339-371`) posting
  `{ key, mode: "nudge" }`; a "Generate nudge" button rendered in the header action row next to
  Generate-draft, shown only when `detail.conversation.awaitingTheirReply && detail.conversation.followup.dueAt`
  (R3.6). Result lands in the same composer state (R3.1/R3.7); empty -> fail-closed toast (R3.5).

## 6. Indicator surfaces
- List row `_inbox-row.tsx`: next to the SLA chip (`:131-140`), render `followupLabel(c.followup)` when
  non-null, in `--color-warning` (overdue) or `--color-text-tertiary` (upcoming). Mutually exclusive with
  the SLA chip by construction (R2.6).
- Pane header `_conversation-pane.tsx` (`:514-535` meta row): same label, accent/warning per overdue.

## 7. Orchestration (Inngest)
NONE added. B7 is read-time + manual. The autonomy-hub `nudge` rule (`autonomy-hub.ts:35`) is the future
autonomous sweep and is explicitly [HORS SCOPE] (R6.3). No new background function, no schedule.

## 8. Integrations (vs the LOCKED stack)
- AI: reuses `composeReply` -> `defaultGenerate` (`@anthropic-ai/sdk` `claude-haiku-4-5`, AI SDK v6).
  No new model, provider, or key. Gated by `aiEnabled` exactly as the reply path.
- DB: Drizzle/Postgres, READ-ONLY over rows already loaded. No migration (confirmed: journal frozen at
  idx 12 per CLAUDE.md; B7 needs none).
- No Twilio/Resend/Stripe/Google surface touched.

## 9. Decisions
- D1 (backoff ladder): business-days `[3,5,8]` escalating. Rationale: matches founder-led-sales cadence
  (a first nudge ~3 business days after silence, widening). Configurable later (R1.8) but shipped as a
  constant — no premature CFG surface. Alternative (fixed 3-day flat) rejected: does not de-escalate nagging.
- D2 (one generator vs new file): extend `buildReplyPrompt` with a `mode` rather than a parallel
  `nudge-prompt.ts` + parallel route. Rationale: a single fail-closed path + one place the C1 faithfulness
  bar applies; the nudge IS a compose with a different task line. Lower surface, no duplicated voice assembly.
- D3 (no new table/lane): follow-up timing is a pure function of timestamps already loaded; the follow-ups
  bucket already exists (`splits.ts:52`). Adding a lane/table would re-spec DONE work (anti-pattern). The
  due-count is a derived number (R5.1).
- D4 (priorNudgeCount from messages, not a counter column): derived from trailing consecutive outbounds in
  the assembled thread — no write, no migration, recomputed each load. Good enough; a persisted counter is
  only needed if we later distinguish "auto nudge" sends, which is [HORS SCOPE].

## 10. Guardrails (one line each)
- Pure core: no DB/network/LLM/ambient-clock in `computeFollowupDue`; injectable `now` (R1.3/R1.9).
- Fail-closed nudge: empty/error -> no fabricated draft, composer untouched (R3.5).
- No-fabrication: nudge grounded in thread; trap-fact leakage = 0 is the C1 bar (R3.3 / G-eval).
- Never auto-send: nudge lands editable, sent only via approval-gated composer (R3.7/R4.3).
- AI-off honored: off profile -> empty nudge, affordance inert (R4.1).
- Mutually-exclusive indicators: SLA (ours) xor follow-up (theirs) (R2.6).
- No migration, no new Inngest fn, no new provider (R6.4 / §2 / §7 / §8).
- CI runs without an LLM key: deterministic floors gate; LLM tier skipIf (R6.5).
