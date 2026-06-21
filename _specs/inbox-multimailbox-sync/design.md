# A4 — inbox-multimailbox-sync — Design

Anchored on real files (file:line verified in the worktree on 2026-06-19). A4 is a thin orchestration + dedup + health-surface layer over machinery that mostly exists. The guiding constraint: reuse-first, no migration, deterministic, bounded fan-out.

## 1. Architecture diff vs existing

### Already there (do NOT rebuild)
- **Single-mailbox sync handler**: `syncEmails` (email/sync-requested) already accepts a `mailboxId` + `provider` and resolves the per-box address for `smtp_custom` (src/inngest/sync-functions.ts:111-128). It routes to gmail/outlook/imap, persists `imapLastUid`, marks needs_reauth on auth failure, and fans out all the downstream enrichment. **A4 reuses this verbatim** — it is already mailbox-capable; the gap is only that the OAuth cron does not CALL it per mailbox.
- **IMAP per-mailbox fan-out**: cronSyncEmails already enumerates active `smtp_custom` rows and emits one job each, resolving the owner via the clerk_id bridge (src/inngest/sync-functions.ts:940-970). **A4 generalizes this exact pattern to OAuth boxes.**
- **needs_reauth store + skip**: markNeedsReauth / clearSyncHealth / isNeedsReauth / isOAuthAuthError (src/lib/integrations/sync-health.ts) + the cron skip (src/inngest/sync-functions.ts:915-917). Per-connection today.
- **Cross-box single-row guarantee**: captureInboundEmail dedups on messageId OR gmailMessageId per tenant (src/lib/capture/email-capture.ts:211-224). A second box receiving the same Message-ID produces NO second activity row.
- **Per-box attribution**: attributeMailbox / indexMailboxes (src/lib/inbox/mailbox-attribution.ts) — already maps a conversation to one of the user's boxes; consumed by /api/inbox/conversations (route.ts:38,88-93) to build the rail `MailboxSummary[]`.
- **Per-user scope**: getInboxScope / buildScopeFromRows (src/lib/inbox/user-scope.ts:95-112) — the readable-mailbox set, owner + shared.
- **Settings surface**: GET /api/settings/mail-calendar already returns per-account `status` (incl. needs_reauth), `healthScore`, warmup (route.ts:132-181) — with `lastEmailSyncAt` hard-null (route.ts:145,171).
- **Rail UI**: _mailbox-rail.tsx already renders a per-box color dot + attention count (lines 47-66) on inline tokens.
- **A1 reconnect flow**: GET /api/settings/mailboxes/oauth-link?provider=... (the OAuth-LINK init, NOT signIn) is the reconnect entrypoint (_specs/inbox-mailbox-connect/design.md:59-88).

### Added by A4
- **Per-mailbox OAuth fan-out** in cronSyncEmails: enumerate active OAuth `connected_mailboxes` rows (not auth_accounts) and emit one mailbox-scoped `email/sync-requested` per box.
- **Per-box sync-health store** (no migration): record lastSyncAt + lastSyncError per mailbox in `tenants.settings.syncHealth` under a per-mailbox key, alongside the existing per-connection key.
- **Two pure helpers**: `healthSummary(mailbox, healthEntry, now)` and `pickPrimaryMailbox(messages, byAddress)` — both DB-free, LLM-free, unit-tested (the G-eval-gated pieces).
- **Health in the rail payload**: extend the conversations route `mailboxes` map (route.ts:88-93) with `health` + `needsReauth`.
- **Per-box reconnect / sync-now affordances**: settings page reuses the A1 link flow; a new POST that emits a single mailbox-scoped sync.

## 2. Data model diff

**No migration.** Verified: `connected_mailboxes` (src/db/schema/outbound.ts:224-284) has NO `last_sync_at` / `last_sync_error` column, and `lastEmailSyncAt` is a hard-null TODO in the settings API (route.ts:145). Two options were weighed:

