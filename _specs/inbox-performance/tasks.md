# F2 — inbox-performance · Tasks

> Total estimate: ~3.0 dev-days (6 half-days). Autonomously-verifiable core =
> B1 + B2 + B3 + B4 (~2.0 days). B5 is founder-gated; B6 is optional/gated.
> Each task: action -> verify -> test -> requirement refs. Branch: feat/inbox-perf
> (off feat/inbox-ai-draft). Per task: code -> test -> verify -> commit.
>
> Verified against live code 2026-06-20 (see design.md section 0 for anchors).

## Ordering rationale

B1 (memoize) is the headline win and unblocks the render-count test. B2 (stable
handlers) is a prerequisite for B1 to actually fire, so they ship together but are
split into two commits (props plumbing, then memo wrapper) for revertability. B3
(load-guard) is independent. B4 (read-model dedup) is independent and tiny. B5/B6
are tail.

---

## B1.1 — [NEW] Stabilize the per-row hover + toggle handlers

- Action: In _conversation-list.tsx, wrap armPrefetch/cancelPrefetch in useCallback
  ([] deps; they close over the hoverTimer ref only). Change InboxRow props to
  onHoverStart?(key)/onHoverEnd?() and pass the SAME function refs to every row
  (the row applies its own c.key). In page.tsx, make onToggleSelect ref-stable:
  add conversationsRef (mirror of the existing page.tsx:422 pattern) and rebuild
  handleToggleSelect with [] deps reading ordered keys from the ref.
- Verify: add a temporary console identity check OR assert in the test (B1.3) that
  the handler reference passed to a given row is identical across a selection change.
- Test: extend conversation-list render test — assert armPrefetch/cancelPrefetch and
  onToggleSelect prop identities are stable across a parent re-render (mock InboxRow,
  capture props twice). File: __tests__/conversation-list.handlers.test.tsx.
- Refs: R1.3, R1.4, R1.5.
- Estimate: 0.5 day.

## B1.2 — [NEW] Wrap InboxRow in React.memo

- Action: In _inbox-row.tsx, change `export function InboxRow(...)` to
  `export const InboxRow = React.memo(function InboxRow(...) { ... });` (keep the
  named inner function for devtools). No JSX change. Wire onMouseEnter={() =>
  onHoverStart?.(c.key)} / onMouseLeave={onHoverEnd} from B1.1.
- Verify: run `pnpm test inbox-row` — the existing inbox-row.test.tsx passes
  UNMODIFIED (R1.6 guard). Run `pnpm tsc` clean.
- Test: existing inbox-row.test.tsx is the regression guard; do not edit it.
- Refs: R1.1, R1.6.
- Estimate: 0.5 day.

## B1.3 — [NEW] Render-count test (the measurable core win)

- Action: Add __tests__/inbox-row-rendercount.test.tsx. Render ConversationList with
  >= 20 sample rows; spy on render invocations per row key (wrap a counter into a
  test double of the row body, or use a render-counting child via React Profiler /
  a module-level Map keyed by item.key incremented in a test-only effect). Change the
  selectedKey prop and assert that at most 2 row bodies re-render (old + new).
- Verify: `pnpm test inbox-row-rendercount` is GREEN; flip the memo off locally to
  confirm the test FAILS without it (proves the test has teeth), then restore.
- Test: this IS the test (R7.1).
- Refs: R1.2, R7.1.
- Estimate: 0.5 day.

---

## B2.1 — [NEW] Pure load-generation guard helper

- Action: Add lib/inbox/load-guard.ts exporting createLoadGuard() ->
  { next(): number; isCurrent(token: number): boolean }. next() increments and
  returns the new token; isCurrent(t) is true only for the latest. No React import.
- Verify: `pnpm tsc` clean; helper has no imports from react/next.
- Test: lib/inbox/__tests__/load-guard.test.ts — next() returns increasing tokens;
  isCurrent true only for the latest; an old token is never current after next().
- Refs: R2.1, R7.3.
- Estimate: 0.5 day.

## B2.2 — [NEW] Wire the guard + AbortController into loadLane

- Action: In page.tsx, add loadGuardRef (createLoadGuard) and abortRef
  (AbortController | null). In loadLane non-append path: abort the previous
  controller, mint a new token + controller, pass signal to fetch. Guard every
  post-await setState with isCurrent(token). In catch, return early on
  err.name === AbortError (no toast, no setListError) BEFORE the existing error
  path (page.tsx:189-191). Append path: append only when current.
