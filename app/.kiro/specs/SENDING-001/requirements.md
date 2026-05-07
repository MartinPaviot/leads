# SENDING-001 — Warmup Engine: Requirements

## Audit pillar
Sending infrastructure / Cold sending readiness (Blocker #1 + #2 from the codebase audit).

## Problem statement
The `warmupEmails` table (`apps/web/src/db/schema/outbound.ts:199-210`) and `connectedMailboxes` columns `warmupStartedAt`, `warmupDailyTarget`, `warmupCompletedAt` (lines 136-138) are scaffolded but no Inngest function drives them. New mailboxes either (a) sit at status `warming_up` indefinitely, or (b) get used for cold sending immediately by users who don't realize the infrastructure isn't running. Either way, deliverability collapses on first cold send.

## Acceptance criteria (EARS notation)

### AC-1: Warmup cron exists and ramps daily volume
WHEN a `connectedMailbox` row exists with `status = 'warming_up'` and `warmupStartedAt IS NOT NULL`,
the warmup Inngest cron SHALL fire at least once per hour during the mailbox's local business window (07:00-19:00 in `timezone`),
AND SHALL send a number of warmup emails matching the daily curve defined in `getDailyTarget(daysSinceStart)`,
AND SHALL update `warmupEmails.sentAt` for each send.

### AC-2: Daily volume follows the warmup curve
WHEN computing the daily target for a mailbox at day N of warmup,
the engine SHALL follow the curve: day 1=5, day 2=8, day 3=12, day 4=18, day 5=25, day 6=35, day 7=45, day 8=55, day 9=65, day 10+=increment 10/day until reaching `connectedMailboxes.dailyLimit`.
**Variance:** actual daily sends SHALL be `target ± 20%` (random) so volumes don't look mechanically smooth.

### AC-3: Warmup looks like real inbox behavior
WHEN sending a warmup email, the engine SHALL randomly select:
- A subject from the warmup-subjects pool (1500+ realistic phrasings, in user's `language`)
- A body from the warmup-bodies pool (matching subject's tone register: question / FYI / thanks / suggestion / quick-update)
- A recipient from the tenant's other warming mailboxes OR the cross-tenant warmup network if opted-in
AND the engine SHALL send replies (at the recipient mailbox) for at least 50% of received warmup emails within 0.5-6 hours,
AND SHALL mark at least 30% of received warmup emails as `important/starred`,
AND SHALL archive (without reply) ~10% to mimic inbox triage.

### AC-4: Cross-mailbox conversation threading
WHEN a warmup email is sent and the recipient is also a warming mailbox, replies SHALL preserve `In-Reply-To` and `References` headers so threads form correctly.
The engine SHALL extend approximately 25% of warmup conversations beyond a single reply (back-and-forth of 2-4 messages) to mimic real conversation depth.

### AC-5: Time-of-day distribution
WHEN scheduling warmup sends within a day, the engine SHALL distribute sends following a non-uniform curve weighted toward 09:00-11:00 and 14:00-16:00 (peak inbox activity), with no sends between 22:00 and 06:00 in the mailbox's local timezone.

### AC-6: Health-aware throttling
IF a warming mailbox's `bounceCount7d > 2` OR `spamComplaints7d > 0` OR `healthScore < 60`,
the engine SHALL pause sends for 24 hours, decrement the daily target by 30% on resume, and write to `coachingInsights` with `insightType = 'process_gap'`.

### AC-7: Completion criterion
WHEN a mailbox has completed N consecutive days at the target dailyLimit with zero bounces and zero spam complaints (where N = 3 for `dailyLimit ≤ 30`, N = 5 for `dailyLimit ≤ 100`, N = 7 otherwise),
the engine SHALL set `connectedMailboxes.warmupCompletedAt = NOW()` and `status = 'active'`.

### AC-8: Readiness surface (phronesis layer)
WHEN warmup is in progress,
the deliverability dashboard (`apps/web/src/app/(dashboard)/deliverability/page.tsx`) SHALL display warmup progress (% complete, days elapsed, current daily volume vs target, projected completion date),
AND SHALL surface a readiness verdict per mailbox: `not_ready` (< 50% of dailyLimit reached) | `low_risk_only` (50-80%, can send to Tier 1 friendly contacts) | `ready` (warmupCompletedAt set).
The verdict is *informational*; the decision to send cold is the user's.

### AC-9: Send guardrail integration
WHEN the email-send-worker (`apps/web/src/inngest/email-send-worker.ts`) attempts to dispatch a cold outbound email,
IF the source mailbox's `warmupCompletedAt IS NULL` AND the email's `intent !== 'reply'`,
the send SHALL be blocked with a structured error and an actionable message in `outboundEmails.failureReason` ("Mailbox is still warming up — readiness: <verdict>. Override allowed via …").

### AC-10: Override path
WHEN a user explicitly overrides the guardrail (UI affordance, logged action),
the engine SHALL log the override to `coachingInsights` and proceed with the send — but flag the mailbox as `override_used` and reduce future daily target by 50% for the next 3 days.

## Edge cases
- **Mailbox disconnected mid-warmup:** pause warmup, retain progress, resume on reconnect.
- **OAuth token expired:** treat as disconnected; surface to dashboard with renewal CTA.
- **Cross-tenant pool not opted in:** fall back to single-tenant warmup using only the tenant's own mailboxes (degraded — slower ramp possible if tenant has < 3 mailboxes).
- **User has only 1 mailbox:** warmup network requires ≥ 2 endpoints. If tenant has 1 mailbox and is not opted into the cross-tenant pool, surface a clear blocker in onboarding.
- **Holidays / weekends:** the volume curve does not pause on weekends but reduces by 40% (real inboxes are quieter, not silent).
- **Timezone unknown:** default to `UTC+1` (Paris) since primary ICP is francophone; flag for user confirmation.

## Evaluation steps (Phase 6)
1. Spin up 3 fresh mailboxes (different domains, gmail/outlook/custom SMTP).
2. Start warmup. Observe 14 days.
3. After day 14, send 50 cold emails from each mailbox to a controlled list (mix of Gmail/Outlook/Microsoft/custom).
4. Measure: inbox placement rate, spam folder rate, bounce rate.
5. **Pass criterion:** ≥ 90% inbox placement on Gmail, ≥ 85% on Outlook, ≤ 1% spam folder.
6. Run identical test against a control (3 fresh mailboxes, no warmup, sent immediately). **Pass criterion:** warmup cohort beats control by ≥ 20 percentage points on inbox placement.
