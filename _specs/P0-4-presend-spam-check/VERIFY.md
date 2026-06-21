# P0-4 — presend-spam-check — Verification (2026-06-22)

Branch `feat/autopilot-icp-guard`. `checkSpamSignals` (previously dead code,
imported only by its own test) now runs at SEND time and recalls high-risk
drafts. Scope: the deploy-safe core (no migration). Persistence/UI deferred.

## Requirements diff
| Req | Status | Evidence |
|---|---|---|
| Fix 1 fail-soft gate | DONE | `lib/sequence-drafts/spam-gate.ts` `decideSpamGate` — only `high` blocks |
| Fix 2 send-time wiring | DONE | `sequence-draft-to-outbound.ts` runs `checkSpamSignals` (email only) after the citation gate; high+recallable → `canTransition(...,"recall")` → update status/reviewReason (existing columns); returns `{skipped:"spam_high"}` |
| R5 recall guarded | DONE | reuses `canTransition` (same guard as the citation gate) |
| not dead code | DONE | `spam-check-wired.test.ts` asserts the bridge imports + calls it |

## Tests (4, all green)
- `spam-gate.test.ts` (3) — clean/low/medium pass; high blocked with reason
  ("High spam risk", score/100) + codes; end-to-end real `checkSpamSignals`
  (spammy → high → blocked; clean → ok).
- `spam-check-wired.test.ts` (1) — the bridge imports + calls
  checkSpamSignals/decideSpamGate + recall.
- web tsc 0 (proves `draft.subject`/`draft.bodyText` are selected); regression
  (sequence-draft/spam/citation/outbound) 200 green.

## Deferred (needs a schema migration — NOT shipped in this branch)
The spec's Fix 3 (generation-time score in `buildDraftRow`), Fix 4 (edit
recalc), Fix 5 (context route exposes spam*), Fix 6 (UI "Deliverability check")
and the 3 `sequenceDrafts` columns (`spamScore`/`spamSeverity`/`spamWarnings`)
are DEFERRED. Reason: they persist/display the score, which requires the
migration applied first — querying a not-yet-migrated column 500s in prod
(memory: prod schema behind Drizzle), and migrations must not be auto-applied
from an unmerged branch (runner breaks at 0012; use db:push on dev). The
send-time gate above is deploy-safe because it writes only existing columns and
the founder sees the recall via the existing `reviewReason`. Follow-up P0-4b:
add the columns + `db:push` dev + the four persistence/UI fixes + the bridge
integration test (no existing harness to clone — the citation gate is untested
at the Inngest-fn level).
