# B3 — inbox-splits · Requirements (EARS)

Feature id: `inbox-splits`. Roadmap row B3 (`_specs/inbox-overhaul/ROADMAP.md:30`).
Prio P1. Deps F1 (`inbox-design-system`). Source analysis: `_research/upstream/`
(Splits / Intention-folders behavior).

## Scope in one sentence

Upstream-style **Intention Splits** — segment the *attention* lane into named lanes
(Needs Reply / Follow Ups / Promotions / Social / Other) presented as routes/tabs
with live server-computed count chips, plus user-defined **custom per-sender Splits**,
all by composing signals the conversation already carries — no new LLM, no vendor list.

## Ground-truth tags

- `[DONE]` already shipped, do NOT re-spec.
- `[NEW]` real gap, needs code.
- `[CFG]` pure user config, no code.
- `[LOCKED]` stack/architecture decision, do NOT reopen.
- `[HORS SCOPE]` tracked by another B-spec.

### Already DONE (verified, do NOT re-build)

- `[DONE]` Per-conversation `replyWorthy` computed in `buildConversations`
  (`src/lib/inbox/conversations.ts:447-455`) via pure `isReplyWorthy`
  (`src/lib/inbox/reply-worthy.ts:97`). The resolver COMPOSES it, never re-derives it.
- `[DONE]` `isBulk` / `inboundIsAutomated` per conversation
  (`conversations.ts:301-302,479`).
- `[DONE]` `resolveGeneralIntent` taxonomy + resolver (`src/lib/inbox/general-intent.ts:34`);
  the resolved `generalIntent` is computed but DISCARDED at `conversations.ts:449`.
- `[DONE]` SLA / awaiting-our-reply: `checkSla` (`src/lib/inbox/sla.ts:24`), surfaced as
  `slaHoursOverdue` (`conversations.ts:415-422,475`); `awaitingOurReply` computed at
  `conversations.ts:415` but DISCARDED.
- `[DONE]` User-defined saved-query lanes (smart lanes, INBOX-T01): `lane-store.ts`,
  `lane-match.ts`, `POST/PATCH/DELETE /api/inbox/lanes` (`src/app/api/inbox/lanes/route.ts`),
  stored in `user_preferences` (`resource:"inbox", key:"lanes"`) — no migration.
  Custom Splits REUSE this exact pattern (a sibling `key:"splits"`).
- `[DONE]` Per-lane count chips in the FilterBar tabs (`page.tsx:765-811`) and counts
  served server-side (`src/app/api/inbox/conversations/route.ts:90,133-140,209`).
- `[DONE]` `LaneChip` + `CountBadge` components (F1 `_specs/inbox-design-system/design.md:79-80`).
- `[DONE]` Reply-worthy selectivity gate wired to `pnpm eval:run`
  (`src/__tests__/inbox-reply-worthy-gate.test.ts`, `package.json:12`) + pure
  `replyWorthyPR` metric (`src/lib/evals/inbox-metrics.ts:41`). B3 eval reuses both.

### LOCKED

- `[LOCKED]` Splits are a PURE deterministic resolver over existing signals. No new LLM,
  no hardcoded vendor/domain list, no new dependency.
- `[LOCKED]` Custom Splits persist in `user_preferences` JSONB (resource `"inbox"`).
  No DB migration (journal frozen at idx 12 — CLAUDE.md).
- `[LOCKED]` Splits segment the attention lane only; `InboxLane`
  ("attention"|"snoozed"|"done"|"handled") is unchanged.

### Out of scope (other specs)

- `[HORS SCOPE]` Noise AUTO-DEMOTION mutation + "not noise" feedback + Gmail-filter
  persistence → B4 (`inbox-noise-classifier`).
- `[HORS SCOPE]` Draft engine / Generate-draft → B1 (`inbox-ai-draft`).
- `[HORS SCOPE]` Writing style and tone → B2 (`inbox-writing-style`).
- `[HORS SCOPE]` Awaiting-reply timing + pre-drafted nudge → B7 (`inbox-followup-timing`);
  B3 only READS an awaiting-their-reply boolean, never computes follow-up times.

---

## R1 — The pure Split resolver `resolveSplit(conversation)`  [NEW]

- **R1.1** THE SYSTEM SHALL expose a pure function `resolveSplit(input): SplitResult` in
  `src/lib/inbox/splits.ts` mapping one conversation to exactly one built-in Split in the
  ordered set `needs_reply | follow_ups | promotions | social | other`, with no DB, network,
  LLM, or ambient clock.
- **R1.2** THE SYSTEM SHALL decide the Split by composing ONLY signals the conversation
  already carries: `replyWorthy`, `generalIntent`, `isBulk`, `awaitingOurReply`,
  `awaitingTheirReply`, `slaHoursOverdue`.
- **R1.3** WHERE the conversation `isBulk` is true OR `generalIntent` is
  `promotion_newsletter`, THE SYSTEM SHALL assign Split `promotions` (unless an earlier rule
  won — see R1.7).
