# A4 — inbox-multimailbox-sync — Requirements (EARS)

**Feature ID**: inbox-multimailbox-sync · **Track**: A (Multi-mailbox centralization) · **Prio**: P1
**Deps**: A1 inbox-mailbox-connect (DONE — OAuth-LINK + IMAP/SMTP connect), A3 inbox-mailbox-rail-identity (rail surface)
**Scope**: the sync + health + dedup layer behind an already-working multi-mailbox inbox. A1 connects boxes; A3 renders the rail. A4 makes each box sync independently, surfaces its health, and de-duplicates the same email landing in two of the user's boxes.

## Ground-truth verdict (verified against live code 2026-06-19)

- **Sync is USER-WIDE today for OAuth, not per-mailbox.** `cronSyncEmails` (src/inngest/sync-functions.ts:877-974) enumerates `auth_accounts` rows (one per user, provider google/microsoft) and fires ONE `email/sync-requested` per user (:929-936) — a user with three Gmail boxes still has a single `auth_accounts` Google row, so all three are pulled in a single Gmail-API pass keyed on the user's primary identity. **IMAP/SMTP is ALREADY per-mailbox** (:940-970): one job per active `smtp_custom` row, scoped by `mailboxId`. So the fan-out gap is the **OAuth path only**.
- **No `last_sync_at` / `last_sync_error` column exists** on `connected_mailboxes` (src/db/schema/outbound.ts:224-284). The settings API hard-codes `lastEmailSyncAt: null` with a `TODO: track ... in Phase B` (src/app/api/settings/mail-calendar/route.ts:145,171). Health fields that DO exist: `status`, `healthScore`, `bounceCount7d`, `replyCount7d`, `imapLastUid`, `caldavLastSyncAt`, warmup fields.
- **needs_reauth already exists** but is keyed per connection (authUserId:provider) in `tenants.settings.syncHealth` (src/lib/integrations/sync-health.ts:26-29,84-122), NOT per mailbox.
- **Cross-box dedup is PARTLY there but per-tenant, not deterministic-per-box.** `captureInboundEmail` dedups on `messageId` OR `gmailMessageId` within a tenant (src/lib/capture/email-capture.ts:211-224), so the same Message-ID does NOT create two `activities` rows. BUT the surviving single row is attributed by `attributeMailbox` (src/lib/inbox/mailbox-attribution.ts:72-90) to the FIRST of the user's boxes whose address appears (newest-first scan, first header match) — order-dependent, not a stated deterministic primary-box rule. The list already shows ONE entry; A4 makes the attribution **deterministic + documented**.

## Tag legend
[DONE] shipped · [NEW] real gap, needs code · [CFG] tenant config · [LOCKED] stack decision · [HORS SCOPE] track separately

---

## R1 — Per-mailbox sync fan-out

- **R1.1** [NEW] WHEN the 15-minute sync cron runs, THE SYSTEM SHALL emit one `email/sync-requested` job **per active connected mailbox** the user owns (each carrying its own `mailboxId`), not one job per user that pulls every Gmail box at once.
  - GIVEN a user owns 3 active mailboxes (2 Gmail OAuth + 1 IMAP) · WHEN the cron fires · THEN exactly 3 mailbox-scoped jobs are emitted (plus calendar jobs as today).
- **R1.2** [NEW] THE SYSTEM SHALL scope every emitted sync job to a single mailbox so a slow or erroring box never blocks, delays, or fails the sync of any sibling box.
  - GIVEN box B raises a fetch error · WHEN the cron fans out · THEN boxes A and C complete normally and B's failure is isolated to its own job.
- **R1.3** [NEW] THE SYSTEM SHALL make each per-mailbox sync job idempotent — re-running a mailbox's job over the same window inserts no duplicate activities (reusing the existing `messageId`/`gmailMessageId` dedup in `captureInboundEmail` and the outbound `gmailMessageId` guard).
  - GIVEN box A's job runs twice for the same window · WHEN both complete · THEN the activity count for A is identical to a single run.
