# INBOX-R11 — Large-email & long-thread virtualization (perf)
> Theme: T1 · Autonomy rung: passive · Priority: P1
> Pillar: P1 fidelity

## User story
As a user opening a huge email or a 50-message thread, I want it to render instantly and scroll
smoothly without freezing the tab, so big newsletters and long deal threads are as fast as short ones.

## Why (audit anchor)
Speed is cross-cutting in the audit (Superhuman's whole thesis is "the fastest inbox"; INBOX-R01's
own acceptance includes "a 2 MB HTML email renders without freezing the pane"). Real HTML bodies
(INBOX-R01) and long threads are heavy: a marketing email can be megabytes of nested tables, and a
deal thread can be dozens of messages each with quoted history (mitigated by R05 folding, but still
many DOM nodes). We already have a virtualization primitive — `components/ui/virtual-table.tsx`
(`@tanstack/react-virtual`) — so we don't add a new dependency; we apply windowing to the thread and
guard oversized single bodies.

## Requirements (EARS)
- WHEN a thread has many messages, the system SHALL virtualize the message list (render only on-screen
  messages + a buffer), keeping scroll smooth.
- WHEN a single email body exceeds a size threshold, the system SHALL render it progressively (chunked/
  lazy) so the pane stays responsive while the rest streams in.
- The system SHALL lazy-load below-the-fold images (INBOX-R02) and defer attachment previews (INBOX-R04)
  until visible.
- The system SHALL keep folded messages (INBOX-R05) cheap — a folded message is a one-line header, not a
  mounted full body, until expanded.
- The system SHALL cap the conversation-list query at a bounded size (it already caps inbound at 500 —
  `load.ts`) and paginate/virtualize the list rather than rendering thousands of rows.
- The system SHALL preserve correct scroll position when messages expand/collapse or images load
  (no jump).
- The system SHALL degrade gracefully on the server/no-JS path (the body still exists; virtualization is a
  client enhancement).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a 60-message thread WHEN opened THEN it appears instantly and scrolls at 60fps (only visible
  messages mounted).
- GIVEN a 2 MB HTML email WHEN opened THEN the pane is interactive within a frame budget and finishes
  rendering progressively (no long task that freezes input).
- GIVEN a thread with 40 inline images WHEN scrolled THEN images load as they enter the viewport, not all at once.
- GIVEN folded older messages WHEN the thread opens THEN their full bodies are NOT in the DOM until expanded.
- GIVEN a conversation list of 500 rows WHEN scrolled THEN the list windows (smooth), not all 500 mounted.
- GIVEN expanding a folded message mid-scroll WHEN it grows THEN the scroll anchor holds (no content jump).

## Edge cases & failure handling
- Pathologically large single body (10 MB) → capped at capture (INBOX-R13 truncation marker) + progressive
  render; show a "message truncated — download original" affordance if needed.
- Rapid scroll → recycling must not flash blank; keep an overscan buffer.
- Measurement of variable-height messages (HTML bodies vary wildly) → dynamic measurement (the
  virtual-table primitive supports variable sizes).
- Print / "expand all" → a path that mounts everything for printing/export, accepting the cost deliberately.
- Reduced-motion / low-power devices → smaller buffers, still correct.
- Multi-tenant: no change to scoping; purely client rendering.

## Best-in-class bar
- We reuse our **existing virtualization primitive** (`@tanstack/react-virtual` via virtual-table) for the
  thread, so perf is consistent with the rest of the app and adds no new dependency — and folding (R05)
  means long deal threads stay light by construction.
- Progressive body render + viewport-lazy images keep even multi-megabyte marketing mail interactive — the
  "2 MB renders without freezing" bar from INBOX-R01 is met structurally, not by luck.

## Design sketch
- **Data:** none new; INBOX-R13's stored-HTML size cap bounds the worst case.
- **API:** the list already caps at 500 inbound (`lib/inbox/load.ts`); add real pagination later if needed
  (out of scope here).
- **AI:** none.
- **UI:** apply windowing to the message map in `_conversation-pane.tsx:445-475` using the
  `@tanstack/react-virtual` pattern from `components/ui/virtual-table.tsx`; lazy-mount full bodies on
  expand (R05); `loading="lazy"` + IntersectionObserver for images (R02) and attachment previews (R04).
  Conversation list (`_conversation-list.tsx`) virtualized similarly. Tokens unchanged (perf, not visual);
  scroll containers keep `--color-bg-page`/`--color-bg-card`. No new shortcut (existing j/k nav, INBOX-K06).
  Light+dark via tokens, no emoji, no provider name, cited.
- **Perf:** dynamic-height measurement; overscan buffer; progressive `requestIdleCallback`/chunked body mount.

## Tasks (ordered)
1. Virtualize the thread message map (reuse `virtual-table` pattern), dynamic heights + overscan. (verify:
   60-msg thread mounts only visible) (test: render/window unit)
2. Lazy-mount folded bodies on expand (integrate R05). (verify: folded bodies absent from DOM) (test: render)
3. Viewport-lazy images + deferred attachment previews. (verify: images load on scroll) (test: lazy unit)
4. Progressive render guard for oversized single bodies + truncation affordance. (verify: 2 MB email stays
   interactive) (test: perf smoke)

## Current-state notes (VERIFY before building)
- `components/ui/virtual-table.tsx` uses `@tanstack/react-virtual` (`useVirtualizer`, `:4,52`) — REUSE this
  primitive; the dependency is already in `app/apps/web/package.json`.
- The message map at `_conversation-pane.tsx:445-475` renders ALL messages unconditionally today; the list
  caps inbound at 500 in `lib/inbox/load.ts` but `_conversation-list.tsx` renders them un-windowed.
- Bodies are short plain text today, so perf only bites once INBOX-R01 (HTML) + R04 (attachments) land —
  this spec depends on R01/R02/R04/R05/R13.
