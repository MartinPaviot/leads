# F3 - inbox-states-coverage - Tasks

**Total estimate:** ~3.5 dev-days (7 half-day units). 9 tasks. Presentation-only, no migration.
Order: pure core first (B1-B2, fully unit-testable), then wire surfaces (B3-B6), then hover sweep (B7), then the gate (B8-B9).
Each task: ID - [tag] - action - verify - test - req refs.

---

## B1 - [NEW] Pure list/pane state-decision helper (0.5d)

**Action:** Add lib/inbox/list-state.ts exporting pickListState + pickPaneState + their ListState/PaneState union types, exactly as design.md section 5 (no React/DOM import).
**Verify:** import in a node REPL / vitest; pickListState({loading:false,error:true,count:0,hasQuery:false}) === "error"; pickListState({loading:true,error:false,count:3,hasQuery:false}) === "ready"; pickPaneState({hasSelection:true,loading:false,error:true,hasDetail:false}) === "error".
**Test:** lib/inbox/__tests__/list-state.test.ts - table-driven: loading-with-no-rows=>loading; error+count0=>error; count0+query=>no-results; count0+noquery=>empty; count>0+loading=>ready (R2.5 ordering); pane none/loading/error/missing/ready incl. error-vs-missing split.
**Reqs:** R2.1-R2.7.

## B2 - [NEW] Shared inbox skeleton module (0.5d)

**Action:** Add _skeleton.tsx with InboxRowSkeleton (28px circle + 2 stacked lines, --inbox-row-height, px-3.5, skeleton-row class), InboxListSkeleton({count=8}), SplitStripSkeleton (fixed height ~= loaded strip), RailSkeleton (212px width). Skeleton + tokens only.
**Verify:** render InboxListSkeleton in vitest happy-dom; assert 8 .skeleton-row nodes, each with minHeight var(--inbox-row-height); grep the file for # / rgb( / rgba( returns zero color literals.
**Test:** __tests__/skeleton.test.tsx (Testing Library) - InboxListSkeleton renders count rows; InboxRowSkeleton has a rounded-full avatar placeholder; no raw color literal (string scan).
**Reqs:** R1.1-R1.5.

## B3 - [NEW] Wire the conversation list states (0.5d)

**Action:** In page.tsx add listError state (set in the loadLane catch at :178-179 next to the toast; cleared on success at :177 and at the start of each load). Compute state via pickListState; replace the :982-1001 ternary: loading=>InboxListSkeleton, error=>EmptyState variant=error (Retry => loadLane(customLaneId ?? tab,1,false)), else ConversationList. Pass hasQuery + onClearSearch down.
**Verify:** Playwright with the conversations route stubbed 500 => the list shows the error EmptyState + Retry (not stale rows, not the lane empty); Retry re-requests and recovers on 200. Throttle the route => InboxListSkeleton (row-shaped) shows, then rows replace it with no layout jump.
**Test:** covered by B1 (decision) + a page-level Playwright in B9; add a render test that error flag => EmptyState role=alert present.
**Reqs:** R3.1, R3.2, R3.3, R3.6.

## B4 - [NEW] Search-aware list empty (no-results) (0.25d)

**Action:** In _conversation-list.tsx accept hasQuery + onClearSearch; in the count===0 branch (:79-85) render EmptyState variant=no-filter-match naming the query (No conversations match the current search) with a Clear search action when hasQuery, else keep the per-lane EMPTY_COPY empty.
**Verify:** Playwright - type a junk query => the no-results EmptyState with the query echoed + Clear search; clearing restores the lane; on an actually-empty lane with no query the original per-lane copy still shows.
**Test:** __tests__/conversation-list.empty.test.tsx - hasQuery=true+count0 => SearchX/no-filter-match copy + onClearSearch fires; hasQuery=false+count0 => per-lane title.
**Reqs:** R3.4, R3.5.

## B5 - [NEW] Reading-pane error vs missing (0.5d)

**Action:** In _conversation-pane.tsx add paneError state; set it in the detail catch (:262-264) and stop inferring failure from detail===null; clear on key change (:239) and on success. Replace the :460-482 render with pickPaneState: none/loading/missing keep existing copy; error => inline block (Couldn-t-load-this-conversation) + Retry that re-fetches conversationKey.
**Verify:** Playwright - stub the detail route 500 => inline error + Retry (NOT no-longer-available); Retry on 200 renders the thread. Stub a 200 with empty/null detail => the no-longer-available copy (missing path).
**Test:** covered by B1 pickPaneState; add a pane render test that paneError=true => Retry button present and missing-copy absent.
**Reqs:** R4.1, R4.2, R4.3, R4.4, R4.5.

## B6 - [NEW] Strip skeletons (splits + rail) (0.25d)

**Action:** In page.tsx render SplitStripSkeleton on the attention lane while split counts are unknown (before the :875-878 SplitTabs), and RailSkeleton while mailboxes is empty but the user is known multi-box (before the :901-907 MailboxRail). Remove the flash by reserving height/width.
**Verify:** Playwright with throttled conversations route - record CLS over first paint to data-arrival; assert the list top does not shift when the split strip / rail appears (CLS ~= 0 for those regions).
**Test:** __tests__/skeleton.test.tsx - SplitStripSkeleton height and RailSkeleton width match the loaded components constants.
**Reqs:** R5.1, R5.2, R5.3.

