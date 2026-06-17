# CLE-13 — Send-guardrail hardening — Requirements

> Constitution: `_specs/chat-live-executor/README.md`. Milestone **M2** (checkpoint after CLE-13).
> Depends on: **CLE-10** (`decideAction` / `enforceAgentApprovalMode` is the single decision authority —
> README §3.5bis; CLE-10 design §2.1, §6.1).
> Audit source: `_research/chat-task-executor-audit-2026-06-16.md` §0 (finding 2), §1.3 (Guardrails,
> Background autonomy), §6.2, §6.4, §6.5.

This feature closes the four outbound-guardrail holes the audit found. They are **independent** — each is
testable at its own enforcement point — and they share nothing except the doctrine **fail-closed: when a
guardrail cannot decide, do not send**. None of them adds a schema migration; all the columns and tables
they need already exist (`tenant_settings.sendingMailboxMode/sendingDailyCapPrimary/sendingAllowColdOnPrimary`
at `lib/config/tenant-settings.ts:242-252`, `tenant_settings.timezone:158`, `email_optouts` at
`db/schema/outbound.ts:333-345`, `connected_mailboxes.sendWindowStart/End/sendDays:259-261`).

---

## 1. User story

> As the founder whose primary domain and prospect relationships are on the line, I want every outbound
> action the agent can take — campaign sends, single sends, SMTP sends, interactive composer/meeting
> follow-ups, and the signal-driven auto-enrollment loop — to pass the **same** safety gates the product
> already promises in Settings (primary-domain protection, daily caps, opt-out/suppression, tenant-local
> send windows) and the **same** approval authority as every other agent action, so the agent can never
> silently torch my deliverability, email someone who unsubscribed or hard-bounced, send in the middle of
> a recipient's night, or enroll a company and open a deal without my configured approval mode allowing it.

The four items map 1-to-1 to audit findings:

| Item | Audit finding | What is wrong today |
|---|---|---|
| **(1)** wire `enforceSendingIdentity` into the 5 send chokepoints | §0 finding 2, §6.2 | `lib/guardrails/sending-identity.ts` is **orphan code**: configurable in Settings, persisted, documented as gating "every outbound email" (`tenant-settings.ts:225`), but imported by **0 send paths**. Primary-domain protection and the primary daily cap never run. |
| **(2)** route `signalAutoEnroll` through `decideAction` | §6.4 | `inngest/signal-to-sequence.ts:34` enrolls up to 5 contacts (`:211-224`) and creates a deal (`:240-252`) with **no approval check** — bridled in prod only by "0 active sequences". |
| **(3)** opt-out/suppression + hard-bounce on SMTP + meeting-follow-up | §6.5 | The SMTP cron (`inngest/outbound-smtp-send.ts:48-62`) and the meeting-follow-up route (`app/api/meetings/[id]/notes/send-follow-up/route.ts:93-102`) send **without** querying `email_optouts`. The campaign cron, single-send, and `deliverInteractiveEmail` all do query it — these two skip it. |
| **(4)** compute send windows in the tenant's timezone | §6.5 | `email-send-worker.ts:303-308` computes the current day/time from `now.getUTCDay()` / `now.getUTCHours()` — **UTC, not the tenant timezone** — so an `08:00-18:00` window is enforced against UTC wall-clock, off by the tenant's offset. |

---

## 2. EARS acceptance criteria

Conventions: **WHEN** = trigger, **WHILE** = state precondition, **THE SYSTEM SHALL** = required behavior.
"send chokepoint" = one of the five: campaign cron (`processOutboundEmails`), event single-send
(`sendSingleEmail`), SMTP cron (`dispatchOutboundSmtp`), interactive (`deliverInteractiveEmail`), meeting
follow-up route.

### Item (1) — `enforceSendingIdentity` wired into all 5 chokepoints

- **AC-1.1** WHILE `sendingMailboxMode === "primary-with-caps"` and `sendingAllowColdOnPrimary === false`,
  WHEN a chokepoint is about to send a **cold** email (recipient has no prior inbound/outbound history with
  the tenant) from the primary mailbox, THE SYSTEM SHALL **not** send it, SHALL leave the row recoverable
  (campaign/SMTP: re-`queued` or `failed` with reason `cold-on-primary-blocked`; interactive/route: return
  a typed refusal), and SHALL surface the human-readable `reason`.
