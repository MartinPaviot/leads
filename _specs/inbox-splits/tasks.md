# B3 — inbox-splits · Tasks

Total estimate: **~5.0 dev-days** (10 tasks). Order is dependency-correct: pure resolver +
plumbing first (testable headless), then API, then UI, then the gates. Each task: code -> test
-> verify -> commit. Branch `feat/inbox-splits`.

Tag legend: `[NEW]` real code · `[CFG]` config-only.

---

## B1 — Surface the resolver inputs on `Conversation`  ·  [NEW]  ·  0.5d

- **Action**: In `src/lib/inbox/conversations.ts`, add `generalIntent`, `awaitingOurReply`,
  `awaitingTheirReply` to the `Conversation` interface and populate them in the push
  (lines 457-488). `generalIntent` = the value already resolved at line 449 (stop discarding
  it); `awaitingOurReply` = the value at line 415; `awaitingTheirReply` =
  `lane === "attention" && lastMessage?.direction === "outbound"`.
- **Verify**: `pnpm tsc` clean; a built fixture conversation that we last replied to reports
  `awaitingTheirReply: true, awaitingOurReply: false`, and the inverse for an inbound-last one.
- **Test**: extend `src/lib/inbox/__tests__/conversations.test.ts` — assert the three fields on
  an inbound-last, an outbound-last, and a non-attention (done) conversation.
- **Refs**: R2.1, R2.2, R2.3.

## B2 — Pure built-in resolver `resolveSplit`  ·  [NEW]  ·  0.5d

- **Action**: Create `src/lib/inbox/splits.ts` with `BuiltInSplit`, `SplitInput`,
  `SplitResult`, `BUILT_IN_SPLITS` (ordered), and `resolveSplit(input)` implementing the
  section-4 decision table (first-match-wins, no DB/clock/LLM, no vendor list).
- **Verify**: `resolveSplit` returns the table row for each guard; a reply-worthy bulk thread
  awaiting our reply returns `needs_reply` (not `promotions`).
- **Test**: `src/lib/inbox/__tests__/splits.test.ts` — one case per branch + the parity cases
  (R1.11/R1.12/R1.16) + null-intent edges (R1.14/R1.15) + non-attention never `needs_reply`
  (R1.13) + determinism (same input twice -> same output).
- **Refs**: R1.1-R1.16.

## B3 — Pure custom per-sender matcher `resolveCustomSplit`  ·  [NEW]  ·  0.25d

- **Action**: In `splits.ts`, add `resolveCustomSplit(conversation, splits[])` that maps each
  `senders[]` entry to a `clauseMatches` candidate (`@` -> op `is`; else op `domain`,
  `lane-match.ts:52-60`) over `fromAddress`, first-match-wins.
- **Verify**: a thread from `a@pilae.ch` matches a split `{senders:["pilae.ch"]}` and a split
  `{senders:["a@pilae.ch"]}`; a non-matching domain returns null; earliest split wins on overlap.
- **Test**: in `splits.test.ts` — domain match, exact-address match, no-match, overlap order,
  empty `senders` matches nothing.
- **Refs**: R4.3, R4.4, R4.6.

## B4 — Server-side count helper `splitCounts`  ·  [NEW]  ·  0.25d

- **Action**: In `splits.ts`, add `splitCounts(inputs[])` returning `Record<BuiltInSplit,
  number>` in one pass (mirror `laneCounts` `conversations.ts:508`).
- **Verify**: counts sum to the input length; each conversation lands in exactly one bucket.
- **Test**: in `splits.test.ts` — a mixed array sums correctly; no double-count (R3.7).
- **Refs**: R3.3, R3.7.

## B5 — Custom-Split persistence `split-store.ts`  ·  [NEW]  ·  0.25d

- **Action**: Create `src/lib/inbox/split-store.ts` (`getUserSplits`/`saveUserSplits`,
  `resource:"inbox", key:"splits"`) as a structural copy of `lane-store.ts:21-45`. No migration.
- **Verify**: `db:push` not needed; `getUserSplits` for a fresh user returns `[]`; save then
  read round-trips the array; an unrelated `key:"lanes"` row is untouched.
- **Test**: `src/lib/inbox/__tests__/split-store.test.ts` with a mocked `db` (mirror any
  existing lane-store test) — empty default, upsert round-trip, owner-scope filter.
- **Refs**: R4.1.

## B6 — Custom-Split CRUD `/api/inbox/splits`  ·  [NEW]  ·  0.5d

- **Action**: Create `src/app/api/inbox/splits/route.ts` (GET/POST/PATCH/DELETE) copying
  `lanes/route.ts` with the `splitSchema` (`name`, `senders[].min(1)`, `hideWhenEmpty?`).
- **Verify**: GET 401 without auth; POST 201 with a body; POST 422 on empty `senders`/`name`;
  PATCH/DELETE 404 on an unknown id; DELETE removes the split.
- **Test**: `src/app/api/inbox/__tests__/splits-route.test.ts` (mirror the lanes-route test if
  present) — the five status paths above with a mocked auth context + store.
- **Refs**: R4.2, R4.5.

## B7 — Wire Splits into `/api/inbox/conversations`  ·  [NEW]  ·  0.75d

