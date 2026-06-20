# Tasks — inbox-list-and-thread

Each task: code → test → verify (live :3007) → commit. One logical change each.

## LT-1/LT-2 — Intelligence panel (email-first)
- [ ] T1. Create `_intelligence-panel.tsx`: collapsible wrapper, `count` prop,
      chevron toggle, collapsed by default, renders nothing when count 0.
      Test: `_intelligence-panel.test.tsx` (count 0 → no toggle; count>0 →
      hidden until click).
- [ ] T2. In `_conversation-pane.tsx`, compute `intelCount` (number of non-empty
      intel sections) and move collision/freshSignals/prospectBrief/threadSummary/
      threadAsk/notes/actionItems/keyDetails/handledNote/intelligence INTO the
      panel. Keep preparedDraft + nextAction condensed ABOVE the messages.
      Move messages to render BEFORE the panel.
      Verify: open a thread on :3007 → first content = the email; Intelligence
      toggle present + collapsed; click expands.

## LT-3/LT-7 — Header (compact toolbar + subject)
- [ ] T3. Subject → `text-[17px] font-semibold` as the prominent header line;
      sender/email demoted to a 12px line.
- [ ] T4. Collapse secondary actions (Book meeting, Assign, Labels, Presence,
      Stop sequence, Generate nudge) into a `⋮ More` popover; keep Generate
      draft / Reply primary + Snooze + Done.
      Verify: header is one tidy row, no wrap; overflow menu opens.

## LT-4 — Composer affordance
- [ ] T5. EmailComposerPanel empty body placeholder = "Hit ⌘/Ctrl+J to draft
      with AI" (only when opened on a reply-worthy thread with empty body).
      Verify: open Reply on a reply-worthy thread → placeholder shows.

## LT-5/LT-6 — List polish
- [ ] T6. `_inbox-row.tsx`: sender `font-semibold` when unread.
      Test: unread row → semibold sender.
- [ ] T7. `_inbox-row.tsx`: multi-select checkbox revealed on hover
      (opacity-0 group-hover:opacity-100), leading slot. Confirm no duplicate
      with existing checkbox first.
      Verify: hover a row → checkbox appears.

## Close-out
- [ ] T8. `pnpm test` inbox green; `pnpm build` green; live re-verify on :3007
      against `UP-thread-detail.png` + `UP-live-inbox.png`; update memory
      project_inbox-overhaul-build + feedback_inbox-feel-gap.
