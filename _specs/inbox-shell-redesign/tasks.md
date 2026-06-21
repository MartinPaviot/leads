# Inbox Shell Redesign — Tasks

Total estimate: ~9.0 dev-days (18 half-days). Ordered VISUAL-FIRST: the IA/visual
slice (V1-V7, all frontend, reuse existing routes) ships and demos first; backend
folders (B1-B4) follow, each gated so its sidebar entry stays hidden until its
backend lands (NG5). Each task: ID, tag, action, verify, test, refs.

Estimate legend: 1 unit = half a dev-day.

## Phase V — Visual / IA layer (no backend; reuse existing routes)

### V1 [NEW] Reorder + restyle the sidebar to Upstream order   (2 units)
- Action: in _inbox-folders.tsx render order Inbox, Needs Reply, Follow Ups, divider,
  Snoozed, Sent (=outbound), All Mail; promote the needs_reply/follow_ups splits to
  top-tier rows (out of the Splits group); move done/handled into a collapsed More
  section. Leave Starred/Drafts/Scheduled OUT (B-phase adds them).
- Verify: load /inbox; sidebar top-to-bottom matches Upstream order; counts still live;
  selecting Needs Reply sets split=needs_reply (network tab shows split= on the GET).
- Test: _inbox-folders.test.tsx — renders the folders in the documented order and emits
  onSelectSplit(needs_reply) when the Needs Reply row is clicked.
- Refs: R1.1, R1.2, R1.3, R1.6, NG4.

### V2 [NEW] SplitStrip component (second nav axis)             (2 units)
- Action: new _split-strip.tsx — a horizontal tab band Primary, Needs Reply (n),
  Follow Ups, Promotions (n), Social, custom splits, Noise (n); small colored icon +
  count chip each; active tab from activeSplit; onSelect calls setActiveSplit; mount in
  page.tsx above the list outlet.
- Verify: strip shows all built-in + custom splits with counts matching the sidebar;
  clicking Promotions filters the list (GET split=promotions) and highlights the tab.
- Test: _split-strip.test.tsx — renders one chip per split with its count; click emits
  onSelect(id); active styling tracks the activeSplit prop.
- Refs: R1.4, R1.5, R1.6.

### V3 [NEW] Primary split + Noise tab wiring                   (1 unit)
- Action: relabel the built-in other split to Primary and order it first
  (splits.ts BUILT_IN_SPLITS:34-40); expose noise as a selectable split id (route +
  splits.ts) so split=noise filters c.noise; add the Noise count to the splits payload.
- Verify: Primary appears first with the residual count; Noise tab shows noiseCount and
  filters to noise rows on click.
- Test: splits.test.ts — Primary is first and is the fallthrough bucket; a route test
  asserts split=noise returns only c.noise rows and the noise count is present.
- Refs: R8.2, R8.3.

### V4 [NEW] Top full-width search bar (InboxTopbar)            (1 unit)
- Action: new _inbox-topbar.tsx — full-width search input bound to the existing
  search/setSearch (page.tsx:113), plus an Upgrade-to-Pro pill (visual stub) + avatar
  at the right; remove the search input from inside _inbox-folders.tsx (R1.7).
- Verify: typing in the top bar debounces and issues GET ?q=; the sidebar no longer
  hosts a search field; clearing restores the lane.
- Test: _inbox-topbar.test.tsx — typing calls onSearch (debounced) and the clear button
  empties it; Upgrade pill renders.
- Refs: R4.1, R4.2, R4.3, R1.7.

### V5 [NEW] Full-width list mode (drop the w-[380px] narrowing)  (1 unit)
- Action: in page.tsx make the list render full-width whenever no thread is open;
  remove the selectedKey ? w-[380px] : flex-1 split (page.tsx:886); split selection
  into focusedKey (j/k highlight) vs openKey (full-screen).
- Verify: with no thread open the list spans the full content width; j/k still move the
  highlighted row without opening a pane.
- Test: page/list-layout test — when openKey is null the list container has no fixed
  width class; j/k advances focusedKey without setting openKey.
- Refs: R2.1, R2.6.

### V6 [NEW] Full-screen thread route (replace master-detail)   (3 units)
- Action: open a thread full-screen via thread=<key> on /inbox (history.pushState);
  render ConversationList xor ThreadView in the outlet (page.tsx:875-1015); reparent
  ConversationPane into a new ThreadView wrapper; Enter promotes focusedKey to openKey,
  Esc/back clears it and restores list scroll position; consume thread= on load like
  the existing conversation= deep-link (page.tsx:135-141).
- Verify: clicking a row replaces the list with the full-screen thread and sets
  thread=<key> in the URL; browser Back returns to the full-width list at the same
  scroll spot; refresh on a thread= URL reopens that thread.