- **R1.4** WHERE `generalIntent` is `social` OR `notification`, THE SYSTEM SHALL assign Split
  `social`.
- **R1.5** WHERE `replyWorthy` is true AND the conversation is awaiting OUR reply, THE SYSTEM
  SHALL assign Split `needs_reply`.
- **R1.6** WHERE we sent the last message and are awaiting THEIR reply (`awaitingTheirReply`
  true), THE SYSTEM SHALL assign Split `follow_ups`.
- **R1.7** THE SYSTEM SHALL evaluate built-in Splits first-match-wins in the order
  `needs_reply -> follow_ups -> promotions -> social -> other`, so a reply-worthy human thread
  is never buried under `promotions`/`social`.
- **R1.8** IF no built-in rule fires, THEN THE SYSTEM SHALL assign Split `other`.
- **R1.9** THE SYSTEM SHALL return, alongside the Split id, a short product-language
  `reasons[]` array (observability/audit), mirroring the `isReplyWorthy` contract
  (`reply-worthy.ts:39-43`).
- **R1.10** THE SYSTEM SHALL NOT introduce any hardcoded sender/domain/vendor list inside the
  resolver (classification is already carried by `generalIntent`/`isBulk`).

### Selectivity-parity invariants (cardinal rules)

- **R1.11** THE SYSTEM SHALL guarantee a conversation assigned `needs_reply` has
  `replyWorthy === true` (the Split never contradicts the B1 draft-offer gate).
- **R1.12** THE SYSTEM SHALL guarantee a conversation with `replyWorthy === true` awaiting our
  reply is assigned `needs_reply`, never `promotions`/`social` (recall bias).
- **R1.13** THE SYSTEM SHALL NOT assign `needs_reply` to any conversation whose lane is not
  `attention`.

### Edge cases

- **R1.14** IF `generalIntent` is null/unknown AND the conversation is reply-worthy and
  awaiting our reply, THEN THE SYSTEM SHALL assign `needs_reply` (recall bias).
- **R1.15** IF `generalIntent` is null/unknown AND not reply-worthy AND not bulk AND not
  awaiting anyone, THEN THE SYSTEM SHALL assign `other`.
- **R1.16** WHERE a bulk/marketing conversation is nonetheless `replyWorthy` (a human reply on
  a list-flagged thread, per `reply-worthy.ts:112`), THE SYSTEM SHALL assign `needs_reply`,
  not `promotions` (R1.7 ordering enforces this).

## R2 — Surfacing the resolver inputs (data plumbing)  [NEW]

- **R2.1** THE SYSTEM SHALL surface the resolved `generalIntent` on the `Conversation`
  returned by `buildConversations` (today computed at `conversations.ts:449` then discarded).
- **R2.2** THE SYSTEM SHALL surface `awaitingOurReply` (already computed at
  `conversations.ts:415`) on the `Conversation`.
- **R2.3** THE SYSTEM SHALL surface `awaitingTheirReply` (last message outbound on the
  attention lane, no inbound since) on the `Conversation`, derived from `messages[]` direction
  — no new query.
- **R2.4** THE SYSTEM SHALL surface the resolved built-in `split` id on each
  `ConversationListItem` (`src/app/(dashboard)/inbox/_types.ts:12`).

## R3 — Splits as routes/tabs with live count chips  [NEW]

- **R3.1** WHEN `/api/inbox/conversations` responds, THE SYSTEM SHALL include a `splits`
  array of `{ id, name, count }` for the five built-in Splits, counted over the SAME
  visible/scoped set the lane counts use (`route.ts:90`).
- **R3.2** WHEN `?split=<id>` is present AND names a built-in Split, THE SYSTEM SHALL return
  only `attention`-lane conversations whose `resolveSplit` equals that id.
- **R3.3** THE SYSTEM SHALL compute Split counts server-side in one pass (no extra DB
  round-trip), mirroring `laneCounts` (`conversations.ts:508`).
- **R3.4** THE SYSTEM SHALL render each built-in Split as a tab with a live count chip using
  the F1 `LaneChip` + `CountBadge` (no new chip markup), in the inbox FilterBar
  (`page.tsx:762-852`).
- **R3.5** WHILE a Split tab is active, THE SYSTEM SHALL drive the list fetch with
  `?split=<id>` and reflect the active Split in the route, consistent with `?lane=`
  (`route.ts:127-129`).
- **R3.6** THE SYSTEM SHALL keep Splits orthogonal to the per-mailbox filter (`?mailbox=`),
  search (`?q=`), bundles, and smart-lanes (`?lane=`): selecting a Split never widens
  visibility beyond the user-scoped set.
- **R3.7** THE SYSTEM SHALL NOT count a conversation in more than one built-in Split.

## R4 — User-defined custom per-sender Splits  [NEW]

