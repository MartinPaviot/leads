# F3 - inbox-states-coverage - Requirements

**Feature ID:** inbox-states-coverage
**Track:** F (Feel layer) - **Prio:** P1 - **Deps:** finish teardown (F1 shipped; B3 splits shipped; A3/A4 rail shipped)
**Source row:** _specs/inbox-overhaul/ROADMAP.md F3 - every screen empty/loading/skeleton/hover/error states plus the un-captured surfaces (compose-new, snooze picker, body folding, .ics cards).
**Gate:** G-design (F1 design.md section 8, esp. item 12 State coverage). G-eval: N/A (presentation-only, no AI bar).

## Goal (one sentence)

Give every inbox surface a complete, consistent set of loading / empty / error / hover states - a list skeleton shaped like InboxRow (not a bare spinner), an explicit error state with retry (not just a toast), per-surface empty states (splits, rail, search-no-results), and audited hover states - reusing the existing EmptyState and a shared row/line Skeleton, presentation-only, no migration.

## Ground-truth inventory (verified against live code 2026-06-20)

Per-surface state coverage - HAVE vs MISSING:

| Surface | Loading | Empty | Error | Hover | File:line (evidence) |
|---|---|---|---|---|---|
| Conversation list | TableSkeleton rows=8 cols=1 - bare bars, NOT InboxRow-shaped [NEW] | per-lane EMPTY_COPY via EmptyState [DONE] | none - catch only toasts the load error, keeps stale rows or shows empty [NEW] | row hover audited in F1 (checkbox reveal, accent-soft) [DONE] | page.tsx:178-179,982-983; _conversation-list.tsx:16-27,79-85; _inbox-row.tsx:56-62,76-78 |
| Reading pane | centered Loader2 spinner [DONE] | "Select a conversation to read it." (no selection) [DONE] | none - fetch error sets detail=null, then shows "no longer available", conflating failed-load with deleted-thread; no retry [NEW] | n/a | _conversation-pane.tsx:262-264,460-482 |
| Split tabs (B3) | none - strip absent until splitCounts arrives (flash/CLS) [NEW] | hidden when empty (acceptable) [CFG] | none - split-create failure toasts only [DONE-ok] | hover only on the + Split button; the chips themselves have no :hover [NEW] | page.tsx:875-878; _split-tabs.tsx:27-54,68-92 |
| Mailbox rail (A3/A4) | none - rail absent until mailboxes arrives [NEW] | n/a (only renders at 2+) [DONE] | none - uses last-good summaries [CFG] | RailRow JS mouseenter/leave bg swap [DONE] (audit: move to CSS) | page.tsx:901-907; _mailbox-rail.tsx:26-29,86-99 |
| Search | reuses list skeleton [NEW via list] | per-lane empty fires even with a query, so wrong copy; NO no-results-for-X state [NEW] | none [NEW via list] | clear-X hover [DONE] | page.tsx:144-148,850-870,982-1001; _conversation-list.tsx:79-85 |
| Composer | sending (Button loading), sent (Sent label) [DONE] | n/a | send error toasts [DONE] | Send/Save hover via Button [DONE] | email-composer-panel.tsx:214-216,407-447,854-878 |
| Snooze picker | n/a | NL parse feedback (could-not-read-that-time) [DONE]; outside-click/Esc dismiss [DONE] | n/a | preset rows hover:underline (audit: weak affordance) [NEW-audit] | _conversation-pane.tsx:130-158,635-690 |
| .ics EventCard | per-button pending spinner [DONE] | n/a (renders null when unparseable) [DONE] | inline error line [DONE]; inert buttons when not repliable [DONE] | RSVP buttons (audit: add hover bg) [NEW-audit] | _event-card.tsx:42-49,108-140 |
| Long-body fold | n/a | (no content) empty [DONE] | sanitizer failure to text fallback [DONE] | fold toggle hover bg-hover [DONE] | _email-body.tsx:85-167,170-177,219-246 |
| Bulk bar / catch-up / capture drawer | n/a | conditional render [DONE] | n/a | buttons hover:underline [DONE] | page.tsx:917-981 |

**Honest scope note:** the content surfaces the roadmap names (compose-new blank, snooze picker, body folding, .ics cards) are already built - the real F3 gap is the chrome of waiting and failing: a row-shaped list skeleton, a real error-with-retry for list AND pane, skeletons for the two strips (splits, rail) to kill layout shift, and a search-aware empty state. The autonomously-verifiable + unit-testable core is a pure state-decision helper (pickListState / pickPaneState) plus the shared row/line Skeleton primitives.

---

## R1 - Shared skeleton primitives (the reusable layer)