- Test: thread-route test — selecting a row sets openKey + pushes thread=; Esc/back
  clears openKey; a thread= initial URL opens that thread.
- Refs: R2.2, R2.3, R2.4, R2.5, R2.6.

### V7 [NEW] Thread top toolbar + row hover quick-actions       (2 units)
- Action: new _thread-toolbar.tsx (back, archive=done, trash, more; right:
  add-channel/comment) wrapping the existing pane actions/onTriage; add far-right
  hover quick-actions (archive/snooze/done) to _inbox-row.tsx alongside the existing
  far-left hover checkbox.
- Verify: the open thread shows a top toolbar whose back returns to the list and whose
  archive marks done; hovering a list row reveals right-side quick actions that triage
  without opening the thread.
- Test: _thread-toolbar.test.tsx (back calls onClose, archive calls onTriage done);
  _inbox-row.test.tsx (hover quick-actions call onTriage with the row key).
- Refs: R2.4, R3.5, R9.1, R9.2.

## Phase B — Backend folders (each gated; folder hidden until backend lands, NG5)

### B1 [NEW] All Mail folder (lane=all pass-through)            (1 unit)
- Action: in conversations/route.ts accept lane=all and skip the per-lane predicate
  (route.ts:150) while keeping the user scope (route.ts:38); add an All Mail folder row
  to the sidebar + a total count.
- Verify: All Mail lists conversations from every lane for the signed-in user only
  (another user mail never appears); the count equals the sum of lane counts.
- Test: conversations.route.test.ts — lane=all returns rows across lanes, still scoped
  to the caller mailbox set.
- Refs: R8.1, NG-scope.

### B2 [NEW-backend] Starred: column + star route + folder      (2 units)
- Action: ALTER inbox_triage ADD starred_at (design.md section 4); apply on the dev DB
  via db:push then the custom runner (migrations break at 0012 — see CLAUDE.md); add
  POST /api/inbox/star; return starred + starredCount from the conversations route;
  render the Starred sidebar folder + a row/thread star toggle. Folder is shown ONLY
  once the column + route exist.
- Verify: starring a conversation persists across reload; the Starred folder lists it
  across lanes with a live count; unstar removes it.
- Test: star.route.test.ts (upsert/remove starred_at, tenant+user scoped); a UI test
  for the row toggle + Starred folder filter.
- Refs: R5.1, R5.2, R5.3, R5.4.

### B3 [NEW-backend] Drafts folder (list route + folder)        (1.5 units)
- Action: GET /api/inbox/drafts returning the user own outbound_emails status=draft,
  unsent, newest first; render the Drafts sidebar folder + count; opening a draft
  re-enters the composer with the draft body (reuse openReply / the consume path).
- Verify: a saved AI draft appears in Drafts with its subject/snippet; opening it loads
  the body in the composer; sending it consumes the draft and drops it from the folder.
- Test: drafts.route.test.ts (returns only the caller unsent draft rows); a UI test that
  the folder count matches and opening routes to the composer.
- Refs: R6.1, R6.2, R6.3, R6.4.

### B4 [NEW-backend] Scheduled folder (gated on release worker)  (1.5 units)
- Action: FIRST confirm the held->queued release cron is live on the target env
  (design.md section 6); if not, leave R7 [OMIT] and stop. If live: GET
  /api/inbox/scheduled returning status=held rows with holdUntil in the future + send
  time; render the Scheduled folder + count + cancel/reschedule.
- Verify: a send-later message appears in Scheduled with its send time; cancel returns
  it to drafts/removes it; the worker actually releases it at holdUntil.
- Test: scheduled.route.test.ts (returns only the caller future held rows); a worker
  smoke check that a held row past holdUntil flips to queued.
- Refs: R7.1, R7.2, R7.3, R7.4.

## Phase O — Optional polish

### O1 [NEW-backend] Per-conversation unread dot (derived first)  (1 unit)
- Action: expose a derived unread (lastInboundAt > lastSeen) from the conversations
  route; render the left blue dot on unread rows (_inbox-row.tsx), distinct from the
  attention priority dot. Promote to a real read marker only if the derived signal is
  too coarse.
- Verify: a freshly arrived inbound shows the blue unread dot; opening it clears the dot
  on next load.
- Test: row-unread test (unread flag -> blue dot; read -> no dot).
- Refs: R3.2, R3.3.

## Sequencing notes

- V1->V7 are independent of any backend and form the demo-able first cut; ship + eval
  them before B-phase.
- The sidebar (V1) renders Starred/Drafts/Scheduled ONLY when B2/B3/B4 land (NG5); they
  are simply absent in the visual slice.
- B4 may resolve to [OMIT] if the release worker is not live — that is an acceptable
  faithful-as-possible outcome, recorded, not faked.
