# P0-5 — suppression-list — Verification (2026-06-22)

Branch `feat/autopilot-icp-guard`. A hard-bounced / complained / opted-out
address can no longer be re-enrolled and re-emailed. Backed by the EXISTING
`emailOptouts` table — NO schema change, NO migration, deploy-safe.

## Requirements diff
| Req | Status | Evidence |
|---|---|---|
| Fix 1 eligibility | DONE | `enrollment-eligibility.ts` `suppressedReason` + reason `suppressed` (order: deleted>no_email>suppressed>excluded_company) |
| shared helper | DONE | `lib/sequences/suppression.ts` `loadSuppressedEmails` / `isEmailSuppressed` (case-insensitive `lower()`) over emailOptouts |
| Fix 2 /enroll | DONE | per-contact `isEmailSuppressed` before checkContactEligibility |
| Fix 3 autopilot route | DONE | `loadSuppressedEmails` once + per-candidate suppressedReason |
| Fix 4a enrollInSequence | DONE | per-contact suppression in the chat tool |
| Fix 4b runSequenceAutopilot | DONE | `loadSuppressedEmails` once + filter |
| Fix 5 signal-to-sequence | DONE | `step.run("filter-suppressed")` drops burned addresses before the gate |
| Fix 6 deferred executor | DONE | `action-executors.ts` filters suppressed in `validIds` (the REAL write for autopilot/signal) |
| Fix 7 complaint reason | DONE | resend webhook writes `reason:"complaint"` (was "unsubscribe") |
| Fix 8 lowercase write | DONE | emailengine hard-bounce writes `toAddress.toLowerCase()` |

All 6 enrollment entry points + the deferred write + the SEND-time net
(send.worker, unchanged) now reject suppressed addresses.

## Tests (6 new + 4 updated, all green)
- `enrollment-suppression.test.ts` (6) — suppressed→ineligible; ordering
  deleted>no_email>suppressed>excluded; backward-compat (no field → eligible);
  loadSuppressedEmails empty/no-query, lower-cased set; isEmailSuppressed
  case-insensitive true/false/null.
- Updated for the new query/reason: `autopilot-api.test.ts` (added
  loadSuppressedEmails select + inArray/emailOptouts mocks),
  `signal-auto-enroll.approval.test.ts` (filter-suppressed select + sql mock),
  `webhooks-resend-api.test.ts` (reason "complaint").
- web tsc 0; broad regression (enrollment/autopilot/signal/webhook/engagement/
  action/suppression) 58 files / 531 green.

## Notes
- No `lower(email_address)` index added (lookups are bounded `inArray` sets,
  <=100 emails/enroll) — open question in design.md if volumes grow; add via
  db:push on dev (migration runner breaks at 0012).
- Fail-closed on the lookup: a thrown `loadSuppressedEmails` surfaces to the
  route try/catch → 500, never a blind enroll (a missed enroll is recoverable,
  emailing a burned address is not).
