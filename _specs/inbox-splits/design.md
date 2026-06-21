# B3 — inbox-splits · Design

## 1. Approach

Splits is a **resolver + plumbing + tab** feature, not a new subsystem. Every classification
signal it needs already lands on each conversation; two of them are computed and thrown away.
So B3 = (a) one pure resolver `resolveSplit`, (b) surface three already-computed signals on the
`Conversation`, (c) a server-side count pass + a `?split=` filter mirroring the existing
`?lane=`/custom-lane path, (d) F1 tabs/chips, (e) a sibling `user_preferences` store for custom
per-sender Splits reusing the smart-lane code, (f) a golden + gate. Completeness target 9/10;
the only residual is per-Split display copy + eval fixture breadth (hand-labeling), both bounded.

## 2. Architecture diff vs existing

Added (new files):
- `src/lib/inbox/splits.ts` — `resolveSplit` (built-in) + `resolveCustomSplit` (per-sender) +
  ordered `BUILT_IN_SPLITS` + `splitCounts`. Pure: no DB/clock/LLM.
- `src/lib/inbox/split-store.ts` — owner-scoped `getUserSplits`/`saveUserSplits` in
  `user_preferences` (`resource:"inbox", key:"splits"`). Copy of `lane-store.ts:21-45`.
- `src/app/api/inbox/splits/route.ts` — GET/POST/PATCH/DELETE CRUD. Copy of
  `src/app/api/inbox/lanes/route.ts` with a `senders[]` schema instead of `clauses[]`.
- `src/app/(dashboard)/inbox/_split-tabs.tsx` — built-in + custom Split tab strip (renders F1
  `LaneChip`/`CountBadge`).
- `src/__tests__/inbox-splits-gate.test.ts` — the G-eval gate.
- `src/lib/evals/fixtures/inbox/inbox-splits.golden.jsonl` — >= 30 hand-labeled cases.
- `src/lib/inbox/__tests__/splits.test.ts` (+ store/route tests) — unit coverage.

Changed (existing files):
- `src/lib/inbox/conversations.ts` — surface `generalIntent` (discarded at line 449),
  `awaitingOurReply` (computed at line 415), `awaitingTheirReply` (new, from `messages[]`),
  and `split` on the `Conversation` interface + the push at lines 457-488.
- `src/app/api/inbox/conversations/route.ts` — add `?split=` filtering (beside the
  `customLane`/`lane` branch at lines 113-129), the built-in+custom `splits` count payload
  (beside `customLanes` at 133-140 and `counts` at 209), and `split` on each row (185-208).
- `src/app/(dashboard)/inbox/_types.ts` — add `split` to `ConversationListItem` (line 12);
  add `BuiltInSplit` type; add `splits` to the list-response shape used in `page.tsx`.
- `src/app/(dashboard)/inbox/page.tsx` — add `activeSplit` state + the `_split-tabs.tsx`
  strip; thread `?split=` into `loadLane` (lines 132-176); Split-specific `EmptyState`.
- `src/lib/evals/inbox-metrics.ts` — add `splitPR` (generalization of `replyWorthyPR:41`).
- `app/apps/web/package.json` — append the gate file to the `eval:run` script (line 12).

Already there (NOT touched beyond reads): `isReplyWorthy`, `resolveGeneralIntent`,
`classifyInboundSender`, `checkSla`, `clauseMatches`, `LaneChip`/`CountBadge`, `getAuthContext`,
`getInboxScope`/`scopeConversationRows`, `EmptyState`, `TableSkeleton`.

## 3. Data model

None — no Drizzle CREATE/ALTER, no migration (NG4). Custom Splits live in the existing
`user_preferences` table (`src/db/schema/auth.ts:141-164`: JSONB `value`, unique on
`(userId, resource, key)`), exactly as smart lanes (`lane-store.ts:12-13`,
`resource:"inbox", key:"lanes"`) and filters (`filter-store.ts:10-11`, `key:"filters"`) do.
B3 adds a third sibling key `"splits"`. Value shape and resolver contracts:

    // user_preferences.value where resource="inbox", key="splits"
    Array<{ id: string; name: string; senders: string[]; hideWhenEmpty?: boolean }>

    type BuiltInSplit = "needs_reply" | "follow_ups" | "promotions" | "social" | "other";
    interface SplitInput {
      lane: Lane;                  // conversations.ts Lane
      replyWorthy: boolean;        // conversations.ts:447
      generalIntent: GeneralIntent | null;  // surfaced from conversations.ts:449
      isBulk: boolean;             // conversations.ts:479
      awaitingOurReply: boolean;   // surfaced from conversations.ts:415
      awaitingTheirReply: boolean; // new, from messages[] last direction
    }
    interface SplitResult { split: BuiltInSplit; reasons: string[]; }

