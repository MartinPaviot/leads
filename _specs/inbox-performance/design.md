# F2 — inbox-performance · Design

> Anchored to live code on feat/inbox-ai-draft, verified 2026-06-20. This is a
> performance pass: no schema change, no new route, no new dependency, no new
> provider. The architecture is unchanged; this document is a DIFF over it.

## 0. Architecture diff (what is added vs already there)

Already there (DO NOT rebuild):
- Master-detail inbox tree, single use-client component: page.tsx:77.
- Read-model assembly (pure, injectable): lib/inbox/conversations.ts:258.
- List route with server-side pagination (PAGE_SIZE=30): api/inbox/conversations/route.ts:24,151.
- DB loader with ROW_CAP=500 per side: lib/inbox/load.ts:15,31.
- Hover-intent + neighbour prefetch with a TTL/dedup cache:
  _conversation-list.tsx:73-83, page.tsx:730-737, lib/inbox/detail-cache.ts.
- Search debounce (300ms) and pendingTriage read-after-write guard:
  page.tsx:201-204, page.tsx:131.
- Row renderer extracted to its own component (F1): _inbox-row.tsx:27.

Added by F2 (the whole delta):
1. React.memo wrapper around InboxRow + stable per-row handlers (R1).
2. A pure load-generation guard helper for stale-response discard + an
   AbortController in loadLane (R2).
3. A one-line micro-dedup of the priority-sorted label in buildConversations (R4.1).
4. (Optional, gated) drop a provably-unused list-payload field (R5.3).
5. Tests that lock the wins in (render-count, pure-guard, snapshot).

Nothing else moves. Virtualization and RSC streaming are explicitly OUT (R6).

## 1. R1 — Memoize InboxRow + stabilize handlers

Problem (live): _conversation-list.tsx:108-124 renders the list as
conversations.map(c => <InboxRow ... onMouseEnter={() => armPrefetch(c.key)}
onMouseLeave={cancelPrefetch} onSelect={onSelect} onToggleSelect={onToggleSelect} />).
InboxRow is a bare function component (_inbox-row.tsx:27), so every parent render
re-renders all N rows. A selection change (page.tsx setSelectedKey) re-renders the
page, which re-renders ConversationList, which re-renders every InboxRow — even
though only two rows visually change (old selected, new selected).

Design:
1. Wrap the row export: `export const InboxRow = React.memo(function InboxRow(...) {...})`
   in _inbox-row.tsx. Props are all primitives/stable refs except the handlers,
   so a default shallow-equal memo is correct once handlers are stable.
2. Stabilize the hover handlers. Move the per-key closure OUT of the map: give
   InboxRow `onMouseEnter?: (key: string) => void` / `onMouseLeave?: () => void`
   semantics where the row applies its own key, OR (simpler, preferred) pass the
   list-level `armPrefetch`/`cancelPrefetch` and have InboxRow call
   onMouseEnter (it already receives no-arg today). Concretely: change the row
   props to `onHoverStart?: (key: string) => void` and `onHoverEnd?: () => void`,
   and in InboxRow wire onMouseEnter={() => onHoverStart?.(c.key)}. The list then
   passes the SAME function reference to every row.
3. Stabilize armPrefetch/cancelPrefetch with useCallback (currently recreated each
   list render: _conversation-list.tsx:74-83). They close over the hoverTimer ref
   only, so [] deps are correct.
4. Stabilize onToggleSelect. Today page.tsx:367-373 useCallback depends on
   conversations (it reads ordered keys for shift-range). Make it ref-stable: keep
   a conversationsRef (the page already uses this pattern at page.tsx:422) and read
   ordered keys from the ref inside a [] -dep useCallback, so the row prop identity
   never changes on a list update. onSelect is already setSelectedKey (stable).

Behaviour invariant (R1.6): the row JSX is untouched; only the export wrapper and
the hover-prop plumbing change. inbox-row.test.tsx must stay green unmodified.

Why memo is safe here: ConversationListItem props are value-stable per key across
a selection change (the same object reference is reused — setConversations is not
called on select), and `selected`/`multiSelected` flip only for the two affected
rows. So shallow-equal re-renders exactly those two. This is the measurable win
(R7.1).

## 2. R2 — Stale-response discard + abort

Problem (live): loadLane (page.tsx:146-198) fires a fetch and commits the JSON to
state unconditionally on resolve. There is no generation token and no
AbortController. Rapid lane/mailbox/split switches (or a slow attention fetch
landing after the user moved to Done) can overwrite the current lane with stale
rows. The existing pendingTriage guard (page.tsx:154) only orders writes-then-reads;
it does not protect read-vs-read ordering.

Design (reuse-first, minimal surface):
1. New PURE helper lib/inbox/load-guard.ts:
   - `createLoadGuard()` returns `{ next(): number; isCurrent(token): boolean }`.
   - `next()` increments an internal counter and returns the new token.
   - `isCurrent(token)` is true only for the latest issued token.
   This is the unit-testable core (R7.3) with zero React.
