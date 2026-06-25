# Component-layer hydration sweep — 2026-06-25

The page-level audit never individually verified shared data-fetching components.
Workflow `verify-component-hydration` (33 Explore agents) swept `src/components/*`.
Clean: 13. Flagged: 20 (agents over-report — each verified against code).

## Fixed (high-value: consequential silent failures + a functional control)

- [x] **agent-feed.tsx** — load swallowed `!res.ok` → "No agent activity yet" masked a
  500; handleApprove/handleDismiss were fire-and-forget (a failed AGENT-ACTION approval
  silently refetched). Added loadError + Retry + `toast` on the mutations.
- [x] **campaign-wizard.tsx** — `approveAll` had no res.ok check, and approving queues
  emails to SEND (consequential silent failure); loadReviewEmails went empty on 500.
  Both now set the existing `error` state.
- [x] **owner-select.tsx** — a 500 left the owner picker with zero options (user can't
  reassign, looks like "no members"). Added loadError → a disabled "Couldn't load
  members" option.

## Verified-fine / over-reported (NO fix)

- **GuardrailMigrationBanner.tsx** — the dismiss catch has a comment: a failed dismiss
  just reappears next /home load, *deliberately* acceptable. Agent didn't read it.

## Deferred — optional self-hiding widgets (lower severity)

These render `null`/empty on BOTH genuine-empty AND error, so a 500 makes the widget
*absent* rather than *data-misleading* (softer than a main content area showing "No X").
Acceptable-degraded for optional surfaces; adding inline error UI to each is lower-value
polish. Flagged, not fixed: hot-inbounds-widget · hot-visitors-widget · intelligence-brief ·
live-extraction · sequence-draft-preview · sequence-triggers-panel · TAMRevealNotification ·
up-next-view · WarmLeadPrompt · transcript-chunks · contact-collision-notice ·
onboarding-v2-wrapper.

## Deferred — medium functional (genuine, follow-up)

- notification-bell.tsx — a 500 shows "No notifications yet" (polling, transient).
- command-palette.tsx — a search 500 shows "no results" (looks like no matches).
- task-progress-card.tsx — cancel mutation no res.ok (P1); EventSource onerror no error
  state (P1 but lowRisk:false — riskier, needs care).
- hot-inbounds-widget.tsx — lead-feedback POST no res.ok (P2).
- email-composer-panel.tsx — DB draft auto-save (272-290) swallows errors (fire-and-forget
  auto-save; localStorage draft is the durable copy, so low user impact).

## Clean (13, no defect)

call-intel · chat-action-cards · entity-link · eval-run-drilldown · meeting-scheduler ·
revenue-forecast · ScalingPathPrompt · skill-detail · sourcing-preview-modal ·
smart-search-bar · visitor-id-cap-banner · smart-import · chat-dock.