## 4. The resolver (R1) — decision table

`resolveSplit` is first-match-wins, ordered exactly as R1.7. Every branch reads a signal that
already exists on the conversation; nothing is re-classified.

| # | Guard | Split | Source signal |
|---|-------|-------|---------------|
| 1 | `lane === "attention" && replyWorthy && awaitingOurReply` | `needs_reply` | conversations.ts:447,415 |
| 2 | `lane === "attention" && awaitingTheirReply` | `follow_ups` | messages[] direction |
| 3 | `isBulk || generalIntent === "promotion_newsletter"` | `promotions` | conversations.ts:479 / :449 |
| 4 | `generalIntent === "social" || generalIntent === "notification"` | `social` | conversations.ts:449 |
| 5 | (fallthrough) | `other` | — |

Parity guarantees fall out of the ordering: branch 1 fires before 3/4, so any reply-worthy
human thread awaiting our reply is `needs_reply` even if bulk-flagged (R1.12, R1.16). Branch 1
also gates on `lane === "attention"`, so a done/snoozed/handled thread can never be
`needs_reply` (R1.13). And `needs_reply` requires `replyWorthy`, so R1.11 holds by
construction — the gate test (section 9) proves it on the fixture.

Why `follow_ups` (branch 2) sits ABOVE promotions: a thread we sent and are awaiting a reply on
matches the Upstream Follow-Ups lane semantics (we owe nothing; they do); ordering it above
promotions/social keeps that intent clear.

`awaitingTheirReply` derivation (the only genuinely new signal): in `buildConversations`,
`lastMessage = messages[messages.length-1]` already exists (`conversations.ts:411`).
`awaitingOurReply` is `lane === "attention" && lastMessage.direction === "inbound"`
(`conversations.ts:415`). The mirror is
`awaitingTheirReply = lane === "attention" && lastMessage?.direction === "outbound"`. Both
surfaced on the `Conversation` (R2.2, R2.3) — one new boolean from data already in hand.

## 5. The API diff (R3) — `/api/inbox/conversations`

The route already does this shape for custom lanes; Splits slot in beside it:

- **Filter** (beside `route.ts:113-129`): add `splitParam = url.searchParams.get("split")`.
  Built-in id -> `inLane = visible.filter(({c}) => c.lane === "attention" &&
  resolveSplit(toSplitInput(c)).split === splitParam)`. Custom id -> filter by
  `resolveCustomSplit`. An explicit `?lane=` custom-lane id keeps its own branch; `?split=` is
  a sibling branch, never combined (R3.6).
- **Counts** (beside `route.ts:133-140` and `:209`): `splitCounts` over
  `visible.filter(({c}) => c.lane === "attention")` -> `[{id,name,count}]` for the five
  built-ins, then append custom Splits via `resolveCustomSplit` honoring `hideWhenEmpty`.
  Returned as `splits`.
- **Row** (beside `route.ts:185-208`): add `split: resolveSplit(toSplitInput(c)).split` to each
  `ConversationListItem`.

`toSplitInput(c)` is a one-liner over the now-surfaced `Conversation` fields — no new query, no
extra DB round-trip (R3.3). All counting runs over the SAME `visible` array the lane counts use
(`route.ts:90`), so per-mailbox/search scoping is inherited for free (R3.6).

## 6. Custom-Split persistence + CRUD (R4)

- `split-store.ts` is a structural copy of `lane-store.ts:21-45` with `KEY = "splits"`. Same
  `onConflictDoUpdate` upsert, same owner scope.