- Verify: manually (dev server) switch lanes rapidly attention->done->snoozed; the
  list never flashes a stale lane. Confirm `pnpm tsc` + `pnpm lint` clean.
- Test: extend load-guard usage with a small pure simulation — model two overlapping
  loads (token A issued, token B issued, A resolves last) and assert the A-commit is
  skipped via isCurrent. (The React wiring is covered by the dev verify; the logic
  is covered purely.)
- Refs: R2.1, R2.2, R2.5.
- Estimate: 0.5 day.

---

## B3.1 — [NEW] buildConversations top-label micro-dedup

- Action: In conversations.ts, hoist a module-level byPriorityAsc comparator and
  compute `const topLabel = labels.length ? [...labels].sort(byPriorityAsc)[0] :
  undefined;` once per conversation; reuse it for reasonLabel (line 364, still gated
  on hasOutbound) and importance.intentLabel (line 453). Leave the Math.min priority
  at line 343 untouched (different value).
- Verify: `pnpm test conversations` green; output unchanged.
- Test: lib/inbox/__tests__/conversations.dedup.test.ts — a fixture with mixed
  labels asserts reason, reasonSource, importanceTier, and split are identical to a
  hardcoded expected snapshot (locks byte-identical output, R4.1).
- Refs: R4.1, R4.3, R7.2.
- Estimate: 0.5 day.

---

## B4.1 — [NEW] Regression sweep + key-strategy guard

- Action: Run the full inbox test suite; add a 1-line assertion (or reuse existing)
  that ConversationList renders with key=c.key, not index (R1.7). Confirm no
  behaviour drift across _conversation-list, _inbox-row, page tests.
- Verify: `pnpm test` (web) green; `pnpm tsc` + `pnpm lint` clean; `pnpm build`
  succeeds (page-export build gap guard — no named exports added to page.tsx).
- Test: covered by the existing inbox suite + the new B1.3/B2/B3 tests.
- Refs: R1.6, R1.7.
- Estimate: 0.25 day.

---

## B5.1 — [HORS SCOPE / founder-gated] Live INP / interaction-latency capture

- Action: With the authed dev session on elevay.dev (or :3007), open a large
  attention lane and measure interaction-to-next-paint on j/k navigation and lane
  switches using the Performance panel / web-vitals INP. Compare before vs after F2.
- Verify: founder confirms sub-100ms perceived interaction on selection; screenshot
  the trace. NOT an autonomous gate (Playwright single-browser + idle-logout rule).
- Test: none (manual measurement).
- Refs: R7.4.
- Estimate: 0.25 day (founder time).

## B6.1 — [NEW / optional, gated] Drop unused list-payload field

- Action: Grep for any consumer of `priority` on the list item
  (rg "\.priority" under inbox + palette-commands + _types). If ZERO consumers,
  remove `priority` from route.ts:230 projection AND from ConversationListItem in
  _types.ts. If ANY consumer exists, SKIP this task entirely.
- Verify: `pnpm tsc` clean (proves no consumer broke); `pnpm test` green.
- Test: covered by tsc + existing tests; no new test.
- Refs: R5.3.
- Estimate: 0.25 day (skip if gated out).

---

## Summary

| ID | Tag | Win | Verifiable | Days |
|----|-----|-----|-----------|------|
| B1.1 | [NEW] | Stable per-row handlers | unit (prop identity) | 0.5 |
| B1.2 | [NEW] | React.memo InboxRow | unmodified row test + tsc | 0.5 |
| B1.3 | [NEW] | Render-count proof | RTL render-count | 0.5 |
| B2.1 | [NEW] | Pure load-guard | unit | 0.5 |
| B2.2 | [NEW] | Abort + stale discard | dev verify + pure sim | 0.5 |
| B3.1 | [NEW] | Read-model dedup | snapshot | 0.5 |
| B4.1 | [NEW] | Regression + key guard | full suite | 0.25 |
| B5.1 | [HORS SCOPE] | Live INP | founder, manual | 0.25 |
| B6.1 | [NEW opt] | Payload trim | tsc-gated | 0.25 |

Autonomously-verifiable core (B1+B2+B3+B4): ~2.0 dev-days, fully unit/RTL-gated.

---

End of tasks.md
