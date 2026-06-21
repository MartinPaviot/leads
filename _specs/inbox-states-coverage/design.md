# F3 - inbox-states-coverage - Design

**Approach:** reuse-first, presentation-only. Two pure helpers decide WHICH state each surface shows; one shared skeleton module supplies the row/strip placeholders; the surfaces import both and wire the already-existing EmptyState. No route, schema, fetch-shape, or migration changes.

## 1. Architecture diff vs existing

Already there (reuse, do not rebuild):
- EmptyState with first-use / no-filter-match / error / loading / no-permission variants - components/ui/empty-state.tsx:23-127. error => AlertCircle + alert role; no-filter-match => SearchX + Clear-filters. We supply title/description/actionLabel.
- Skeleton primitive + .skeleton shimmer + .skeleton-row staggered fade - components/ui/skeleton.tsx:1-8; globals.css:420-459. TableSkeleton/CardSkeleton/etc. exist but are table-shaped, not inbox-row-shaped.
- Per-lane list empties (EMPTY_COPY + LANE_ICON) - _conversation-list.tsx:16-34,79-85. KEEP as the no-query empty.
- Pane spinner + no-selection + missing copy - _conversation-pane.tsx:460-482. KEEP spinner; SPLIT missing from error.
- Composer sending/sent/error, .ics card states, long-body fold, snooze NL parse - all [DONE] (see requirements R7); F3 only audits their hover.

Added by F3 (new, small, presentation-only):
- _skeleton.tsx - InboxRowSkeleton + InboxListSkeleton + SplitStripSkeleton + RailSkeleton (all on Skeleton + tokens).
- lib/inbox/list-state.ts - pure pickListState + pickPaneState (no React import) + their string-literal union types.
- A list-error + pane-error boolean flag threaded through page.tsx / _conversation-list.tsx / _conversation-pane.tsx so a failed fetch is distinguishable from an empty/missing one.
- A search-aware EmptyState branch (no-results) chosen by pickListState.
- Hover-token sweep across _split-tabs.tsx, _mailbox-rail.tsx, the snooze presets and the RSVP buttons.

## 2. Data model diff

None. F3 touches no Drizzle schema, no migration, no API route. (Confirms requirements NG-1.)

## 3. Orchestration (Inngest)

None. No background job, no new trigger.

## 4. Integrations (vs the locked stack)

None added. Pure React/Tailwind 4 + the existing token set; icons stay lucide-react (AlertCircle/SearchX already imported by EmptyState; RefreshCw already imported elsewhere). No new dependency.

## 5. The pure state-decision core (lib/inbox/list-state.ts)

The whole "which state" decision lives in two pure functions so it is unit-testable without a DOM and cannot drift between surfaces.

```ts
export type ListState = "loading" | "error" | "empty" | "no-results" | "ready";

export function pickListState(i: {
  loading: boolean;     // a foreground (non-append) load is in flight
  error: boolean;       // the last load rejected and no rows are shown
  count: number;        // conversations.length currently rendered
  hasQuery: boolean;    // debouncedSearch is non-empty
}): ListState {
  if (i.count > 0) return "ready";          // R2.5 - rows win; background load never blanks
  if (i.loading) return "loading";          // R2.2
  if (i.error) return "error";              // R2.3 - failed load is not an empty lane
  return i.hasQuery ? "no-results" : "empty"; // R2.4
}

export type PaneState = "none" | "loading" | "error" | "missing" | "ready";

export function pickPaneState(i: {
  hasSelection: boolean; // a conversationKey is selected
  loading: boolean;      // detail fetch in flight
  error: boolean;        // detail fetch rejected (network/5xx)
  hasDetail: boolean;    // detail object is present
}): PaneState {
  if (!i.hasSelection) return "none";       // R4.5
  if (i.loading) return "loading";          // R4.3
  if (i.error) return "error";              // R2.7 / R4.2 - retryable
  if (i.hasDetail) return "ready";
  return "missing";                          // R2.7 / R4.4 - resolved-but-absent
}
```

Note on R2.5 ordering: count>0 is checked first so a background refetch (loading=true with rows present) stays "ready" and the list never flashes a skeleton over live rows.

## 6. The shared skeleton module (_skeleton.tsx)