- **R4.1** THE SYSTEM SHALL let an owner define a custom Split `{ id, name, senders[],
  hideWhenEmpty? }` where each sender is a domain (`pilae.ch`) or full address
  (`a@pilae.ch`), persisted in `user_preferences` (`resource:"inbox", key:"splits"`) — no
  migration, owner-scoped by `userId`, mirroring `lane-store.ts:37`.
- **R4.2** THE SYSTEM SHALL provide owner-scoped CRUD at `/api/inbox/splits`
  (GET/POST/PATCH/DELETE), returning 401 unauthenticated and 422 on an empty `senders[]` or
  empty `name`, mirroring `/api/inbox/lanes` (`lanes/route.ts`).
- **R4.3** THE SYSTEM SHALL match a conversation to a custom Split by `fromAddress` using the
  EXISTING `clauseMatches` domain/address semantics (`lane-match.ts:48-62`) — no new matcher.
- **R4.4** WHERE a conversation matches one or more custom Splits, THE SYSTEM SHALL assign it
  to the FIRST matching custom Split in user order (first-match-wins) for TAB membership.
- **R4.5** WHEN the list endpoint responds, THE SYSTEM SHALL include custom Splits with live
  counts in the same `splits` payload (after built-ins) and SHALL honor `hideWhenEmpty`
  exactly as custom lanes do (`route.ts:133-140`).
- **R4.6** THE SYSTEM SHALL keep the membership predicate a PURE function
  `resolveCustomSplit(conversation, splits[])`, unit-testable without a DB.
- **R4.7** THE SYSTEM SHALL NOT let a custom Split override the `needs_reply` selectivity
  invariant: a conversation in a custom Split tab still reports its underlying built-in
  `split` for the parity check (R1.11) — custom Splits re-route the tab, not reply-worthiness.

## R5 — States (per Split tab)  [NEW]

- **R5.1** WHILE a built-in Split count is zero, THE SYSTEM SHALL still render that tab with a
  `0` chip; a custom Split with `hideWhenEmpty` SHALL hide when empty (R4.5).
- **R5.2** WHILE the active Split has no conversations, THE SYSTEM SHALL render an
  `EmptyState` with Split-specific copy (Needs Reply -> "Nothing waiting on your reply").
- **R5.3** WHILE a Split list is loading, THE SYSTEM SHALL render the existing `TableSkeleton`
  (`page.tsx:957`) — no new skeleton.
- **R5.4** THE SYSTEM SHALL apply the F1 hover + active chip states to Split tabs
  (`var(--color-accent-soft)` active; hover via the LaneChip contract).

## R6 — G-design gate (cross-cutting, F1 section 8)  [NEW]

- **R6.1** THE SYSTEM SHALL pass all 12 items of the F1 G-design checklist
  (`_specs/inbox-design-system/design.md:85-102`) for Split tabs and chips, recording a
  one-line PASS/FAIL per item in `tasks.md`.
- **R6.2** THE SYSTEM SHALL render Split tabs/chips using only F1 tokens/components (no raw
  hex, shared `LaneChip`/`CountBadge`, lucide-only, dark-mode parity).

## R7 — G-eval gate (cross-cutting, C1)  [NEW]

- **R7.1** THE SYSTEM SHALL add a pure metric for `needs_reply` precision/recall against a
  hand-labeled golden, reusing the `replyWorthyPR` pattern (`inbox-metrics.ts:41`) — a
  `splitPR(cases, target)` scoring a chosen positive Split.
- **R7.2** THE SYSTEM SHALL ship `src/lib/evals/fixtures/inbox/inbox-splits.golden.jsonl` of
  >= 30 hand-labeled cases spanning all five built-in Splits, with >= 8 `needs_reply`
  positives and >= 8 negatives.
- **R7.3** THE SYSTEM SHALL gate `needs_reply` precision >= 0.90 AND recall >= 0.90 in
  `src/__tests__/inbox-splits-gate.test.ts`, wired into `pnpm eval:run` (`package.json:12`),
  mirroring `inbox-reply-worthy-gate.test.ts`.
- **R7.4** THE SYSTEM SHALL assert the parity invariant in the gate: every fixture case
  labeled `needs_reply` is also `replyWorthy` (R1.11), so the two gates can never diverge.

## Non-goals (explicit)

- **NG1** THE SYSTEM SHALL NOT mutate a conversation, demote noise, or persist a Gmail filter
  (that is B4).
- **NG2** THE SYSTEM SHALL NOT generate, store, or send any draft (that is B1).
- **NG3** THE SYSTEM SHALL NOT add a new LLM call, model prompt, or hardcoded vendor list.
- **NG4** THE SYSTEM SHALL NOT add a Drizzle CREATE/ALTER or any migration.
- **NG5** THE SYSTEM SHALL NOT compute follow-up timing or pre-draft nudges (that is B7);
  `follow_ups` is a membership Split only.
- **NG6** THE SYSTEM SHALL NOT change the `InboxLane` enum or the lane-tab behavior.
