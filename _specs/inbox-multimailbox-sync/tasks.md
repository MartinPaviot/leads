# A4 — inbox-multimailbox-sync — Tasks

**Total estimate: ~6.5 dev-days** (13 tasks). Branch: `feat/inbox-multimailbox-sync`. Each task: code -> test -> verify -> commit. Order is dependency-correct.

Half-day = 0.5 dev-day. Estimates in the right column.

| Slice | Tasks | Est |
|-------|-------|-----|
| Pure helpers (testable core) | B1.1, B1.2 | 1.5 |
| Per-box health store | B2.1, B2.2 | 1.0 |
| OAuth fan-out | B3.1, B3.2 | 1.5 |
| Reconnect / sync-now | B4.1, B4.2 | 1.0 |
| Surfacing (rail + settings) | B5.1, B5.2 | 1.0 |
| Hardening | B6.1, B6.2, B6.3 | 0.5 |

---

## Slice 1 — Pure helpers (do first; everything else consumes them)

### B1.1 [NEW] healthSummary pure helper — 0.5d
- **Action**: add `src/lib/inbox/mailbox-health.ts` exporting `healthSummary(input)` (signature in design section 5.1), with a single `STALE_MINUTES=60 / SCORE_FLOOR=70` const block.
- **Verify**: `needsReauth=true` -> "error"; stale lastSyncAt OR low score OR non-null error -> "warning"; fresh + scored + no error -> "ok". Pure, injected `now`.
- **Test**: `mailbox-health.test.ts` — table of 8 cases covering each branch + boundaries (exactly at STALE_MINUTES, exactly at SCORE_FLOOR, null lastSyncAt = warning).
- **Refs**: R2.3, R2.6.

### B1.2 [NEW] pickPrimaryMailbox deterministic dedup rule — 1.0d
- **Action**: add `pickPrimaryMailbox(messages, byAddress)` to `src/lib/inbox/mailbox-attribution.ts` (design 5.2); refactor `attributeMailbox` to delegate to it so one rule drives both the conversations route and rail counts.
- **Verify**: same Message-ID across box A + box B yields ONE deterministic primary box independent of message order; tie-break by mailboxId lexicographic; no inbound-touched box -> null.
- **Test**: `mailbox-attribution.test.ts` (extend existing) — (a) two boxes received same thread, newest-inbound wins; (b) reversed input order = identical output (determinism); (c) equal timestamps -> lexicographic id; (d) no box touched -> UNATTRIBUTED; (e) existing attributeMailbox cases still green after delegation.
- **Refs**: R4.1, R4.2, R4.3, R4.5.

## Slice 2 — Per-box health store (no migration)

### B2.1 [NEW] per-mailbox sync-health read/write helpers — 0.5d
- **Action**: in `src/lib/integrations/sync-health.ts` add `mailboxKey(id)="mb:"+id`, `recordMailboxSyncOk(tenantId, mailboxId, at)` (sets lastSyncAt/lastSyncOk, clears lastSyncError), `recordMailboxSyncError(tenantId, mailboxId, reason)` (sets lastSyncError + failingSince, preserves prior), and a pure `getMailboxSyncEntry(settings, mailboxId)`. Reuse the existing JSONB `||` merge pattern (sync-health.ts:117) so siblings are preserved.
- **Verify**: writing `mb:X` does not disturb `mb:Y` nor the existing `<authUserId>:<provider>` needs_reauth entry; a tenant with no syncHealth gets it created (the `||` build-up handles the missing intermediate).
- **Test**: `sync-health.test.ts` (extend) — pure getMailboxSyncEntry over a fixture settings object; key isolation assertions on the merge SQL via a mocked db (or a focused integration test on the dev DB).
- **Refs**: R2.1, R2.2, R6.3.

### B2.2 [NEW] clear mb-entry on reconnect — 0.25d
- **Action**: in `onGoogleOAuthConnected`/`onMicrosoftOAuthConnected` (src/inngest/sync-functions.ts:803-806,845-848), after `clearSyncHealth`, also clear the `mb:` entries for the reconnected user's boxes of that provider (one extra `#-` per box, or a small clearMailboxSyncHealth helper).
- **Verify**: after reconnect, the box's lastSyncError is gone and health returns to ok on next successful sync.
- **Test**: covered by B6.2 integration (reconnect path) + a unit on clearMailboxSyncHealth key targeting.
- **Refs**: R3.3.

## Slice 3 — OAuth per-mailbox fan-out

