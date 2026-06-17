# CLE-13 — Send-guardrail hardening — Tasks

> Branch: `feat/CLE-13-send-guardrail-hardening`. Merge to main only on Phase 6 PASS. Commit trailer
> `Co-Authored-By: Rippletide <admin@rippletide.com>`. `tsc --noEmit` 0 errors + `regression.sh` green after
> the last task. Each task: **action · file · verify · test**. Order: shared seams first (T1-T3), then the
> 5-chokepoint wiring (T4), then items 2/3/4 (T5-T8), then guards/hygiene (T9-T11).
>
> The four scope items are independent; if time-boxed, the shippable cut lines are after T4 (item 1), T6
> (item 2), T7 (item 3 for C3/C5 — folded into T4's gate), and T8 (item 4). T1-T3 are prerequisites for
> item 1/3.

---

## T1 — Export `DEFAULTS` from tenant-settings

- **Action:** Add `export` to `const DEFAULTS` so the new gate uses the same sending defaults the
  `getTenantSettings` merge uses. No value change.
- **File:** `app/apps/web/src/lib/config/tenant-settings.ts:437` (`const DEFAULTS` → `export const DEFAULTS`).
- **Verify:** `tsc --noEmit` clean; `grep "export const DEFAULTS"` matches; no other change to the object
  (`:456-458` still `primary-with-caps`/20/false).
- **Test:** none new (covered transitively by T2's gate test reading `DEFAULTS`). Existing tenant-settings
  tests still pass.

## T2 — Shared pre-send gate `evaluateSend` + `isSuppressed` + `isColdRecipient`

- **Action:** Create the gate adapter per design §3: `isSuppressed` (one `email_optouts` lookup, covers
  hard-bounce via `reason:"bounce_hard"`), `isColdRecipient` (any prior email activity → warm, unknown →
  cold), `evaluateSend` (opt-out first, then `enforceSendingIdentity` with merged `DEFAULTS`), all
  tenant-scoped, wrapped in try/catch that fails closed (`send:false`) except the null-settings open-fail
  (design §5.1).
- **File:** `app/apps/web/src/lib/guardrails/sending-gate.ts` (new). Imports `enforceSendingIdentity`
  (`sending-identity.ts:61`), `getTenantSettings` + `DEFAULTS` (T1), `email_optouts`/`activities` schema.
- **Verify:** `tsc --noEmit` clean; the file imports `enforceSendingIdentity` (orphan now has a caller).
- **Test:** `__tests__/sending-gate.test.ts` — table-drive `evaluateSend` over `{mode × isCold × sentToday
  vs cap × suppressed}`: assert `code` for `cold-on-primary-blocked`, `primary-cap-hit`, external/managed
  pass-through, managed-requested bridge; **opt-out precedence** (suppressed → `opted_out` even when mode
  would allow); **fail-closed** (mock throwing `getTenantSettings` → `send:false`); **EC-1** null settings →
  `send:true`. 100% branch coverage of the new file.

## T3 — Tenant-TZ send-window helper `isWithinSendWindow` / `localClock`

- **Action:** Create the pure window helper per design §5.4, reusing `resolveTimezone` from
  `lib/voice/quiet-hours.ts:45`, using `Intl.DateTimeFormat` (no tz lib), with a try/catch → default TZ
  fallback (EC-3). `isWithinSendWindow(now, tz, { sendDays, sendWindowStart, sendWindowEnd })`.
- **File:** `app/apps/web/src/lib/emails/send-window.ts` (new).
- **Verify:** `tsc --noEmit` clean.
- **Test:** `__tests__/send-window.test.ts` — freeze `now` at a UTC instant inside the UTC window but outside
  `Europe/Zurich`'s → `false`; reverse instant → `true`; `sendDays` exclusion (Sunday) → `false`; EC-2
  (`undefined` tz → `Europe/Paris`); EC-3 (malformed tz string → default, no throw). 100% branch coverage.

## T4 — Wire `evaluateSend` into all 5 send chokepoints (item 1 + item 3 for C3/C5)

Do these as five small, independent edits (one commit each is fine). Each inserts the gate **after** the
existing `isRecipientAllowed` test-mode check and **before** transport, and maps `send:false` to that path's
existing "not sent" action (design §4).

- **T4a — C1 campaign cron.** In `step.run(\`send-${email.id}\`)` after the test-mode block
  (`inngest/email-send-worker.ts:259-271`) and after mailbox resolution (`:278`), call `evaluateSend({
  tenantId, toAddress, sentTodayFromPrimary: mailbox.sentToday })`. `cold-on-primary-blocked` /
  `managed-setup-pending` / `opted_out` → `failed` with `reason` (`:404-415` shape); `primary-cap-hit` →
  re-`queued` with reason (mirror `:321-331`).
  - **Verify:** a cold row on `primary-with-caps` is not sent; `resend.emails.send` spy not called.
  - **Test:** `__tests__/email-send-worker.sending-gate.test.ts` (see T-tests note). Removing the
    `evaluateSend` call makes it fail (AC-1.6).
- **T4b — C2 single-send.** After the test-mode block (`email-send-worker.ts:567-579`), before
  `resolve-sender` (`:604`). `sentTodayFromPrimary` from the tenant's active mailbox `sentToday`. Map to the
  existing `failed` updates + `return { sent:false, reason }`.
  - **Verify/Test:** `__tests__/send-single-email.sending-gate.test.ts` — blocked row → `failed`, no send.
- **T4c — C3 SMTP cron (also satisfies item 3 for C3).** In `step.run(\`send-${o.id}\`)` after the test-mode
  block (`inngest/outbound-smtp-send.ts:51-62`) and after the `smtp_custom` resolve (`:66-77`), call
  `evaluateSend({ tenantId: o.tenantId, toAddress: o.toAddress, sentTodayFromPrimary: mb.sentToday })`. On
  `send:false` → `failed` update (`:119-127` shape) for opt-out/cold/managed; leave `queued` for cap.
  - **Verify:** an `email_optouts` row for the recipient → row `failed`, `sendViaSmtp` spy not called.
  - **Test:** `__tests__/outbound-smtp.sending-gate.test.ts` — opt-out (`unsubscribe` and `bounce_hard`) and
    cold cases blocked; removing the call fails the test.
- **T4d — C4 interactive.** After the test-mode block (`deliver-interactive.ts:124-126`) and the existing
  opt-out block (`:128-136`), before plan-limit (`:139`), call `evaluateSend({ tenantId, toAddress: to,
  sentTodayFromPrimary })` (primary count from the resolved owner mailbox, resolve it before the gate or
  pass 0 when no owner mailbox). Add a `code:"blocked"` arm to the result union (`:59-65`) for cold/cap;
  `opted_out` keeps its existing arm.
  - **Verify/Test:** `__tests__/deliver-interactive.sending-gate.test.ts` — blocked → `{ ok:false }`, no
    transport call; opt-out still returns `code:"opted_out"`.
- **T4e — C5 meeting route (also satisfies item 3 for C5).** After recipients are resolved + test-mode
  filtered (`route.ts:93-113`), filter `toEmails` through `evaluateSend` (drop `send:false`); if empty →
  403 with the reason. (Per-recipient `sentTodayFromPrimary` is moot here — the route sends via the system
  `FROM_ADDRESS`; pass 0 so only opt-out/cold/mode gate, which is the load-bearing part for C5.)
  - **Verify:** an opted-out attendee is dropped; all-suppressed → 403, no `resend.emails.send`.
  - **Test:** `__tests__/meeting-follow-up.sending-gate.test.ts`.

> **T-tests note (AC-1.6 "actually invoked"):** each of the five tests must import the chokepoint module and
> assert the gate is on the path by observing the *effect* (row state / typed return / HTTP status + the
> transport spy showing zero sends). A `vi.spyOn(sendingGate, "evaluateSend")` assertion that it was called
> with the row's tenant/recipient makes the "invoked on each chokepoint" guarantee explicit and is required
> by the eval.

## T5 — (Item 3 cleanup) Converge existing opt-out checks on `isSuppressed`

- **Action:** Optional convergence so there is one suppression SSOT (AC-3.4): replace the inline
  `email_optouts` lookups in C1 batch pre-filter (`email-send-worker.ts:131-164`), C2 (`:546-565`), and C4
  (`:128-136`) with calls to `isSuppressed` (or leave them and rely on `evaluateSend`'s own check — they are
  idempotent). Pick one and document it inline. Do **not** weaken the C1 batch behavior (it marks blocked
  rows `failed` in bulk — keep that).
- **File:** `email-send-worker.ts`, `deliver-interactive.ts`.
- **Verify:** existing email-worker + deliver-interactive opt-out tests still pass.
- **Test:** extend `__tests__/sending-gate.test.ts` if logic moved into `isSuppressed`; otherwise none.

## T6 — Gate `signalAutoEnroll` through `enforceAgentApprovalMode` (item 2)

- **Action:** Per design §5.2, add a `step.run("approval-gate", …)` **after** `check-enrolled`
  (`inngest/signal-to-sequence.ts:193-209`) and **before** `enroll-contacts` (`:213`). Load mode via
  `getTenantSettings` + `readApprovalMode` (reactor pattern, `agent-reactor.ts:160-161`), call
  `enforceAgentApprovalMode({ mode, action: "sequence-enrollment", confidence: 0.9 })`. If `!gate.allowed`:
  `recordAgentAction({ tenantId, actionType:"sequence-enrollment", awaitingApproval:true, payload:{…,
  queueAs, reason} })` (`agent-actions.ts:30-49`) and `return { skipped:true, deferred:true, reason }`. If
  `allowed`: fall through to the existing enroll/track/deal/notify steps **unchanged**.
- **File:** `app/apps/web/src/inngest/signal-to-sequence.ts` (imports: `getTenantSettings`,
  `enforceAgentApprovalMode`, `readApprovalMode`, `recordAgentAction`).
- **Verify:** with `review-each`, the function returns deferred and inserts neither `sequenceEnrollments`
  nor `deals`.
- **Test:** `__tests__/signal-auto-enroll.approval.test.ts` — mock `getTenantSettings` per mode; spy
  `db.insert`:
  - `review-each` → no enroll insert, no deal insert, `recordAgentAction` called, `{ skipped, deferred }`.
  - `auto-high-confidence` → same (outbound→confirm; comment cites CLE-10 design §6.1).
  - a mode/confidence yielding `execute` → exactly one enroll loop + one deal insert + notify (parity).
  - ineligible signal (open deal) short-circuits **before** the gate (no `getTenantSettings` call) — proves
    ordering (AC-2.5).
  - **Fallback (design §5.2):** if `agent_actions` cannot represent the enrollment kind, switch the deferred
    branch to skip-and-notify (reuse the existing `notify` step text) and assert no enroll/deal — the test's
    "no autonomous enroll" assertions are unchanged.

## T7 — (Covered by T4c/T4e) opt-out on SMTP + meeting paths

- **Action:** No separate code — item 3 for C3 and C5 is delivered by the `evaluateSend` insertions in T4c
  and T4e (the gate calls `isSuppressed` first). This task is the **explicit verification** that those two
  paths now suppress.
- **Verify:** `grep` shows `evaluateSend`/`isSuppressed` reachable from `outbound-smtp-send.ts` and
  `send-follow-up/route.ts`.
- **Test:** the opt-out cases in `outbound-smtp.sending-gate.test.ts` (T4c) and
  `meeting-follow-up.sending-gate.test.ts` (T4e), including a `reason:"bounce_hard"` row (AC-3.3).

## T8 — Replace the UTC send-window compare with the TZ helper (item 4)

- **Action:** In C1, thread the tenant `timezone` into the per-tenant `mailboxMap` build
  (`email-send-worker.ts:185-246` — add a `getTenantSettings(tid)` read once per tenant and store
  `timezone`), then replace the inline UTC block (`:303-308`) with
  `isWithinSendWindow(new Date(), mailbox.timezone, mailbox)` (T3). Keep the re-queue branch (`:309-318`)
  unchanged.
- **File:** `app/apps/web/src/inngest/email-send-worker.ts`.
- **Verify:** `grep` confirms `now.getUTCDay()` / `now.getUTCHours()` are gone from the send-window path;
  `tsc` clean.
- **Test:** `__tests__/email-send-worker.tz-window.test.ts` — tenant `timezone:"Europe/Zurich"`, clock at a
  UTC instant outside Zurich's window → row re-`queued`; an instant inside Zurich's window → proceeds to
  cap/plan; tenant with no timezone (EC-2) uses `Europe/Paris`. (Reuses T3's unit coverage; this asserts the
  worker reads the tenant TZ, not UTC.)

## T9 — Failure-mode tests (fail-closed)

- **Action:** Add explicit fail-closed assertions per design §7 / requirements EC-3/EC-6.
- **File:** the per-chokepoint test files + `sending-gate.test.ts`.
- **Verify/Test:** mock `evaluateSend`'s lookups to throw → C1/C3 rows not marked `sent`, C4 returns
  `{ ok:false }`, C5 returns 5xx without dispatch; mock `Intl.DateTimeFormat` to throw → `localClock` returns
  default-TZ clock, worker still decides (no crash). `isColdRecipient` lookup error → treated as cold
  (`send:false` on default mode).

## T10 — Regression + drift guards

- **Action:** Add greps to `regression.sh` (or a `__tests__/cle13-wiring.test.ts`): (a) `sending-gate.ts`
  imports `enforceSendingIdentity`; (b) each of the five chokepoint modules imports the shared gate; (c) the
  send-window path no longer calls `getUTCDay`/`getUTCHours`; (d) `OUTBOUND_TEST_MODE` behavior unchanged
  (the existing recipient-guardrail tests pass).
- **File:** `regression.sh` and/or `app/apps/web/src/__tests__/cle13-wiring.test.ts`.
- **Verify:** `regression.sh` green.
- **Test:** the wiring test itself.

## T11 — Type-check, full suite, doc-update

- **Action:** `pnpm --filter web exec tsc --noEmit` 0 errors; run `regression.sh`; run the new + adjacent
  suites (email-worker, single-send, deliver-interactive, outbound-smtp, meeting route, visitor-fanout,
  approval-mode). Update `_specs/chat-live-executor/_SPEC-AUDIT.md` if it tracks per-feature status; confirm
  no frozen contract in the README moved (none should).
- **File:** —.
- **Verify:** all green; `git diff --stat` shows only the intended files (the 2 new lib files, the 5
  chokepoint modules, `signal-to-sequence.ts`, `tenant-settings.ts` one-line export, tests, `regression.sh`).
- **Test:** the whole suite is the test.

---

### Task → AC / item coverage

| Task | Item | Requirements AC |
|---|---|---|
| T1 | 1 | (enabler for EC-1) |
| T2 | 1, 3 | AC-1.1-1.5, AC-3.1-3.4, EC-1, EC-6 |
| T3 | 4 | AC-4.1-4.4, EC-2, EC-3 |
| T4a-e | 1 (+3 for C3/C5) | AC-1.1-1.6, AC-3.1-3.3 |
| T5 | 3 | AC-3.4 |
| T6 | 2 | AC-2.1-2.5, EC-5 |
| T7 | 3 | AC-3.1-3.3 (verification) |
| T8 | 4 | AC-4.1-4.3 |
| T9 | all | EC-3, EC-6, fail-closed (§3 doctrine) |
| T10/T11 | all | eval steps 1, 7, 8 |
