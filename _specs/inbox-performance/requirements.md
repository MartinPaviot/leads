# F2 — inbox-performance · Requirements (EARS)

> Roadmap row: _specs/inbox-overhaul/ROADMAP.md:41 — F2 inbox-performance:
> perceived speed (optimistic UI, prefetch, sub-100ms interaction budget,
> route transitions), priority P1.
>
> Scope discipline: PERFORMANCE-ONLY. Reuse-first. No migration, no new
> provider, no new dependency. Every requirement is anchored to live code on
> feat/inbox-ai-draft; tags reflect what that code actually does today.
>
> Verified against live code 2026-06-20:
> - app/apps/web/src/app/(dashboard)/inbox/page.tsx
> - app/apps/web/src/app/(dashboard)/inbox/_conversation-list.tsx
> - app/apps/web/src/app/(dashboard)/inbox/_inbox-row.tsx
> - app/apps/web/src/lib/inbox/conversations.ts
> - app/apps/web/src/lib/inbox/detail-cache.ts
> - app/apps/web/src/app/api/inbox/conversations/route.ts
> - app/apps/web/src/lib/inbox/load.ts

## Tag legend

- [DONE] — already shipped; do NOT re-spec.
- [NEW] — real perf gap; needs code.
- [CFG] — config/constant only.
- [LOCKED] — stack/architecture decision; do not reopen.
- [HORS SCOPE] — tracked, deliberately deferred (ocean or non-perf).

---

## R1 — List render cost (the core boilable lake)

- R1.1 [NEW] THE SYSTEM SHALL render InboxRow as a referentially-memoized
  component (React.memo) so a row whose props are unchanged does not re-render.
  (Today _inbox-row.tsx:27 is a bare export-function InboxRow with no memo.)

- R1.2 [NEW] WHEN the user changes the selected conversation (click or j/k),
  THE SYSTEM SHALL re-render only the previously-selected row and the
  newly-selected row — NOT every row in the list.
  (Today _conversation-list.tsx:110-124 maps all rows with fresh inline
  closures every parent render, so all N rows re-render on any selection change.)

- R1.3 [NEW] WHEN the user hovers a row (prefetch arm/cancel), THE SYSTEM
  SHALL NOT re-render sibling rows.
  (Hover today does not change React state, but the per-row inline
  onMouseEnter/onMouseLeave arrows at _conversation-list.tsx:121-122 are
  fresh identities; memoization is moot without stable handler identity — R1.4.)

- R1.4 [NEW] THE SYSTEM SHALL pass each InboxRow a referentially-stable
  onSelect, onToggleSelect, onMouseEnter, and onMouseLeave handler across
  parent re-renders that do not change the row identity, so React.memo
  is effective.
  (onSelect=setSelectedKey at page.tsx:1022 is already a stable setState
  identity [DONE]; onToggleSelect=handleToggleSelect is a useCallback
  but depends on conversations so it re-creates on every list change at
  page.tsx:367-373; the hover arrows are inline [NEW].)

- R1.5 [NEW] WHERE a row hover handler needs the row key, THE SYSTEM SHALL
  derive the key inside InboxRow (passing armPrefetch/cancelPrefetch with the
  key applied there) rather than allocating a per-row closure in the list map.

- R1.6 [NEW] THE SYSTEM SHALL keep InboxRow behaviour byte-identical
  (selection rail, checkbox, avatar, priority dot, reason, labels, SLA chip,
  follow-up chip, received-on chip) — memoization is a pure perf change, no
  visual or behavioural delta. (Regression guard against inbox-row.test.tsx.)

- R1.7 [NEW] THE SYSTEM SHALL keep the list key strategy on the stable
  conversation key (_conversation-list.tsx:112), never on array index, so
  React reconciles rows by identity. (Already key=c.key [DONE] — assert it
  stays as a guard.)

---

## R2 — Request lifecycle (stale-response correctness = perceived speed)