- **AC-1.2** WHILE `sendingMailboxMode === "primary-with-caps"`, WHEN the number of sends already dispatched
  from the primary mailbox today (tenant-local day) is `>= sendingDailyCapPrimary`, THE SYSTEM SHALL not
  send and SHALL report `primary-cap-hit`. (Distinct from the per-mailbox `dailyLimit` ramp in
  `email-send-worker.ts:29-50`, which still applies; both must pass.)
- **AC-1.3** WHILE `sendingMailboxMode === "external-connected"` OR `"elevay-managed-active"`, WHEN any
  chokepoint sends, THE SYSTEM SHALL allow the send (the gate returns `allowed:true`) — the external/managed
  provider owns deliverability risk, so cold/cap are not gated there.
- **AC-1.4** WHILE `sendingMailboxMode === "elevay-managed-requested"`, WHEN a chokepoint is about to send a
  **cold** email, THE SYSTEM SHALL not send (`managed-setup-pending`); WHEN it is about to send a **warm**
  email under cap, THE SYSTEM SHALL allow it (bridge via primary).
- **AC-1.5** WHEN `enforceSendingIdentity` is invoked at a chokepoint, THE SYSTEM SHALL pass the **real**
  `isCold` (computed from that tenant's activity, not hard-coded) and the **real** `sentTodayFromPrimary`
  (today's primary-mailbox count), so the decision reflects live state.
- **AC-1.6** (regression guard) For **each** of the 5 chokepoints there SHALL exist a test that fails if the
  chokepoint stops calling the shared sending-identity pre-send gate (the orphan must stay wired).

### Item (2) — `signalAutoEnroll` gated by `decideAction`

- **AC-2.1** WHEN `signalAutoEnroll` has resolved an active sequence and ≥1 enrollable contact, WHILE the
  tenant's effective approval mode is `review-each`, THE SYSTEM SHALL **not** enroll and **not** create a
  deal; it SHALL record a deferred/pending agent action (the same lane the reactor uses) and return a
  `skipped`/`deferred` result with the decision reason.
- **AC-2.2** WHILE the effective approval mode is `batch-daily`, WHEN `signalAutoEnroll` would enroll, THE
  SYSTEM SHALL queue the enrollment into the daily-review lane (not execute it inline).
- **AC-2.3** WHILE the effective approval mode is `auto-high-confidence`, WHEN `signalAutoEnroll` would
  enroll, THE SYSTEM SHALL still **not** auto-enroll inline, because enrollment is classified `outbound`
  (`sequence-enrollment` in CLE-10's `GUARDED_ACTION_METADATA`, confirm:`always`) and CLE-10 makes outbound
  always `confirm` under autonomy (CLE-10 design §6.1) — it SHALL defer to per-item review.
- **AC-2.4** The enroll + deal-create SHALL fire inline **only** when the decision authority returns
  `execute` (i.e. `enforceAgentApprovalMode(...).allowed === true` for `sequence-enrollment`). In every
  non-execute disposition the existing side effects (enroll, `trackPipeline`, deal insert, notify) SHALL be
  skipped.
- **AC-2.5** The gate SHALL run **after** the existing eligibility checks (open deal, anti-ICP exclusion,
  contacts-with-email, active-sequence) and **before** the first write (`enroll-contacts`,
  `signal-to-sequence.ts:213`), so an ineligible signal is still cheaply short-circuited and a gated one
  produces no partial enrollment.

### Item (3) — opt-out/suppression on SMTP + meeting-follow-up

- **AC-3.1** WHEN the SMTP cron (`dispatchOutboundSmtp`) selects a queued row whose `toAddress` (lowercased)
  has an `email_optouts` row for that tenant, THE SYSTEM SHALL mark the row `failed` with reason
  `Recipient is on the opt-out list` and SHALL NOT call `sendViaSmtp` for it.
- **AC-3.2** WHEN the meeting-follow-up route resolves its recipient list, THE SYSTEM SHALL drop every
  recipient with an `email_optouts` row for the tenant; WHEN every resolved recipient is suppressed, THE
  SYSTEM SHALL not send and SHALL return a clear error (no follow-up dispatched, `followUpSentAt` unset).
- **AC-3.3** Because a hard bounce is persisted as an `email_optouts` row with `reason = "bounce_hard"`
  (`db/schema/outbound.ts:339`), the suppression check in AC-3.1/AC-3.2 SHALL cover hard-bounced addresses
  with **no** extra query — the single `email_optouts` lookup is the suppression + hard-bounce check.
- **AC-3.4** The opt-out check SHALL be applied via the **same** helper at both new points and at the
  existing points, so the four email chokepoints that send to prospects (campaign cron, single-send, SMTP
  cron, interactive, meeting follow-up) all suppress identically.

### Item (4) — send windows in tenant timezone

- **AC-4.1** WHEN `processOutboundEmails` evaluates a row's send window, THE SYSTEM SHALL compute the
  current day-of-week and `HH:MM` in the **tenant's** timezone (`tenant_settings.timezone`, falling back to
  the existing `resolveTimezone` default), not in UTC.
- **AC-4.2** WHILE the tenant timezone makes the current local time **outside** the mailbox
  `[sendWindowStart, sendWindowEnd]` window or the local day not in `sendDays`, WHEN the cron reaches the
  row, THE SYSTEM SHALL re-queue it with `Outside send window, will retry` (unchanged behavior, correct
  clock).
- **AC-4.3** WHILE the tenant timezone makes the current local time **inside** the window and the local day
  in `sendDays`, WHEN the cron reaches the row, THE SYSTEM SHALL proceed to the cap/plan checks (window no
  longer wrongly blocks because UTC happened to be outside).
- **AC-4.4** The window computation SHALL be a single pure helper reused by every path that honors send
  windows, so the UTC/TZ logic cannot drift between paths.

---

## 3. Edge cases

- **EC-1 — No sending-identity config (legacy tenant).** A tenant with `sendingMailboxMode` undefined: the
  shared pre-send gate SHALL apply the documented DEFAULTS (`primary-with-caps`, cap 20, cold blocked —
  `tenant-settings.ts:456-458` via `getTenantSettings` merge). If, and only if, the design chooses to treat
  "no settings row at all" as "preserve today's behavior", that path SHALL allow the send (today's
  behavior) and SHALL be covered by a test asserting exactly that — the audit's instruction "no
  sending-identity config = today's behavior". The chosen rule is stated normatively in design §5.1.
- **EC-2 — Missing timezone.** `tenant_settings.timezone` undefined → `resolveTimezone(undefined)` returns
  `Europe/Paris` (existing default, `quiet-hours.ts:11,45-54`). The window is evaluated in that default,
  never crashing on an absent field.
- **EC-3 — Invalid timezone string.** A malformed IANA string → `Intl.DateTimeFormat` throws; the helper
  SHALL catch and fall back to the default timezone (fail-safe), never throwing out of the cron step.
- **EC-4 — Suppression-list miss / race.** A recipient unsubscribes after the row is queued but before the
  cron runs: the per-row check at send time (not only the batch pre-filter) SHALL still catch it. The SMTP
  cron currently has **no** check at all, so adding the per-row lookup closes the race for that path.
- **EC-5 — Signal arrives during quiet hours.** `signalAutoEnroll` itself does not send email — it enrolls;
  the *first step* is queued (`nextStepAt: new Date()`, `signal-to-sequence.ts:220`) and the **campaign
  cron** applies the (now TZ-correct) send window. So a signal at 03:00 tenant-local that the approval mode
  permits SHALL enroll, but the first email SHALL wait for the send window (item 4). No new behavior needed
  in item 2 for this; the test asserts the interaction (enroll allowed, email held).
- **EC-6 — `isCold` indeterminate.** If the cold/warm computation cannot resolve (e.g. activity lookup
  errors), the gate input SHALL default `isCold = true` (treat unknown as cold → the safest rail, which is
  blocked on the default mode), never `false`.
- **EC-7 — Cap counter source.** `sentTodayFromPrimary` for `primary-with-caps`: derived from the primary
  mailbox's `sentToday` (reset at midnight UTC by `cronDailyMailboxReset`, `email-send-worker.ts:711`).
  Design §5.3 notes the known coarseness (UTC-day reset vs tenant-day cap) and scopes a precise
  tenant-day count as out of scope for CLE-13 (the cap still protects; the boundary is at most one
  UTC-day off). This is documented, not silently shipped.
- **EC-8 — External/managed mode skips cold+cap but still suppresses + windows.** Items 1 and 3/4 are
  orthogonal: `external-connected` returns `allowed:true` from `enforceSendingIdentity` (item 1) but the
  opt-out check (item 3) and the send window (item 4) still apply on the paths that run them.

---

## 4. Out of scope

- **The undo window for outbound (CLE-11).** Programmable-delay "unsend" is CLE-11; CLE-13 only *gates*
  sends, it does not add a cancelable delay.
- **The body of `decideAction` / the level→mode mapping (CLE-10).** CLE-13 **consumes** `decideAction` /
  `enforceAgentApprovalMode` exactly as shipped by CLE-10; it does not modify their logic, signature, or the
  `autonomyConfig.level` derivation. If CLE-10 is not yet merged on the branch base, see design §6.2 for the
  thin local fallback (still single-authority).
- **DNC / quiet-hours / caps on *calls*** (audit §6.5 last clause). CLE-13 is email + enrollment only;
  call-side guardrails are a separate feature.
- **The full role × action permission matrix (CLE-12).** `decideAction` already carries the minimal viewer
  floor; CLE-13 relies on it but does not extend permissions.
- **Reworking `OUTBOUND_TEST_MODE`** (`recipient-guardrail.ts`). It already covers all 5 chokepoints and is
  the one strong guardrail; CLE-13 leaves it untouched and layers the new gates *alongside* it.
- **A new sending provider, EmailEngine deployment, or warmup changes.** Untouched.

---

## 5. Evaluation steps (Phase 6, hostile QA on the live branch)

1. **Orphan is wired (item 1).** `grep` for `enforceSendingIdentity` / the shared pre-send gate import in
   all five send modules; assert ≥1 import each. Run the per-chokepoint invocation tests (AC-1.6): each must
   fail if the call is removed.
2. **Cold-on-primary blocked (AC-1.1).** Unit: tenant `primary-with-caps` + `allowColdOnPrimary:false`,
   recipient with no history → gate returns `allowed:false, blockReason:"cold-on-primary-blocked"`; the
   campaign cron leaves the row unsent with that reason; `resend.emails.send` spy not called.
3. **Primary cap enforced (AC-1.2).** `sentTodayFromPrimary = sendingDailyCapPrimary` → gate
   `primary-cap-hit`; send suppressed on all 5 paths in unit tests.
4. **`signalAutoEnroll` refuses when mode disallows (AC-2.1/2.3/2.4).** Drive the function with
   `review-each` and with `auto-high-confidence`: assert **no** `sequenceEnrollments` insert and **no**
   `deals` insert (DB spies), and a deferred/skip result with the reason. Then drive it with a mode/role
   that yields `execute` and assert exactly one enroll path + one deal insert (parity with today).
5. **Opt-out never emailed on SMTP + meeting paths (AC-3.1/3.2/3.3).** Seed an `email_optouts` row
   (`reason:"unsubscribe"` and a second `reason:"bounce_hard"`); SMTP cron marks the row `failed` and does
   not call `sendViaSmtp`; meeting route drops the recipient and 4xx when all are suppressed. Both verified
   with the transport spy showing zero sends to the suppressed address.
6. **Quiet hours respected in tenant TZ (AC-4.1-4.3).** Freeze clock at a UTC instant that is *inside* the
   window in UTC but *outside* in `Europe/Zurich`, and vice-versa; assert the row is held vs sent according
   to the **tenant-local** clock, not UTC. Include a `Europe/Paris` default (no timezone set) case (EC-2)
   and a malformed-timezone fallback (EC-3).
7. **No regressions.** `regression.sh` green; existing suites for the campaign cron, single-send,
   `deliverInteractiveEmail`, and the visitor-fanout (`signals/auto-enroll`) still pass; `tsc --noEmit` 0
   errors; `OUTBOUND_TEST_MODE` behavior unchanged (still blocks non-allowlisted on all paths).
8. **Fail-closed proof.** Force each new gate's lookup to throw (mock the DB/`Intl`): assert the path does
   **not** send (campaign/SMTP row not marked `sent`; route 5xx without dispatch; window helper falls back
   to default TZ rather than sending wrongly).