2. In the page, hold `const loadGuard = useRef(createLoadGuard())`. At the top of
   loadLane (non-append path), `const token = loadGuard.current.next()` and create
   `const ctrl = new AbortController()`. Pass `signal: ctrl.signal` to fetch.
   On the NEXT load, abort the previous controller (kept in a ref).
3. After `await res.json()`, guard every setState with
   `if (!loadGuard.current.isCurrent(token)) return;` so a stale resolution is a
   no-op. The append (load-more) path keeps its own token but appends only when
   current.
4. R2.5 — in catch, `if (err.name === 'AbortError') return;` BEFORE the
   setListError/toast path (page.tsx:189-191), so a deliberate abort is silent.

Note: this is correctness-as-speed. It does not change the happy path latency; it
removes the wasted commit + the wasted round-trip on rapid switches, which is the
felt jank when toggling lanes fast.

## 3. R4.1 — buildConversations micro-dedup

Live: conversations.ts computes `[...labels].sort(byPriority)[0]` twice — once for
reasonLabel (line 364, gated on hasOutbound) and once for importance.intentLabel
(line 453). The comparator is identical:
`(a,b) => (PRIORITY_BY_LABEL[a] ?? 4) - (PRIORITY_BY_LABEL[b] ?? 4)`.

Design: compute it ONCE per conversation, above the reason block:
`const topLabel = labels.length ? [...labels].sort(byPriorityAsc)[0] : undefined;`
then reuse `topLabel` in both places. `byPriorityAsc` can be a module-level
function (hoisted, allocation-free). Output is byte-identical — proven by R7.2
snapshot. This is a 1-line-net change; it does NOT touch the lane/priority/reason
logic, only removes a redundant sort allocation per row. Keep the existing
`Math.min(4, ...labels.map(...))` for `priority` (line 343) — it is a different
value (the min tier across ALL labels, not the top label) and must stay.

## 4. R5.3 — payload audit (gated, optional)

Live projection: route.ts:226-252 returns ~22 fields per row. The row
(_inbox-row.tsx) and _types.ConversationListItem consume nearly all of them. The
only candidate is `priority` (route.ts:230): the row sorts/colors on
`importanceTier` (line 113), not `priority`. Grep before removing:
`rg "\.priority\b" app/apps/web/src/app/(dashboard)/inbox` and the palette/types.
If `priority` has zero list/pane consumers, drop it from the projection AND from
ConversationListItem. If it has any consumer, SKIP R5.3 — the win is sub-kilobyte
and not worth a type break. This task is OPTIONAL and must not block the core.

## 5. Orchestration (Inngest)

None. F2 touches no background jobs. (Audit: no inbox Inngest fn is on the list
render path; the sync pipeline that populates activities is upstream and unchanged.)

## 6. Integrations vs the locked stack

- React 19 + React.memo / useCallback — Layer 1, already in use across the app.
- AbortController / fetch signal — Web platform, already used in the pane via the
  `cancelled` flag pattern (_conversation-pane.tsx:237). No new dep.
- Vitest + @testing-library/react — already the test stack (inbox-row.test.tsx).
- No new provider, no new package, no migration. Confirmed against
  app/apps/web/package.json (not modified).

## 7. Guardrails (one line each)

- G1: InboxRow JSX/behaviour unchanged — inbox-row.test.tsx stays green unmodified (R1.6).
- G2: List key stays c.key, never index (R1.7).
- G3: buildConversations stays pure and output byte-identical — snapshot gate (R4.1/R7.2).
- G4: load-guard is a pure helper, no React import — unit-tested in isolation (R7.3).
- G5: AbortError is silent; real errors keep the existing error+Retry path (R2.5).
- G6: No virtualization, no RSC, no read-model cache (R6/R4.4) — flagged, not built.
- G7: No new dependency / provider / migration.
- G8: Founder-gated INP/Lighthouse measurement is a verification step, not a CI gate (R7.4).

## 8. File touch-list (precise)

- _inbox-row.tsx — wrap export in React.memo; add onHoverStart/onHoverEnd plumbing (R1).
- _conversation-list.tsx — useCallback armPrefetch/cancelPrefetch; pass stable hover
  handlers; keep key=c.key (R1).
- page.tsx — conversationsRef-backed stable onToggleSelect; loadGuard + AbortController
  in loadLane; AbortError silence (R1.4, R2).
- lib/inbox/load-guard.ts — NEW pure helper (R2/R7.3).
- lib/inbox/conversations.ts — single topLabel dedup (R4.1).
- (optional) route.ts + _types.ts — drop `priority` if unused (R5.3).
- __tests__ — render-count test, load-guard test, buildConversations snapshot (R7).

---

End of design.md