- R2.1 [NEW] WHEN a lane load is superseded by a newer lane/mailbox/search/
  split load before it resolves, THE SYSTEM SHALL discard the stale response and
  never commit it to conversations/counts.
  (Today loadLane page.tsx:146-198 has no AbortController and no generation
  guard; a slow attention fetch can resolve after the user switched to Done and
  overwrite the Done list.)

- R2.2 [NEW] WHEN a rapid sequence of lane switches fires, THE SYSTEM SHALL
  abort the in-flight fetch for the superseded load (via AbortController) so
  the browser cancels the wasted round-trip.

- R2.3 [DONE] THE SYSTEM SHALL debounce the search box so each keystroke does
  not refetch. (page.tsx:201-204, 300 ms setTimeout -> debouncedSearch.
  Do NOT re-spec.)

- R2.4 [DONE] WHEN a triage write is in flight, THE SYSTEM SHALL await it
  before the next lane GET so the read never races the write.
  (pendingTriage ref, page.tsx:131,154,352. Do NOT re-spec.)

- R2.5 [NEW] IF the aborted fetch rejects with an AbortError, THEN THE
  SYSTEM SHALL treat it as a no-op (no toast, no listError), distinct from a
  genuine network/5xx failure which keeps the existing error path
  (page.tsx:189-191).

---

## R3 — Detail prefetch & neighbour warming (audit — mostly DONE)

- R3.1 [DONE] WHEN the cursor rests on a row ~150 ms, THE SYSTEM SHALL warm
  that thread detail into the prefetch cache. (_conversation-list.tsx:73-83
  hover-intent timer -> prefetchDetail. Do NOT re-spec.)

- R3.2 [DONE] WHEN the selection changes, THE SYSTEM SHALL warm the two
  j/k-adjacent neighbours, bounded to two requests. (page.tsx:730-737.)

- R3.3 [DONE] WHILE a fresh cache entry (< 30 s TTL) exists for a key, THE
  SYSTEM SHALL NOT refetch it on repeated hovers. (detail-cache.ts:30-39
  dedup + TTL; rejected fetch self-evicts. Do NOT re-spec.)

- R3.4 [DONE] WHEN a conversation is opened, THE SYSTEM SHALL drain the
  warmed promise if still fresh, else fetch authoritatively.
  (_conversation-pane.tsx:240-245 takeCachedDetail else fetch. Do NOT re-spec.)

- R3.5 [NEW] (small) WHILE hovering rapidly across many rows, THE SYSTEM
  SHALL ensure at most one hover-intent prefetch is armed at a time.
  (Already true — single shared hoverTimer ref _conversation-list.tsx:73.
  Tag [NEW] only to add an explicit regression test; no code change expected.)

---

## R4 — buildConversations read-model cost (audit + micro-dedup)

- R4.1 [NEW] (micro) THE SYSTEM SHALL compute the priority-sorted label
  ([...labels].sort(byPriority)[0]) at most ONCE per conversation and reuse it
  for reason, importance.intentLabel, and any other consumer.
  (Today it is sorted twice — conversations.ts:364 for reasonLabel and
  :453 for importance.intentLabel — plus a Math.min pass at :343. Pure
  micro-dedup; same output, fewer allocations.)

- R4.2 [DONE] THE SYSTEM SHALL sort the assembled conversations in
  O(n log n) (single Array.sort), with no quadratic pass.
  (sortConversations conversations.ts:562-576 — one comparator sort. The
  per-group inbound/outbound sorts :287-288 are over small per-thread arrays.
  No quadratic loop found. Do NOT optimize further — flag any rewrite as ocean.)

- R4.3 [NEW] (micro) THE SYSTEM SHALL keep buildConversations a PURE
  function with no added I/O, so its cost stays unit-measurable and the route can
  call it once per request (route.ts:68) as today.