- **Action**: In `src/app/api/inbox/conversations/route.ts`: (a) read `?split=`; (b) when set
  to a built-in id, filter `visible` to attention-lane rows whose `resolveSplit` matches; when
  a custom id, filter by `resolveCustomSplit` (beside lines 113-129); (c) build the `splits`
  count payload — built-ins via `splitCounts` + custom via `resolveCustomSplit` honoring
  `hideWhenEmpty` (beside 133-140); (d) add `split` to each row (beside 185-208).
- **Verify**: `GET ?lane=attention&split=needs_reply` returns only reply-worthy awaiting-us
  threads; `splits[]` counts sum to the attention count; `?mailbox=` still narrows; a custom
  split id filters by sender; `splits` payload never widens beyond the scoped set.
- **Test**: `src/app/api/inbox/__tests__/conversations-splits.test.ts` — built-in filter,
  custom filter, count-sum invariant, mailbox-orthogonality, unknown `?split=` falls back to
  the full attention lane.
- **Refs**: R2.4, R3.1, R3.2, R3.3, R3.5, R3.6, R4.5, R4.7.

## B8 — Split tabs UI `_split-tabs.tsx` + page wiring + states  ·  [NEW]  ·  0.75d

- **Action**: Create `src/app/(dashboard)/inbox/_split-tabs.tsx` rendering built-in + custom
  Splits with F1 `LaneChip`/`CountBadge`. In `page.tsx`: add `activeSplit` state, render the
  strip below the lane tabs when `tab==="attention"`, thread `&split=` into `loadLane`
  (`page.tsx:138-140`), and show a per-Split `EmptyState` (R5.2) / `TableSkeleton` (R5.3).
- **Verify** (own screenshot): selecting Needs Reply shows only those threads + a live chip;
  empty Promotions shows its EmptyState; active/hover chip states render; switching to Snoozed
  hides the Split strip; dark mode parity.
- **Test**: `src/app/(dashboard)/inbox/__tests__/split-tabs.test.tsx` (happy-dom) — renders one
  chip per built-in with its count, fires `onSelect(id)` on click, marks the active chip,
  hides a `hideWhenEmpty` custom split at count 0.
- **Refs**: R3.4, R3.5, R5.1, R5.2, R5.3, R5.4.

## B9 — G-design gate (F1 12-item checklist)  ·  [CFG]  ·  0.25d

- **Action**: Run the F1 G-design checklist (`_specs/inbox-design-system/design.md:85-102`)
  against the Split tabs/chips; fix any miss (must already pass since it reuses LaneChip).
- **Verify**: record a one-line PASS/FAIL per item below; `tokens.contract.test.ts` green for
  the new `_split-tabs.tsx` (no raw hex). Pass = 12/12.
  - 1 Tokens only · 2 One gradient · 3 One button system · 4 Type scale · 5 Density ·
    6 Radius family · 7 Elevation tokens · 8 Contrast · 9 Dark-mode parity · 10 Lucide/no-emoji ·
    11 Focus + motion · 12 State coverage (empty/skeleton/hover present).
- **Test**: `_split-tabs.tsx` is covered by the existing `inbox/__tests__/tokens.contract.test.ts`
  glob (add the file if the glob is explicit).
- **Refs**: R6.1, R6.2.

## B10 — G-eval gate: golden + `splitPR` + wire to `eval:run`  ·  [NEW]  ·  1.0d

- **Action**: (a) Add `splitPR(cases, target)` to `src/lib/evals/inbox-metrics.ts`
  (generalize `replyWorthyPR:41`). (b) Hand-label
  `src/lib/evals/fixtures/inbox/inbox-splits.golden.jsonl` (>= 30 cases, all five Splits,
  >= 8 `needs_reply` pos / >= 8 neg). (c) Create
  `src/__tests__/inbox-splits-gate.test.ts` (mirror `inbox-reply-worthy-gate.test.ts`):
  fixture-integrity + `splitPR(scored, "needs_reply")` precision/recall >= 0.90 + zero
  false-negatives on human mail + the PARITY assertion (every `needs_reply` row is
  `replyWorthy`). (d) Append the gate file to `eval:run` in `package.json:12`.
- **Verify**: `pnpm eval:run` runs the new gate green; intentionally flipping one golden label
  reds it (proves it bites); the parity assertion fails if a `needs_reply` row has
  `replyWorthy:false`.
- **Test**: the gate test IS the deliverable; add pure-metric unit cases for `splitPR`
  (perfect agreement -> 1/1; a false positive drops precision; a false negative drops recall).
- **Refs**: R7.1, R7.2, R7.3, R7.4, R1.11.

---

## Acceptance (definition of done, software — separate from any OKR)

- `pnpm tsc` + `pnpm lint` clean; `pnpm test` green (new unit suites included).
- `pnpm eval:run` green WITH the new `inbox-splits-gate` (precision/recall >= 0.90, parity).
- `?split=<built-in>` and `?split=<custom-id>` filter correctly; `splits[]` counts sum to the
  attention total and never widen scope.
- No migration, no new dependency, no LLM call, no `InboxLane` change (verified by diff).
- G-design 12/12 recorded in B9.

## Slice map (for the PR description)

1. **B1-B4** — resolver + plumbing (pure, headless, fully unit-tested).
2. **B5-B6** — custom-Split persistence + CRUD (reuses smart-lane code, no migration).
3. **B7** — API: `?split=` filter + `splits[]` counts + per-row `split`.
4. **B8** — Split tabs UI + states (F1 components).
5. **B9-B10** — the two cross-cutting gates (G-design 12/12, G-eval >= 0.90 + parity).
