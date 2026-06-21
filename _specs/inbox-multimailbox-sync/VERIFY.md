# A4 — inbox-multimailbox-sync — Verification (self-verify loop, 2026-06-20)

Branch `feat/inbox-ai-draft` (integration branch). Worktree agent-a64e5014ce08a19ab.

## Commits (2 slices — the autonomously-verifiable layers)
1. `d0eabf8` pure core: healthSummary (mailbox-health.ts) + pickPrimaryMailbox (mailbox-attribution.ts, order-stable) — 14 tests
2. `cd89db8` per-mailbox sync-health store (sync-health.ts mb:<id> namespace, no migration) — 4 tests

## Requirements diff (→ implementation)
| Req | Status | Evidence |
|---|---|---|
| R2.3 healthSummary verdict (pure) | DONE | mailbox-health.ts, 8 tests (error/warning/ok rules) |
| R4.2 pickPrimaryMailbox (deterministic, order-stable) | DONE | mailbox-attribution.ts, 6 tests incl. reorder-determinism |
| R6.3 per-box health store, no migration | DONE | sync-health.ts mb:<id> + recordMailboxSyncOk/Error + getMailboxSyncEntry, 4 tests |
| R1.1-R1.2 per-mailbox OAuth fan-out (cron) | FLAGGED | the cron OAuth branch (sync-functions.ts:886-936) must enumerate active OAuth connected_mailboxes + emit one mailbox-scoped sync per box — Inngest orchestration, needs a live multi-Gmail sync to verify |
| R2.1-R2.2 syncEmails records mb:<id> lastSyncAt/error | FLAGGED | the handler tail calls recordMailboxSyncOk/Error — the store API is built; wiring it into the live handler needs the live sync smoke |
| R2.5/R2.4 surface health in rail + settings | FLAGGED | conversations route mailboxes[] + _mailbox-rail.tsx recolor by health, settings lastEmailSyncAt — additive but INERT until the store is populated by the live sync; defer to avoid hot-path cost for a no-op |
| R4.x attributeMailbox delegates to pickPrimaryMailbox | FLAGGED | the delegation changes a LIVE-rendered attribution path; held while a dev server serves :3007 to keep the inbox stable — drop-in (same single-row output, order-stable) |

## Tests
- mailbox-health 8 + pick-primary-mailbox 6 + sync-health-store 4 = 18 A4 unit tests green.
- `pnpm tsc` clean.

## Why the rest is flagged (honest)
The cron fan-out + handler-tail + surfacing + delegation are LIVE sync orchestration:
they cannot be exercised without a real multi-Gmail account syncing (a human-OAuth +
2-connected-Gmail smoke), and changing the running sync path / the live attribution
blind (while a dev server serves the inbox on :3007) risks the founder's view. The
MEASURABLE core (the two pure helpers — the spec's G-eval-gated pieces) + the clean
store API are built + green; the orchestration is a drop-in once the smoke can run.

## Ground-truth (from the spec)
- OAuth sync is user-wide today (one job per auth_accounts row); IMAP is already
  per-mailbox. The fan-out gap is the OAuth path only; syncEmails already takes mailboxId.
- No last_sync_at column → stored in tenants.settings.syncHealth (no migration).
- Cross-box dedup is ALREADY single-row (email-capture.ts messageId guard); A4 only makes
  the surviving row's box attribution deterministic via pickPrimaryMailbox.