### B3.1 [NEW] cron emits one OAuth job per active mailbox — 1.0d
- **Action**: in `cronSyncEmails` (src/inngest/sync-functions.ts:886-936) replace the auth_accounts-per-user enumeration with: select active `connected_mailboxes` rows where `provider IN (gmail, outlook)` AND `status != error`; for each, resolve the owner app-user via the clerk_id bridge (mirror the IMAP branch at :952-958); skip rows whose connection is `isNeedsReauth` (R5.1); emit one `email/sync-requested` carrying `{ userId, tenantId, appUserId, daysBack:1, provider, mailboxId }` (R1.1, R6.1). Keep the IMAP branch (:940-970) and calendar fan-out as-is.
- **Verify**: a user with 2 Gmail boxes + 1 IMAP produces exactly 3 email jobs (2 distinct mailboxIds + the IMAP one); a box with status=error or needsReauth produces none and logs a skip reason.
- **Test**: `cron-sync-fanout.test.ts` — mock db + inngest.send; assert one event per active box, mailboxId present, error/needsReauth boxes skipped, owner resolved per box.
- **Refs**: R1.1, R1.2, R5.1, R6.1.

### B3.2 [NEW] syncEmails fetches the per-box OAuth mailbox correctly — 0.5d
- **Action**: ensure the OAuth fetch path in `syncEmails` (src/inngest/sync-functions.ts:160-163) scopes to the per-box address when a `mailboxId` is present (today the google/microsoft branches fetch by the user's primary identity). Resolve the box address from `connected_mailboxes` (mirror the smtp_custom resolution at :118-128) and pass it so a multi-Gmail user's boxes do not all pull the same primary mailbox (R1.5). If the transport cannot target a non-primary OAuth box, record that constraint explicitly and gate fan-out to one OAuth box per identity (documented limitation, not silent).
- **Verify**: box A's job records activities attributable to A's address; box B's job to B's — no cross-contamination.
- **Test**: `sync-perbox-address.test.ts` — assert the resolved fetch identity equals the mailbox row address for a given mailboxId.
- **Refs**: R1.5, R6.1.

## Slice 4 — Reconnect / sync-now affordances

### B4.1 [NEW] per-box "Sync now" endpoint — 0.5d
- **Action**: add `POST /api/inbox/mailbox/[id]/sync` (or extend an existing inbox mailbox route): authz via getAuthContext + getInboxScope (box must be in the user's scope, R6.2); if the box is `needsReauth`, return a 409 with `{ action: "reconnect", provider }` (R3.4); else emit a single mailbox-scoped `email/sync-requested` (R3.2) and return 202.
- **Verify**: clicking Sync now on a healthy box enqueues exactly one job for that box; on a needsReauth box returns the reconnect directive, no job.
- **Test**: `mailbox-sync-now.test.ts` — scope rejection (other user's box -> 403), needsReauth -> 409 reconnect, healthy -> 202 + one send.
- **Refs**: R3.2, R3.4, R6.2.

### B4.2 [NEW] reconnect affordance wiring — 0.5d
- **Action**: the settings page reconnect already targets the A1 link flow (page.tsx:437-445). Surface the SAME per-box "Reconnect" entry in the inbox health UI (rail tooltip / box menu) as a navigation to `/api/settings/mailboxes/oauth-link?provider=...` — NOT signIn (R3.1). The 409 from B4.1 drives the inline reconnect prompt.
- **Verify**: a needsReauth box shows Reconnect; clicking it enters the A1 OAuth-LINK flow for that provider; on return, needs_reauth clears and the dot returns to ok after the next sync.
- **Test**: component test asserting the Reconnect control hrefs the oauth-link route (never signIn) for a needsReauth box; absent for a healthy box.
- **Refs**: R3.1, R3.3.

## Slice 5 — Surfacing (rail + settings)

### B5.1 [NEW] health in the conversations rail payload — 0.5d
- **Action**: in `/api/inbox/conversations` (route.ts:88-93) enrich each `mailboxes[]` entry with `health` + `needsReauth` via healthSummary() (load the box rows status/healthScore + the syncHealth settings once). Extend `MailboxSummary` in `_types.ts` with `health` + `needsReauth`. Recolor the existing dot in `_mailbox-rail.tsx` (lines 51-57) by health (token map: ok=accent/neutral, warning=amber token, error=danger token) and add an aria-label / text cue so the dot is never the sole state carrier (G-design item 8).
- **Verify**: a box flagged needsReauth shows an error-state dot + accessible label in the rail; ok boxes unchanged.
- **Test**: `rail-health.test.ts` — render MailboxRail with mixed health, assert per-box state class/aria; route test asserting the payload carries health+needsReauth.
- **Refs**: R2.5, G-design.

### B5.2 [NEW] real lastSyncAt + lastSyncError in settings — 0.5d
- **Action**: in `GET /api/settings/mail-calendar` replace `lastEmailSyncAt: null` at route.ts:145 AND :171 with the real `mb:<id>.lastSyncAt`, and add `lastSyncError` to the account shape. The page already renders `Email sync {timeAgo(...)}` (page.tsx:448) — it lights up automatically.
- **Verify**: after a successful per-box sync, settings shows a real "Email sync 2m ago"; after a failure, the error string is available to the page.
- **Test**: route test — given a syncHealth fixture, the account's lastEmailSyncAt + lastSyncError are populated (no more hard null).
- **Refs**: R2.4.

## Slice 6 — Hardening

### B6.1 [NEW] record health on the syncEmails success/failure tail — 0.25d
- **Action**: in `syncEmails` — on the success return (src/inngest/sync-functions.ts:633) call `recordMailboxSyncOk(tenantId, mailboxId, now)` when `mailboxId` present; on a transient (non-auth) fetch failure call `recordMailboxSyncError` WITHOUT marking needs_reauth (R2.2, R5.2); leave the existing hard-auth markNeedsReauth path (:181-201) intact for R5.3-R5.4. Guard so a tenant-wide (no mailboxId) legacy job is a no-op on the mb-store.
- **Verify**: a green sync stamps lastSyncAt; a transient fail stamps lastSyncError but the box keeps syncing next tick; a hard-auth fail flips needs_reauth + notifies once.
- **Test**: `sync-health-tail.test.ts` — three paths (ok / transient / hard-auth) assert the correct store mutation + notification-once.
- **Refs**: R2.1, R2.2, R5.2, R5.3, R5.4.

### B6.2 [NEW] failure-isolation integration — 0.25d
- **Action**: integration-style test proving a box raising mid-fan-out does not block siblings (R1.2) and that re-running a box's job over the same window inserts no duplicate activities (R1.3).
- **Verify**: 3-box fan-out where box B throws; A + C still record; B is the only one flagged. Double-run of A = identical activity count.
- **Test**: `fanout-isolation.test.ts` — orchestrate mocked per-box jobs; assert isolation + idempotency.
- **Refs**: R1.2, R1.3, R5.1.

### B6.3 [NEW] regression: single-row cross-box guarantee — 0.0d (bundled)
- **Action**: regression test that the same Message-ID delivered to two of a user's boxes produces ONE activity (via captureInboundEmail dedup, R4.4) AND ONE conversation attributed to the deterministic primary box (B1.2), counted once in the rail (R4.3).
- **Verify**: end-to-end on the pure layer — feed two box deliveries of one Message-ID through capture-dedup + pickPrimaryMailbox; assert one row, one primary, one attention count.
- **Test**: `cross-box-dedup.test.ts` — the headline determinism guarantee; this is the G-eval-gated assertion.
- **Refs**: R4.1, R4.3, R4.4, G-eval.

---

## Definition of done (software, separate from any OKR)

- [ ] All 13 tasks merged on `feat/inbox-multimailbox-sync`; `pnpm tsc` + `pnpm lint` + `pnpm test` green.
- [ ] `healthSummary` + `pickPrimaryMailbox` unit suites green and deterministic (the G-eval bar; no `eval:run` case needed — no LLM).
- [ ] Live verify: a user with 2 OAuth boxes + 1 IMAP shows 3 independent jobs per tick (Inngest dashboard); killing one box's token flips only that box to error and surfaces a Reconnect that enters the A1 link flow; settings shows real per-box last-sync times.
- [ ] Cross-box: the same email landing in two boxes shows once, attributed to a stable primary box (screenshot evidence).
- [ ] G-design: rail health dot + Reconnect/Sync-now affordances reviewed against the F1 12-item checklist (inline tokens, dot + text/aria, no hex, dark-mode).
- [ ] No migration applied; `tenants.settings.syncHealth` shape verified preserved.

## Out of scope (tracked elsewhere)
- Connect a new mailbox -> A1 (DONE). Rail layout / per-box identity -> A3. Drafts/triage/noise -> B-track. Warmup/deliverability sending -> sending infra.