- `/api/inbox/splits/route.ts` copies `lanes/route.ts` with the Zod schema:

      const splitSchema = z.object({
        name: z.string().min(1).max(60),
        senders: z.array(z.string().min(1)).min(1, "a split needs at least one sender"),
        hideWhenEmpty: z.boolean().optional(),
      });

  401 unauthenticated (`getAuthContext`), 422 on empty `name`/`senders` (Zod), 404 on PATCH/
  DELETE of an unknown id — identical to `lanes/route.ts:25-75`.
- `resolveCustomSplit(c, splits)` maps each sender string to a `clauseMatches` call: a string
  containing `@` -> `{field:"from", op:"is", value}`; otherwise
  `{field:"from", op:"domain", value}` (`lane-match.ts:52-60`). First split whose any sender
  matches `c.fromAddress` wins (R4.4). Pure (R4.6). No new matcher (R4.3).

## 7. UI (R3.4, R5, R6) — `_split-tabs.tsx` + page wiring

- Split tabs render with the F1 `LaneChip`/`CountBadge` (`_lane-chip.tsx`, design.md:79-80) —
  the SAME component the lane tabs and custom-lane tabs use, so they cannot drift (R3.4, R6.2).
  Built-ins always shown; custom Splits filtered by `hideWhenEmpty` server-side (R5.1).
- The strip sits in the FilterBar (`page.tsx:762-852`), a row below the lane tabs (lanes pick
  attention/snoozed/done/handled; Splits sub-segment attention). When a non-attention lane is
  active, the Split strip hides (Splits only partition attention).
- `page.tsx` gains `activeSplit` state; selecting a Split sets it, clears `customLaneId`, and
  drives `loadLane` with `&split=<id>` appended in the fetch (`page.tsx:138-140`), like
  `&mailbox=`/`&q=`. The active Split is reflected in the URL (R3.5).
- Empty state (R5.2): when the active Split returns 0 rows, render `EmptyState` with per-Split
  copy from a `SPLIT_EMPTY` map. Loading reuses `TableSkeleton` (R5.3).

## 8. Integrations

None added. Stack unchanged (Next 15 App Router, React 19, Tailwind 4, Drizzle, Zod,
lucide-react). No new dependency, no LLM, no Inngest function (Splits are read-time pure
compute). Confirmed against the locked stack in CLAUDE.md.

## 9. G-eval gate (R7)

- `splitPR(cases, target)` in `inbox-metrics.ts` generalizes `replyWorthyPR:41`: positive class
  = predicted split equals `target`. Same confusion-matrix + vacuous-1 semantics.
- `inbox-splits.golden.jsonl`: each line `{ id, scenario, input: SplitInput, expected:
  BuiltInSplit }`, mirroring the reply-worthy golden. >= 30 cases, >= 8 `needs_reply` pos /
  >= 8 neg (R7.2).
- `inbox-splits-gate.test.ts` (mirror of `inbox-reply-worthy-gate.test.ts`): fixture-integrity
  block (unique ids, valid `BuiltInSplit` expected, well-formed `SplitInput`) + the
  `splitPR(scored, "needs_reply")` block asserting precision >= 0.90, recall >= 0.90, zero
  false-negatives on the human-mail subset (R7.3). Plus the PARITY assertion: every case whose
  `expected === "needs_reply"` has `input.replyWorthy === true` (R7.4).
- Wire into `eval:run` (`package.json:12`) by appending
  `src/__tests__/inbox-splits-gate.test.ts` to the vitest arg list.

## 10. Guardrails (one line each)

- Resolver is PURE: no DB, network, LLM, or ambient clock; `splits.test.ts` proves determinism.
- No hardcoded vendor/domain list in `resolveSplit` (classification via existing signals).
- `needs_reply` -> `replyWorthy` is invariant; the gate fails if any fixture row breaks it.
- Custom Splits persist only in `user_preferences` (resource "inbox", key "splits"); no migration.
- Custom-Split matching reuses `clauseMatches`; no second matcher.
- Split counts run over the SAME scoped `visible` set as lane counts; never widen scope.
- Each conversation resolves to exactly one built-in Split; counts sum to the attention total.
- Tabs/chips use F1 `LaneChip`/`CountBadge` only; no raw color literal; dark-mode via tokens.
- `InboxLane` enum and lane-tab behavior unchanged.
- No mutation, no draft, no noise demotion, no Gmail filter (B1/B4 own those).