```tsx
// InboxRowSkeleton - same footprint as _inbox-row.tsx so swap-in causes 0 reflow.
export function InboxRowSkeleton() {
  return (
    <div className="skeleton-row flex gap-2.5 border-b px-3.5 py-2.5"
         style={{ minHeight: "var(--inbox-row-height)", borderColor: "var(--color-border-default)" }}>
      <Skeleton className="h-7 w-7 shrink-0 rounded-full" />        {/* 28px avatar (R1.2) */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex justify-between gap-2">
          <Skeleton className="h-3.5 w-32 rounded" />               {/* sender */}
          <Skeleton className="h-3 w-10 rounded" />                 {/* timestamp */}
        </div>
        <Skeleton className="h-3.5 w-3/4 rounded" />                {/* subject */}
        <Skeleton className="h-3 w-1/2 rounded" />                  {/* snippet */}
      </div>
    </div>
  );
}
export function InboxListSkeleton({ count = 8 }: { count?: number }) { /* R1.3 - count rows */ }
export function SplitStripSkeleton() { /* fixed height ~= loaded strip, R5.1 */ }
export function RailSkeleton() { /* fixed 212px width placeholder, R5.2 */ }
```

All four use only Skeleton + tokens (R1.1). The skeleton-row class re-triggers the existing staggered skeleton-fade-in and inherits the globals.css:433-443 reduced-motion guard (R1.5), so F3 adds no new keyframes (NG-4).

## 7. Wiring the surfaces

- page.tsx: add listError state (set in loadLane catch alongside the toast at :178-179; cleared on success at :177). Compute state = pickListState({ loading, error: listError, count: conversations.length, hasQuery: !!debouncedSearch }). Replace the :982-983 ternary so loading => InboxListSkeleton; error => EmptyState variant=error + Retry => loadLane(current); the ready/empty/no-results branches render ConversationList, passing hasQuery so it can choose empty vs no-results copy.
- _conversation-list.tsx: accept hasQuery + onClearSearch; when count===0 branch (:79-85) split on hasQuery to render the no-filter-match EmptyState (naming the query, Clear search action) vs the existing per-lane empty.
- _conversation-pane.tsx: add paneError state, set in the detail catch (:262-264) instead of relying on detail===null; clear on new key + on success. Replace the :470-482 block with pickPaneState: loading => spinner (kept), error => inline error + Retry (re-run the same fetch for conversationKey), missing => existing copy, none => existing copy.
- page.tsx strips: render SplitStripSkeleton while splitCounts is unknown on the attention lane (:875-878), and RailSkeleton while mailboxes is empty but the user is known multi-box (:901-907).
- Hover sweep: _split-tabs.tsx SplitChip (:68-92) gains hover bg-hover (inactive); _mailbox-rail.tsx RailRow (:86-99) moves the JS hover to a CSS group-hover; snooze presets (:675-687) and RSVP buttons (_event-card.tsx:115-132) gain hover bg-hover.

## 8. G-design acceptance gate (copied verbatim from F1 design.md section 8)

A UI surface passes G-design when ALL hold (cite the failing token on any miss):
1. Tokens only - no raw hex/rgb()/rgba(); every color is a var(--color-*) [machine-checked by tokens.contract.test.ts].
2. One accent gradient - the single CTA gradient is --gradient-brand; no second gradient.
3. One button system - every button is the shared Button; at most one gradient CTA per view.
4. Type scale snaps - 24/20/16/14/13/12/11; sender 14/700, subject 14/600, snippet 13/secondary, timestamp 12/tertiary.
5. Density - rows on --inbox-row-height (56) or compact (44); 4px rhythm; row padding 14px.
6. Radius family - cards rounded-lg (8px), chips/buttons rounded-md, the one CTA --inbox-cta-radius (10px).
7. Elevation via tokens - shadows only from the --shadow-* set.
8. Contrast (a11y) - body text at or above var(--color-text-secondary); state never by hue alone; AA contrast.
9. Dark-mode parity - every surface resolves through .dark; no hard-coded light value.
10. No emoji, lucide only - icons lucide-react at 16/13/11px; zero emoji.
11. Focus plus motion - :focus-visible ring; transitions 100-150ms; respects prefers-reduced-motion.
12. State coverage - every list/pane/strip has a skeleton, an EmptyState, an error state (where it can fail), and a hover state. **F3 is the spec that discharges item 12 for the whole inbox.**

Pass = 12/12. F3 must score 12/12 and, for item 12, attach the per-surface matrix from tasks.md.

## 9. Guardrails (one line each)

- No new color literal in _skeleton.tsx or any touched .tsx (tokens.contract.test.ts must stay green).
- pickListState/pickPaneState are pure (no React/DOM import) and return exactly one literal from their union.
- count>0 wins in pickListState - a background refetch never blanks live rows (no skeleton-over-data flash).
- A failed fetch is never shown as an empty lane (list) or as no-longer-available (pane) - error and missing are distinct.
- Strip placeholders reserve exact height/width so first paint has CLS = 0.
- Hover is token-driven and reduced-motion-safe; no JS-mutated inline backgrounds left in the rail.
- Reuse EmptyState and Skeleton - no new empty/skeleton component family, no animation library.