- **R1.1** [NEW] THE SYSTEM SHALL provide a shared inbox skeleton module (_skeleton.tsx) exporting InboxRowSkeleton and InboxListSkeleton, built only on the existing Skeleton primitive (components/ui/skeleton.tsx) and CSS tokens, with NO new color literal.
- **R1.2** [NEW] THE SYSTEM SHALL render InboxRowSkeleton with the same geometry as InboxRow: --inbox-row-height min-height, 14px horizontal padding, a 28px circle avatar placeholder, and two stacked line placeholders (sender/subject plus snippet) - so the skeleton occupies the exact row footprint and the list does not reflow when data lands.
- **R1.3** [NEW] THE SYSTEM SHALL render InboxListSkeleton as count (default 8) InboxRowSkeletons carrying the skeleton-row class so the existing staggered skeleton-fade-in (globals.css:445-459) animates them in.
- **R1.4** [NEW] WHERE a strip (split tabs, mailbox rail) is awaiting its first payload, THE SYSTEM SHALL render a fixed-height placeholder of the same height as the loaded strip, so first paint reserves the space and the list below never shifts (CLS = 0).
- **R1.5** [NEW] WHEN prefers-reduced-motion is set, THE SYSTEM SHALL suppress the skeleton shimmer/fade per the existing globals.css:433-443 reduced-motion guard and SHALL NOT add new motion.

## R2 - Pure state-decision helper (the testable core)

- **R2.1** [NEW] THE SYSTEM SHALL provide a pure helper pickListState({ loading, error, count, hasQuery }) returning exactly one of loading | error | empty | no-results | ready, with no React/DOM dependency.
- **R2.2** [NEW] WHEN loading is true AND no rows are yet shown, pickListState SHALL return loading.
- **R2.3** [NEW] IF error is set AND count is 0, THEN pickListState SHALL return error (a failed load never masquerades as an empty lane).
- **R2.4** [NEW] WHERE count is 0, loading is false, error is unset AND hasQuery is true, pickListState SHALL return no-results; WHERE hasQuery is false, it SHALL return empty.
- **R2.5** [NEW] WHERE count is greater than 0, pickListState SHALL return ready regardless of a background loading (load-more / refetch keeps showing rows, never blanks them).
- **R2.6** [NEW] THE SYSTEM SHALL provide a pure helper pickPaneState({ hasSelection, loading, error, hasDetail }) returning none | loading | error | missing | ready, distinguishing a fetch ERROR (error set) from a thread that loaded as absent (missing) - never collapsing both into one copy.
- **R2.7** [NEW] WHEN a pane fetch rejects, the helper SHALL return error (retryable); WHEN the fetch resolves with no detail, it SHALL return missing (no longer available).

## R3 - Conversation list states (wire the helper)

- **R3.1** [NEW] WHILE the list is in the loading state, THE SYSTEM SHALL render InboxListSkeleton (R1.3) in place of the current TableSkeleton rows=8 cols=1.
- **R3.2** [NEW] WHEN a lane/conversations fetch fails, THE SYSTEM SHALL set a list-error flag (in addition to the existing toast) so the list can render the error state, AND SHALL clear it on the next successful load.
- **R3.3** [NEW] WHILE the list is in the error state, THE SYSTEM SHALL render EmptyState variant=error (title Couldn-t-load-your-inbox, actionLabel=Retry) whose action re-runs the current lane load.
- **R3.4** [NEW] WHILE the list is in the no-results state, THE SYSTEM SHALL render EmptyState variant=no-filter-match with copy naming the query (e.g. No conversations match the query) and a Clear search action, INSTEAD of the per-lane Nothing-needs-your-attention copy.
- **R3.5** [DONE] WHILE the list is in the empty state (no query), THE SYSTEM SHALL keep the existing per-lane EMPTY_COPY EmptyState (_conversation-list.tsx:16-27,79-85).
- **R3.6** [NEW] WHILE the list is in the ready state AND a background refetch is in flight, THE SYSTEM SHALL keep the existing rows visible (no skeleton flash), consistent with R2.5.

## R4 - Reading pane states (split error from missing)

- **R4.1** [NEW] WHEN a pane detail fetch rejects, THE SYSTEM SHALL record a pane-error flag distinct from detail===null, so pickPaneState (R2.6) can resolve error vs missing.
- **R4.2** [NEW] WHILE the pane is in the error state, THE SYSTEM SHALL render an inline error block (Couldn-t-load-this-conversation) with a Retry affordance that re-fetches the same key.
- **R4.3** [DONE] WHILE the pane is in the loading state, THE SYSTEM SHALL keep the centered Loader2 spinner (_conversation-pane.tsx:470-481).
- **R4.4** [NEW] WHILE the pane is in the missing state, THE SYSTEM SHALL keep the This-conversation-is-no-longer-available copy but reach it ONLY when the fetch resolved without detail (not on a network error).
- **R4.5** [DONE] WHILE the pane is in the none state (no selection), THE SYSTEM SHALL keep Select-a-conversation-to-read-it (_conversation-pane.tsx:460-468).