- **R1.4** [DONE] THE SYSTEM SHALL poll each `smtp_custom` mailbox independently using its `imapLastUid` high-water mark (already implemented — src/inngest/sync-functions.ts:940-970, src/lib/integrations/imap.ts:137-241). A4 does NOT re-implement IMAP fan-out.
- **R1.5** [NEW] WHERE a user owns multiple OAuth mailboxes of the same provider, THE SYSTEM SHALL resolve the per-box address from the `connected_mailboxes` row (not the user's primary identity) so each job's direction-relative-to-mailbox and attribution stay correct.
- **R1.6** [LOCKED] THE SYSTEM SHALL fan out via Inngest events (the existing `email/sync-requested` handler + the 15-min cron), not a new scheduler or queue — stack is fixed.

## R2 — Per-box sync health (maintain + expose)

- **R2.1** [NEW] WHEN a per-mailbox sync job completes successfully, THE SYSTEM SHALL record that mailbox's last-successful-sync timestamp and clear any prior sync error for that box.
- **R2.2** [NEW] WHEN a per-mailbox sync job fails, THE SYSTEM SHALL record the failure reason and the failing-since time scoped to that mailbox, without affecting sibling boxes' health.
- **R2.3** [NEW] THE SYSTEM SHALL expose, per mailbox, a `healthSummary` derived purely from stored fields — { status, healthScore, lastSyncAt, lastSyncError, needsReauth, health: "ok" | "warning" | "error" } — via a single pure helper with no DB or LLM dependency (unit-testable).
  - GIVEN a box with needsReauth=true · THEN health="error". GIVEN a box synced older than N minutes OR healthScore below floor OR a non-null recent error · THEN health="warning". ELSE health="ok".
- **R2.4** [NEW] WHEN the Mail & Calendar settings API responds, THE SYSTEM SHALL return each account's real `lastEmailSyncAt` and any `lastSyncError`, replacing the hard-coded null/TODO (src/app/api/settings/mail-calendar/route.ts:145,171).
- **R2.5** [NEW] WHEN the inbox conversations API returns the mailbox list for the rail, THE SYSTEM SHALL include each box's `health` verdict and `needsReauth` flag so A3's rail can render a per-box health dot/badge.
- **R2.6** [CFG] THE SYSTEM SHALL read the staleness threshold (minutes since last successful sync before a box is "warning") and the health-score floor from constants/tenant config, defaulting to sensible values (e.g. 60 min stale, score floor 70) — no per-box UI to configure them in A4.

## R3 — Refresh / reauth / manual sync

- **R3.1** [NEW] WHERE a mailbox is flagged needsReauth, THE SYSTEM SHALL surface a per-box "Reconnect" affordance that reuses the **A1 OAuth-LINK** flow (/api/settings/mailboxes/oauth-link?provider=...), NOT next-auth `signIn`.
  - GIVEN box A needs reauth · WHEN the user clicks Reconnect on A · THEN they enter the A1 link flow for A's provider and, on success, A's needs_reauth clears (`clearSyncHealth`, src/lib/integrations/sync-health.ts:125-137).
- **R3.2** [NEW] THE SYSTEM SHALL offer a per-box "Sync now" affordance that emits a single `email/sync-requested` for **that mailbox only** (reusing the existing handler), and SHALL be idempotent with the cron.
- **R3.3** [DONE] WHEN a reconnect completes, THE SYSTEM SHALL clear the connection's needs_reauth flag and resume cron syncing for that box (already wired via `onGoogleOAuthConnected`/`onMicrosoftOAuthConnected` -> `clearSyncHealth`, src/inngest/sync-functions.ts:803-806,845-848).
- **R3.4** [NEW] IF a user clicks "Sync now" on a box currently flagged needsReauth, THEN THE SYSTEM SHALL surface the reconnect affordance instead of dispatching a doomed sync against a dead token.

## R4 — Cross-box thread dedup (deterministic primary box)

- **R4.1** [NEW] WHEN the same Message-ID is delivered to two of the user's own connected mailboxes, THE SYSTEM SHALL show the conversation **exactly once** in the unified inbox (never two duplicate rows).
  - GIVEN box A and box B both received the same Message-ID · WHEN the inbox renders · THEN one conversation entry appears.
- **R4.2** [NEW] THE SYSTEM SHALL attribute a cross-box conversation to a **deterministic primary box** via a pure rule, so the same input always yields the same owning box regardless of sync order or which box's job ran first.
  - Rule (stated, unit-tested): among the user's boxes that touched the conversation, pick the box that **received the newest inbound addressed to it**; tie-break by the box's stable id (lexicographic) for total determinism.
- **R4.3** [NEW] WHERE a conversation is attributed to a primary box, THE SYSTEM SHALL still let it appear under the "All inboxes" view and count it toward exactly one per-box `attention` total (no double counting in the rail).
- **R4.4** [DONE] THE SYSTEM SHALL rely on the existing tenant-scoped `messageId`/`gmailMessageId` idempotency in `captureInboundEmail` (src/lib/capture/email-capture.ts:211-224) to prevent a second `activities` row — A4 adds deterministic attribution, not a second dedup layer at insert time.
- **R4.5** [NEW] IF a conversation touches none of the user's own boxes (should not happen for in-scope rows), THEN THE SYSTEM SHALL attribute it to null and keep it visible only under "All inboxes" (no crash, no orphan dot).

## R5 — Failure isolation + backoff

- **R5.1** [NEW] WHEN the cron fans out, THE SYSTEM SHALL skip any mailbox whose status = "error" or whose connection is needsReauth, recording the skip reason, so a dead box is not hammered every 15 minutes (extends the existing OAuth needs_reauth skip at src/inngest/sync-functions.ts:915-917 to a per-mailbox check).
- **R5.2** [NEW] WHEN a per-mailbox job hits a transient failure (network/5xx/timeout), THE SYSTEM SHALL retry within the job's existing Inngest retry budget without flipping the box to a hard-error/needs_reauth state.
- **R5.3** [NEW] WHEN a per-mailbox job hits a hard auth failure (`isOAuthAuthError` true — src/lib/integrations/sync-health.ts:44-56), THE SYSTEM SHALL flag that box needs_reauth (transition-once notification, reusing `markNeedsReauth`) and mark its status appropriately.
- **R5.4** [NEW] THE SYSTEM SHALL fire the user-facing "sync disconnected" notification at most once per healthy-to-error transition per box (preserve the `newlyMarked` semantics already in `markNeedsReauth` — src/lib/integrations/sync-health.ts:84-122).

## R6 — Owner / tenant scoping

- **R6.1** [NEW] THE SYSTEM SHALL scope every per-mailbox sync job to the mailbox's owner (`connected_mailboxes.user_id` -> app user via the clerk_id bridge, as already done for IMAP at src/inngest/sync-functions.ts:952-958), so a box only ever syncs for its owner and outbound attribution + the per-user concurrency key stay correct.
- **R6.2** [NEW] THE SYSTEM SHALL scope every health read to the requesting user's own (or tenant-shared) mailboxes via `getInboxScope` (src/lib/inbox/user-scope.ts:95-112) — a user never reads another user's per-box sync error or last-sync time unless the box is shared.
- **R6.3** [LOCKED] THE SYSTEM SHALL keep needs_reauth health in `tenants.settings.syncHealth` (no migration) — the established store; A4 may add a per-mailbox key alongside the per-connection key.

## Non-goals (THE SYSTEM SHALL NOT)

- **NG1** [HORS SCOPE -> A1] THE SYSTEM SHALL NOT add a connect-a-new-mailbox flow (OAuth-LINK / IMAP connect) — that is A1, DONE.
- **NG2** [HORS SCOPE -> A3] THE SYSTEM SHALL NOT build the rail layout, per-box color, or display-name/signature/voice identity — that is A3. A4 only feeds A3 the health verdict per box.
- **NG3** [HORS SCOPE -> B-track] THE SYSTEM SHALL NOT touch draft generation, triage lanes, noise classification, or any LLM intelligence.
- **NG4** [HORS SCOPE] THE SYSTEM SHALL NOT change warmup, daily-limit, or deliverability sending policy (`healthScore` as a sending signal stays owned by the warmup/send infra; A4 only reads it for the sync-health verdict).
- **NG5** THE SYSTEM SHALL NOT introduce a new background scheduler, queue, or provider — Inngest events + the existing cron only.
- **NG6** THE SYSTEM SHALL NOT add a second insert-time dedup layer — the existing per-tenant `messageId` guard is sufficient; A4 adds deterministic attribution only.

## Cross-cutting gates

- **G-design**: any health UI A4 introduces (the rail per-box health dot/badge + the per-box "Reconnect"/"Sync now" affordance) MUST pass the F1 12-item checklist (_specs/inbox-design-system/design.md section 8). F1 is not built, so reuse the existing inline-token pattern already in _mailbox-rail.tsx (var(--color-*) only, no hex; dot decorative, never the sole carrier of state — pair it with text/aria). The reconnect/sync-now controls reuse the settings page's existing error/badge slots (mail-calendar/page.tsx:437-448).
- **G-eval**: **N/A for an LLM bar** — A4 is orchestration + dedup, no model output. The measurable pieces are the **pure cross-box dedup rule (R4.2)** and the **healthSummary helper (R2.3)**, both gated by Vitest unit tests (deterministic, no eval:run case).