- R4.4 [HORS SCOPE] Memoizing/caching buildConversations output across
  requests (per-tenant read-model cache with invalidation) is an OCEAN
  (cache-invalidation surface, staleness contract) — deferred, not forced.

---

## R5 — Route payload & DB load (audit)

- R5.1 [DONE] THE SYSTEM SHALL cap the in-memory assembly slice at 500 rows
  per side. (load.ts:15 ROW_CAP = 500. Founder-led volume fits; do NOT
  re-spec. Tightening it is a [CFG] lever, not a code gap.)

- R5.2 [DONE] THE SYSTEM SHALL paginate the list response at 30 rows/page
  and slice server-side. (route.ts:24,151. Do NOT re-spec.)

- R5.3 [NEW] (small) THE SYSTEM SHALL NOT serialize per-row fields the master
  list never reads. (Audit finding: the route projection route.ts:226-252 is
  ~22 fields and the row uses most of them; priority is sent but the row reads
  importanceTier, not priority. The win is marginal — spec ONLY the verifiable
  removal of provably-unused fields, gated on a grep proving zero consumers.)

- R5.4 [LOCKED] THE SYSTEM SHALL keep the two-query (inbound + outbound) +
  triage read shape in load.ts; the read architecture (Drizzle, in-memory
  assembly) is fixed. Do not reopen.

---

## R6 — Virtualization / route transitions (oceans — flag, do not force)

- R6.1 [HORS SCOPE] (OCEAN) List virtualization/windowing (render only the
  visible row window for very large lanes) is a structural rewrite of
  _conversation-list.tsx (measurement, scroll restoration, keyboard
  scrollIntoView at page.tsx:650, sticky bulk bar). With PAGE_SIZE=30 and
  Load-more, the rendered DOM is bounded; memoization (R1) covers the real
  cost. Flagged, not forced — revisit only if a measured lane exceeds ~150
  live rows in one viewport.

- R6.2 [HORS SCOPE] (OCEAN) App-Router route-transition streaming / RSC
  conversion of the inbox (page.tsx is a single use-client tree) is a
  rearchitecture, not a perf tweak. Deferred.

---

## R7 — Measurement & budget (the success criteria)

- R7.1 [NEW] THE SYSTEM SHALL prove R1.2 with an autonomously-runnable
  React Testing Library test that counts InboxRow render invocations and asserts
  that changing the selection re-renders at most 2 rows (old + new) on a list of
  >= 20 rows. (Measurable, no browser.)

- R7.2 [NEW] THE SYSTEM SHALL prove R4.1 with a unit test asserting
  buildConversations output is unchanged (snapshot of the relevant fields) before
  vs after the dedup, over a fixture with mixed labels.

- R7.3 [NEW] THE SYSTEM SHALL prove R2.1/R2.2 with a unit test of the
  load-generation/abort guard: a stale resolution after a newer load does not
  mutate the committed state. (Extract the guard into a pure helper so it is
  testable without mounting the page — see design.)

- R7.4 [HORS SCOPE] (founder-gated) Real-device interaction-latency budget
  (sub-100 ms interaction, Lighthouse or Performance-panel INP on the live app)
  requires the authed dev session + a browser and is a human-in-the-loop
  measurement (Playwright single-browser rule + idle-logout). Capture it as a
  founder verification step, NOT an autonomous gate.

---

## Non-goals (explicit)

- THE SYSTEM SHALL NOT introduce a virtualization/windowing library (R6.1).
- THE SYSTEM SHALL NOT convert the inbox to RSC/streaming (R6.2).
- THE SYSTEM SHALL NOT add a cross-request read-model cache (R4.4).
- THE SYSTEM SHALL NOT add a new dependency, provider, or DB migration.
- THE SYSTEM SHALL NOT change any inbox behaviour or visual output — F2 is
  perf-only; F1 owns feel, F3 owns states.
- THE SYSTEM SHALL NOT alter the prefetch TTL/heuristics (R3 is DONE) absent a
  measured miss.

---

End of requirements.md
