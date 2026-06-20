# Design — inbox-list-and-thread

## Approach

Re-layout only. No new endpoints, no schema change. The intelligence data is
already loaded in `ConversationDetail` (route `detail`); we move WHERE it renders
and gate it behind a toggle. The messages move ABOVE the intelligence stack.

## Reading view (`_conversation-pane.tsx`)

Current order inside the scroll region (line 781+):
`collision → nextAction → freshSignals → prospectBrief → threadSummary →
threadAsk → notes → actionItems → keyDetails → handledNote → preparedDraft →
intelligence(signals/objections/...) → messages`.

New order:
1. **preparedDraft** (condensed, 1-line + "Edit & send") — actionable, stays top.
2. **nextAction** (condensed, 1-line) — actionable, stays top.
3. **messages** (the email) — FIRST real content.
4. **`<IntelligencePanel>`** (collapsed) — wraps everything else: collision,
   freshSignals, prospectBrief, threadSummary, threadAsk, notes, actionItems,
   keyDetails, handledNote, intelligence(signals/objections/nextSteps/competitors).

### New component: `_intelligence-panel.tsx`
- Props: `count: number` (how many intel sections are non-empty), `children`.
- Renders a sticky-ish toggle row: `▸ Intelligence · {count}` (chevron rotates
  on open). Collapsed by default (`useState(false)`), per-mount (resets per
  thread because the pane re-mounts content on key change — but to be safe, key
  the open-state reset on `conversationKey`).
- When `count === 0`, render `children` directly with NO toggle (R1 edge: a
  thread without intel looks identical minus the affordance). Actually: if
  count is 0 the children are all empty anyway, so render nothing/childless.
- Tokens only (`--color-*`), no hardcoded hex. No emoji (feedback_no-emoji-in-ui).

### Header (lines 534–779)
- Subject: bump to `text-[18px] font-semibold` and make it the FIRST line of the
  header block (above sender? No — Upstream shows subject big, then sender on the
  message. Keep sender line, but the SUBJECT becomes the prominent element).
  Decision: subject `text-[17px] font-semibold` on its own line, sender/email a
  `text-[12px]` line under it. Matches Upstream's subject-dominant hierarchy
  within our split-pane (smaller than full-screen 24px, scaled to pane width).
- Actions row: keep the primary (Generate draft / Reply) labeled. Collapse
  Book-meeting / Assign / Labels / Presence / Stop-sequence / Generate-nudge into
  a `⋮ More` popover (new tiny inline menu) — Snooze + Done stay (right side).

### Composer affordance (R4)
- The reply-worthy primary button already says "Generate draft" with the ⌘/Ctrl+J
  title. Add a subtle hint near the Reply button: when no composer is open and the
  thread is reply-worthy, the "Reply" outline button keeps a `title`/sr hint, and
  the EmailComposerPanel's empty body placeholder becomes
  "Hit ⌘/Ctrl+J to draft with AI" (passed as a prop or set in the panel).

## List row (`_inbox-row.tsx`)

- **R5**: sender name `font-semibold` when `!c.read` (unread), else `font-normal`.
  (Confirm the row has a read/unread flag — `c.read`/`c.unread`; if absent, use
  the existing unread-dot condition as the single source.)
- **R6**: a leading checkbox that is `opacity-0 group-hover:opacity-100` (and
  `opacity-100` when the row/any row is in bulk-select), occupying the avatar's
  leading slot. Reuse the existing checkbox pattern already in the row (the star
  uses `role="button"`; the row already has a checkbox per the summary). Verify
  current markup before adding to avoid a duplicate.

## Testing

- `_intelligence-panel.test.tsx`: count=0 → no toggle, renders nothing;
  count>0 → toggle present, children hidden until clicked.
- Extend `_conversation-pane`-adjacent test (or a new render test) asserting the
  first message renders before any intelligence section in the DOM order.
- `_inbox-row.test.tsx` (if exists) or extend: unread → font-semibold sender.

## Risks

- The pane is 1092 lines and feature-dense; moving blocks risks breaking the
  meeting-scheduler `onBooked` body injection and the prepared-draft consume
  flow. Mitigation: move the JSX blocks wholesale into the panel without changing
  their internals; keep preparedDraft/nextAction where their handlers expect.
- No prod query change → no prod-schema risk.