- **Option A — ALTER connected_mailboxes ADD last_sync_at, last_sync_error** (completeness 8/10): clean, queryable, indexable. BUT the project's drizzle journal is frozen at idx 12 and `db:migrate` is disabled (CLAUDE.md), so a column means a hand-written + hand-applied migration on dev only, with prod risk. Heavier than the surface warrants.
- **Option B — store per-box sync health in `tenants.settings.syncHealth` under a per-mailbox key** (completeness 8/10, chosen): the EXACT store needs_reauth already uses (src/lib/integrations/sync-health.ts:11-13, "no schema migration"). The JSONB `||` merge there is proven to preserve siblings. A4 adds a parallel key namespace `mb:<mailboxId>` next to the existing `<authUserId>:<provider>` key.

**Chosen: Option B** — consistent with the documented decision (sync-health.ts already chose JSONB-over-migration) and the CLAUDE.md "prefer NO migration" + frozen-journal constraint. If per-box sync health ever needs to be queried/sorted at scale, promote to a column in a dedicated migration sprint (flagged, not now).

Shape added under `tenants.settings.syncHealth["mb:" + mailboxId]`:
```
{ lastSyncAt?: ISO, lastSyncOk?: ISO, lastSyncError?: string, failingSince?: ISO }
```
The per-connection needs_reauth entry (`status: "needs_reauth"`) is UNCHANGED and remains the source of truth for the reauth flag; the `mb:` entry only adds the last-sync timing + the last transient error string.

## 3. Orchestration (Inngest)

| Fn | Trigger | Job (A4 change) |
|----|---------|-----------------|
| `cronSyncEmails` (EXISTING, src/inngest/sync-functions.ts:877) | cron */15 | **Change** the OAuth branch (:886-936): replace "1 job per auth_accounts user" with "enumerate active OAuth `connected_mailboxes` rows, skip status=error / needsReauth (R5.1), emit 1 mailbox-scoped `email/sync-requested` per box (R1.1)". The IMAP branch (:940-970) is the template + stays as-is (R1.4). Calendar fan-out unchanged. |
| `syncEmails` (EXISTING, :100) | email/sync-requested | **Change** the success/failure tail: on success record `lastSyncAt` + clear `lastSyncError` for `mailboxId` (R2.1); on transient failure record `lastSyncError` without needs_reauth (R2.2, R5.2); the existing hard-auth path (:181-201) already marks needs_reauth (R5.3-R5.4). All keyed on `mb:<mailboxId>`. |
| `onGoogleOAuthConnected` / `onMicrosoftOAuthConnected` (EXISTING, :793/:835) | provider/oauth-connected | **No change needed** for reconnect-clears-flag (R3.3) — already call clearSyncHealth. A4 verifies they also clear the `mb:` entry for the reconnected box (one-line addition). |

Concurrency: `syncEmails` already keys concurrency on `event.data.userId` (limit 1, :105). With per-mailbox fan-out, multiple boxes of the SAME user still serialize (good — one Gmail token, avoid rate-limit), while different users run in parallel. Bounded fan-out: one event per active box; a 150-box tenant emits ≤150 events per tick, each idempotent.

## 4. Integrations (confirm vs locked stack)

- **Inngest** for fan-out + jobs — LOCKED, already the bg-job system (CLAUDE.md). No new scheduler.
- **Gmail API / Microsoft Graph / imapflow** transports — all already wired in `syncEmails` (src/lib/integrations/gmail.ts, outlook.ts, imap.ts). A4 adds none.
- **A1 OAuth-LINK** route for reconnect — reuse, do not add a provider. No new env.
- **tenants.settings JSONB** for health — reuse the sync-health store. No new table.

## 5. The two pure helpers (the testable core)

