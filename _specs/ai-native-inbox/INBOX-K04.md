# INBOX-K04 — Instant navigation / prefetch
> Theme: T6 · Autonomy rung: passive · Priority: P1
> Pillar: cross (speed/keyboard-first)

## User story
As a user moving through my inbox and the app, I want pages and conversations to be already loading
before I arrive — prefetched on hover/focus, with an immediate progress cue — so navigation feels
instant rather than a blank wait.

## Why (audit anchor)
Superhuman's "zero-latency feel" extends past actions to movement: switching splits, opening threads,
and auto-advancing after triage all feel immediate (findings §B, §G). The product never shows a cold
spinner on a thread you were about to open. We already start a top progress bar the moment a link is
clicked (`navigation-progress.tsx` intercepts clicks pre-navigation), but we do **no prefetch**: the
string "prefetch" appears nowhere in the web app, and the conversation pane fetches detail only AFTER
selection changes (`_conversation-pane.tsx:113`). K04 prefetches the likely-next target so the data
is warm on arrival.

## Requirements (EARS)
- The system SHALL prefetch a conversation's detail (`/api/inbox/conversations/detail?key=…`) when the
  user hovers or keyboard-focuses its list row, so opening it is instant.
- WHEN a thread is selected, the system SHALL prefetch the detail of the NEXT row (the row `j` would
  land on), so sequential reading and post-triage auto-advance are warm.
- The system SHALL cache prefetched detail briefly (per-key, short TTL) and serve it on selection
  without a second request, revalidating in the background if stale.
- The system SHALL keep route-level prefetch for sidebar/nav links (Next.js `<Link>` default
  prefetch) and SHALL NOT disable it.
- The system SHALL start the existing top progress bar on intra-app navigation (already wired) and
  complete it when the route resolves.
- The system SHALL bound prefetch work: at most a small number of in-flight prefetches, abortable, and
  never prefetch on touch/coarse pointers where hover is meaningless.
- The system SHALL respect per-user/tenant scope on every prefetch (same scoped endpoints) and SHALL
  NOT prefetch records the user can't open.
- WHEN data-saver / reduced-data conditions are signaled, the system SHOULD skip speculative prefetch.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN the inbox list WHEN the user hovers a row for ~150 ms THEN that thread's detail is fetched and
  cached, and clicking it renders the body with no loading spinner.
- GIVEN a selected thread WHEN it renders THEN the next row's detail is prefetched, so pressing `j`
  then reading shows the body instantly.
- GIVEN the user presses `e` (done) WHEN selection auto-advances to the next row THEN that row's pane
  renders from the prefetch cache, not a cold fetch.
- GIVEN a sidebar link WHEN hovered THEN the route is prefetched (Next default) and the progress bar
  starts on click, giving an immediate cue.
- GIVEN a coarse-pointer device WHEN browsing THEN no hover-prefetch fires (no wasted requests).
- GIVEN a prefetched detail older than its TTL WHEN opened THEN the cached copy shows immediately and
  a background revalidation updates it if changed.

## Edge cases & failure handling
- Prefetch fails or aborts → silent; the normal on-select fetch still runs as the fallback (no user
  visible error).
- Rapid hover across many rows → debounce + cap concurrency + abort superseded prefetches
  (AbortController), so we don't flood the API.
- Thread archived between prefetch and open → cached detail may be stale; on open, the pane's own
  fetch reconciles and shows the empty/"no longer available" state if needed.
- Prefetch cache memory growth → small LRU keyed by conversationKey; evict oldest.
- Offline → prefetch no-ops; navigation falls back to live fetch.
- Cross-tenant safety: prefetch only keys present in the user's own scoped list (they already are).

## Best-in-class bar
- We get Superhuman's "the thread is already open" feel using **standard web primitives** (hover/focus
  prefetch + a tiny client cache + Next route prefetch) — no proprietary client, and it degrades
  gracefully on slow/coarse devices.
- Prefetch is **scope-safe and cited**: we only warm endpoints the user may read, so speculative
  loading never leaks another tenant's data — a correctness property generic prefetchers ignore.
- It composes with K03 optimism: after a `done`, the auto-advanced thread is both selected
  optimistically AND already loaded, so the next read is truly instant.

## Design sketch
- **Data:** none new; a client-side in-memory cache `Map<conversationKey, {detail, at}>`.
- **API:** reuse `GET /api/inbox/conversations/detail` (`_conversation-pane.tsx:113`) for thread
  prefetch; rely on Next.js `<Link>` prefetch for routes (sidebar `Link`s already use it). No new
  endpoints.
- **UI:** add `onMouseEnter`/`onFocus` prefetch to rows in
  `app/(dashboard)/inbox/_conversation-list.tsx` (the `<button data-conversation-key>` at `:75`); have
  `_conversation-pane.tsx` read the cache before fetching, and trigger a next-row prefetch from the
  page when `selectedKey`/`conversations` change (`page.tsx`). No new visible chrome beyond the
  existing progress bar (`navigation-progress.tsx`), which already uses `--color-accent`. Light + dark
  via tokens, no emoji, no provider name (no new surface).
- **AI:** none.
- **Security:** scoped endpoints only; never prefetch outside the user's list.
- **Failure/perf:** debounce 120-150 ms on hover; cap ~3 concurrent; abort superseded; short TTL
  (~30 s) with background revalidate; skip on `pointer: coarse` / Save-Data.

## Tasks (ordered, each with verify + test)
1. Add a small inbox detail cache + `prefetchDetail(key)` helper (dedupe, abortable, LRU). (verify:
   second open of a prefetched key makes no network call) (test: `inbox-prefetch.test.ts` — cache
   hit, dedupe, eviction)
2. Hover/focus prefetch on list rows (`_conversation-list.tsx`), guarded by pointer-fineness. (verify:
   hovering a row warms its detail; coarse pointer skips) (test: hover triggers prefetch, coarse
   skips)
3. Next-row prefetch when selection changes (`page.tsx`). (verify: after select, `j`+read is instant)
   (test: next-row key prefetched on selection change)
4. Pane reads cache first, revalidates if stale (`_conversation-pane.tsx:113`). (verify: cached open
   shows no spinner; stale revalidates) (test: cache-first then background refresh)
5. Confirm sidebar/nav `<Link>` prefetch is on and the progress bar fires on click. (verify: hover a
   nav link prefetches; click shows the bar) (test: nav click starts progress)

## Current-state notes (VERIFY before building — code moves)
- **No prefetch anywhere**: a repo search for "prefetch" in `app/apps/web/src` returns nothing —
  conversation detail is fetched only after `selectedKey` changes (`_conversation-pane.tsx:102-127`).
- The top progress bar EXISTS and already fires pre-navigation by intercepting link clicks
  (`app/apps/web/src/components/ui/navigation-progress.tsx:43-58`), mounted in
  `app/(dashboard)/layout.tsx:84`. Reuse it; don't rebuild.
- Sidebar nav uses Next `<Link>` (`components/sidebar.tsx:419`), which prefetches routes by default in
  production — keep enabled.
- List rows are buttons with `data-conversation-key` (`_conversation-list.tsx:75-84`) — the hook point
  for hover prefetch. Selection + auto-advance logic is in `page.tsx:119-179`.