## R5 - Strip skeletons (splits plus rail; kill layout shift)

- **R5.1** [NEW] WHILE split counts have not yet loaded AND the attention lane is active, THE SYSTEM SHALL render a fixed-height split-strip placeholder (R1.4) so the list below does not jump when the strip appears.
- **R5.2** [NEW] WHILE the mailbox list has not yet loaded AND the user has 2+ mailboxes (known once the first payload returns), THE SYSTEM SHALL reserve the rail width with a placeholder rather than rendering nothing then snapping in.
- **R5.3** [CFG] WHERE the user has fewer than 2 mailboxes, THE SYSTEM SHALL render neither a rail nor a rail placeholder (no chooser needed).

## R6 - Hover-state audit (consistency, not new affordances)

- **R6.1** [NEW] THE SYSTEM SHALL give every interactive chip in the inbox a hover state on var(--color-bg-hover) (or accent-soft when active) - auditing split chips (_split-tabs.tsx:68-92, currently none), lane chips, and the +New-lane / +Split buttons to a single pattern.
- **R6.2** [NEW] THE SYSTEM SHALL move the mailbox RailRow hover from imperative JS onMouseEnter/Leave background mutation (_mailbox-rail.tsx:86-99) to a CSS :hover (or group-hover) rule, so hover survives re-render and respects the token.
- **R6.3** [NEW] THE SYSTEM SHALL give the snooze-preset rows (_conversation-pane.tsx:675-687) and the .ics RSVP buttons (_event-card.tsx:115-132) a var(--color-bg-hover) background on hover, replacing the weak hover:underline-only affordance.
- **R6.4** [NEW] THE SYSTEM SHALL ensure every audited hover transition runs at 100-150ms ease and respects prefers-reduced-motion (G-design item 11; NG from F1).
- **R6.5** [DONE] THE SYSTEM SHALL keep the row hover/selection treatment from F1 (checkbox reveal via opacity, accent-soft plus inset rail; _inbox-row.tsx:56-83) unchanged.

## R7 - Un-captured content surfaces (confirm plus close any gap)

- **R7.1** [DONE] THE SYSTEM SHALL keep the compose-new / reply blank-composer path (a blank EmailComposerDraft opened when there is no draftable inbound; _conversation-pane.tsx:299-301).
- **R7.2** [DONE] THE SYSTEM SHALL keep the snooze picker affordance (NL input plus parse preview plus presets; _conversation-pane.tsx:635-690).
- **R7.3** [DONE] THE SYSTEM SHALL keep long-body fold/expand (foldQuotedReply/foldPlainTextReply plus show-trimmed toggle; _email-body.tsx:82-83,112-136,217-244).
- **R7.4** [DONE] THE SYSTEM SHALL keep the .ics EventCard with its pending/responded/error/cancelled/inert states (_event-card.tsx:42-140).
- **R7.5** [NEW] THE SYSTEM SHALL apply the R6 hover audit (R6.3) to R7.2 and R7.4 so these otherwise-complete surfaces match the consistency bar.

## R8 - G-design gate (item 12: state coverage)

- **R8.1** [NEW] THE SYSTEM SHALL record a per-surface G-design pass for item 12 (State coverage) in tasks.md: every list/pane/strip has a loading skeleton, an empty state, an error state where it can fail, and an audited hover state.
- **R8.2** [NEW] THE SYSTEM SHALL embed the full F1 section-8 G-design 12-item checklist in design.md and score it 12/12 at eval (ROADMAP Cross-cutting GATES - no UI ships without it).

## Non-goals

- **NG-1** THE SYSTEM SHALL NOT change any data fetch, route, schema, or migration - F3 is presentation-only (reuse-first).
- **NG-2** THE SYSTEM SHALL NOT add a new component library, animation library, or color/font/icon - skeletons reuse Skeleton, empties reuse EmptyState, icons stay lucide-react.
- **NG-3** THE SYSTEM SHALL NOT re-spec already-shipped states: per-lane empties (R3.5), pane spinner (R4.3), composer sending/sent (R7), snooze NL parse, .ics states, long-body fold - these are [DONE].
- **NG-4** THE SYSTEM SHALL NOT add motion beyond the existing 100-150ms ease plus reduced-motion guard, nor a second skeleton animation.
- **NG-5** THE SYSTEM SHALL NOT introduce per-row hover quick-action buttons (that is F1 R2.9, tracked there) - F3 only audits hover consistency.