### 5.1 healthSummary — R2.3
New: `src/lib/inbox/mailbox-health.ts`. Pure, no DB, no LLM.
```
export interface MailboxHealthInput {
  status: string | null;            // connected_mailboxes.status
  healthScore: number | null;       // connected_mailboxes.health_score
  needsReauth: boolean;             // from isNeedsReauth(settings, ...)
  lastSyncAt: string | null;        // settings.syncHealth["mb:"+id].lastSyncAt
  lastSyncError: string | null;
  now: number;                      // injected clock
}
export interface MailboxHealthSummary {
  status: string;
  healthScore: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  needsReauth: boolean;
  health: "ok" | "warning" | "error";
}
export function healthSummary(i: MailboxHealthInput): MailboxHealthSummary
```
Verdict rule (deterministic, total): `needsReauth || status==="error"` -> "error". Else if `lastSyncError` non-null OR (lastSyncAt older than STALE_MINUTES) OR (healthScore < SCORE_FLOOR) -> "warning". Else -> "ok". Constants STALE_MINUTES=60, SCORE_FLOOR=70 from a single `const` block (R2.6); reading them from tenant config is a one-line override hook, no UI.

### 5.2 pickPrimaryMailbox — R4.2
New helper in `src/lib/inbox/mailbox-attribution.ts` (sibling of attributeMailbox, same file). Pure.
```
export function pickPrimaryMailbox(
  messages: AttributableMessage[],
  byAddress: Map<string, MailboxRef>,
): MailboxAttribution
```
Rule (deterministic, total): for each message compute its owning box (inbound -> `to` matches a box; outbound -> `from` matches a box). Among boxes that received an INBOUND, pick the one whose newest inbound is latest; ties (equal `at`, or no inbound at all) break by `mailboxId` lexicographic ascending. Touches no box -> UNATTRIBUTED (mailboxId null) (R4.5). This SUPERSEDES the order-dependent "first header match" in attributeMailbox (:78-89): same single-row output, but stable under reordering — which is exactly what cross-box delivery (two boxes, two sync orders) needs (R4.1-R4.3). attributeMailbox is refactored to delegate to pickPrimaryMailbox so the conversations route and the rail counts stay on ONE rule.

Dedup note (R4.4): there is no second insert-time guard. The single-row guarantee is captureInboundEmail's tenant-scoped messageId dedup (already DONE). pickPrimaryMailbox only decides WHICH box owns that single row, and the `attention` tally in /api/inbox/conversations counts each conversation once under its primary box (route.ts:88-93) — no double counting (R4.3).

## 6. Surfacing (read paths)

- **Rail** (R2.5): in /api/inbox/conversations (route.ts:88-93), enrich each `mailboxes[]` entry with `health` + `needsReauth` from healthSummary(). _types.ts `MailboxSummary` gains `health: "ok"|"warning"|"error"` + `needsReauth: boolean`. _mailbox-rail.tsx recolors the existing dot by `health` (token-mapped) and renders an aria-labelled state — dot never the sole carrier (G-design item 8).
- **Settings** (R2.4): GET /api/settings/mail-calendar replaces `lastEmailSyncAt: null` (route.ts:145,171) with the real `mb:<id>.lastSyncAt`, and adds `lastSyncError`. The page already renders `Email sync {timeAgo(lastEmailSyncAt)}` (page.tsx:448) — it lights up for free. Reconnect buttons there already point at the A1 link flow (page.tsx:437-445) (R3.1).

## 7. Guardrails (one line each)

- Fan-out scoped per mailbox; one slow/erroring box never blocks siblings (R1.2).
- Every per-box job idempotent via the existing messageId / gmailMessageId dedup (R1.3, R4.4).
- Bounded fan-out: ≤1 event per active box per tick; status=error / needsReauth boxes skipped (R5.1).
- Transient failure retries in-budget; only hard-auth flips needs_reauth (R5.2-R5.3).
- One notification per healthy-to-error transition per box (newlyMarked) (R5.4).
- Owner-scoped: a box syncs only for its owner; health reads go through getInboxScope (R6.1-R6.2).
- No migration; health in tenants.settings.syncHealth JSONB (R6.3).
- Deterministic dedup + health: both pure, both unit-tested (G-eval).
- Health UI on inline tokens only, dot decorative + text/aria (G-design).
- A4 touches sync + health + dedup only — no connect (A1), no rail layout/identity (A3), no LLM (B).