## B7 - [NEW] Hover-state audit sweep (0.5d)

**Action:** Add hover bg-hover to SplitChip inactive (_split-tabs.tsx:68-92); convert RailRow JS onMouseEnter/Leave to CSS group-hover (_mailbox-rail.tsx:86-99); add hover bg-hover to snooze presets (_conversation-pane.tsx:675-687) and RSVP buttons (_event-card.tsx:115-132). All transitions 100-150ms, reduced-motion-safe; tokens only.
**Verify:** Playwright hover each surface - computed background changes to var(--color-bg-hover) on hover and reverts on leave (rail hover survives a re-render); grep the four files for onMouseEnter/onMouseLeave background assignment returns none left in the rail.
**Test:** tokens.contract.test.ts (F1) extended/asserted green over the four touched files; a string scan that _mailbox-rail.tsx no longer mutates style.background imperatively.
**Reqs:** R6.1, R6.2, R6.3, R6.4, R6.5, R7.5.

## B8 - [DONE-confirm] Un-captured content surfaces audit (0.25d)

**Action:** Verify (do NOT rebuild) compose-new blank composer, snooze NL picker, long-body fold, .ics EventCard already carry full states (requirements R7.1-R7.4); record their file:line in the matrix. The only code change here is the hover sweep already done in B7.
**Verify:** Playwright walk - open a thread with no draftable inbound (blank composer opens), a long quoted thread (fold toggle works), an .ics invite (RSVP pending/done/error/inert), the snooze popover (NL parse preview + presets). Screenshot each; confirm no missing state.
**Test:** none new (these surfaces have shipped tests); add their paths to the coverage matrix assertion in B9.
**Reqs:** R7.1, R7.2, R7.3, R7.4.

## B9 - [NEW] G-design item-12 gate + coverage matrix (0.25d)

**Action:** Run the F1 section-8 12-item G-design checklist against the inbox post-F3; record one-line PASS/FAIL per item, and attach the per-surface state-coverage matrix (every surface: skeleton / empty / error / hover all present or N/A-with-reason).
**Verify:** /design-review on the live inbox: throttle + 500-stub the conversations and detail routes; capture loading (row skeleton), error (EmptyState + Retry for list; inline + Retry for pane), no-results, empty, strip skeletons; confirm 12/12. tokens.contract.test.ts green; pnpm test green; pnpm tsc + pnpm lint clean.
**Test:** the suite from B1-B7 + tokens.contract.test.ts constitute the machine-checkable gate; the Playwright design-review run is the manual half.
**Reqs:** R8.1, R8.2.

---

## Per-surface state-coverage matrix (target after F3)

| Surface | Loading | Empty | Error | Hover | Owning task |
|---|---|---|---|---|---|
| Conversation list | InboxListSkeleton (row-shaped) [B3] | per-lane + no-results [B4] | EmptyState error + Retry [B3] | F1 row hover [DONE] | B3,B4 |
| Reading pane | Loader2 [DONE] | none-selection [DONE] | inline + Retry, split from missing [B5] | n/a | B5 |
| Split strip | SplitStripSkeleton [B6] | hidden when empty [CFG] | create-fail toast [DONE] | chip hover [B7] | B6,B7 |
| Mailbox rail | RailSkeleton [B6] | 2+-only [DONE] | last-good [CFG] | CSS group-hover [B7] | B6,B7 |
| Search | list skeleton [B3] | no-results [B4] | list error [B3] | clear-X [DONE] | B3,B4 |
| Composer | sending/sent [DONE] | n/a | send-error toast [DONE] | Button [DONE] | B8 |
| Snooze picker | n/a | parse preview [DONE] | n/a | preset hover [B7] | B7,B8 |
| .ics EventCard | pending spinner [DONE] | null-render [DONE] | inline error [DONE] | RSVP hover [B7] | B7,B8 |
| Long-body fold | n/a | (no content) [DONE] | text fallback [DONE] | toggle hover [DONE] | B8 |

## Dependencies / sequencing

B1 + B2 have no deps (pure + presentational) - do first, they carry the unit tests.
B3 needs B1+B2. B4 needs B3. B5 needs B1. B6 needs B2. B7 is independent (can run any time). B8 confirms. B9 is last (the gate).

## Definition of done (software, separate from any OKR)

- pickListState/pickPaneState + skeleton tests green (100% of the new pure surface).
- List shows a row-shaped skeleton, an error EmptyState with a working Retry, and a search-aware no-results - verified live under a stubbed 500/throttle.
- Pane distinguishes error (Retry) from missing - verified live.
- Split + rail strips reserve space (CLS ~= 0) - verified live.
- Hover audited on chips, rail, snooze presets, RSVP buttons; no JS-mutated background left in the rail.
- tokens.contract.test.ts, pnpm test, pnpm tsc, pnpm lint all green; G-design 12/12.
