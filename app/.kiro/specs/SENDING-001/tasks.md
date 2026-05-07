# SENDING-001 — Warmup Engine: Tasks

All tasks are eval-first: write the test/assertion before the implementation. Each commits independently. Order is sequential — later tasks depend on earlier ones.

---

## Task 1: Schema migration — extend `connectedMailboxes` and `warmupEmails`, add `warmupNetworkParticipants`
**Estimate:** 1h
**Eval:** Migration runs idempotently. Drizzle schema diff matches.
**Implementation:**
1. Add columns to `connectedMailboxes` and `warmupEmails` per design.md "Data model deltas".
2. Create new table `warmupNetworkParticipants`.
3. Generate migration: `pnpm --filter web drizzle-kit generate`.
4. Review SQL, run on local DB, run on staging.
**Verify:** `pnpm --filter web drizzle-kit push` succeeds; existing rows in `connectedMailboxes` get default values.

---

## Task 2: Pure functions — daily target curve + recipient selection + time-of-day distribution
**Estimate:** 2h
**Eval:** `apps/web/src/__tests__/warmup-curve.test.ts`
- `getDailyTarget(1, 100) = 5`, `getDailyTarget(7, 100) = 45`, `getDailyTarget(20, 100) = 100` (capped)
- `getDailyTarget(20, 30) = 30` (capped to mailbox limit)
- `getDailyTarget(N, limit)` is non-decreasing in N until cap
- `selectRecipient` prefers same-tenant pool, falls back to network if opted in, returns null if both empty
- `selectRecipient` does not return `sourceMailbox` itself
- `selectRecipient` excludes mailboxes whose `bounceCount7d > 2`
- `getHourlyDistribution(timezone)` produces 24 weights summing to 1.0, peaks at 09-11 and 14-16, 0 between 22-06 in given timezone
**Implementation:** `apps/web/src/lib/warmup/engine.ts` — pure functions only, no I/O.
**Verify:** `pnpm vitest run warmup-curve`

---

## Task 3: Subject/body pools (FR + EN, 500 entries each minimum to start)
**Estimate:** 3h
**Eval:** `apps/web/src/__tests__/warmup-pools.test.ts`
- Loads `subjects-fr.json` and validates ≥ 500 entries, all with `register` ∈ {question, fyi, thanks, suggestion, quick-update}
- No subject appears more than 3 times across the pool (diversity check)
- Every subject has a matched body in `bodies-fr.json` for the corresponding `register`
- Same for EN
- `buildWarmupMessage()` produces a message whose subject is from the pool and body has all placeholders substituted
**Implementation:**
1. Generate the pools — script `scripts/generate-warmup-pools.ts` that uses an LLM in batch mode to produce 500 entries per language, then deduplicates and validates.
2. Save as `apps/web/src/lib/warmup/pools/{subjects,bodies}-{fr,en}.json`.
3. Implement `buildWarmupMessage()` with placeholder substitution from a small fact pool (`apps/web/src/lib/warmup/fact-pool.ts`).
**Verify:** `pnpm vitest run warmup-pools`

---

## Task 4: Reply behavior simulator (probabilistic + threading)
**Estimate:** 2h
**Eval:** `apps/web/src/__tests__/warmup-reply.test.ts`
- `shouldReplyTo({ register: "question", … })` returns true ~70% of runs over 1000 trials
- `shouldReplyTo({ register: "fyi", … })` returns true ~30% of runs
- `shouldReplyTo` returns false if thread depth > 4 (cap conversations)
- `buildReplyMessage` preserves `In-Reply-To` and `References` headers
- `buildReplyMessage` body register matches the `expectedReplyRegister` of the parent
**Implementation:** `apps/web/src/lib/warmup/reply-behavior.ts`
**Verify:** `pnpm vitest run warmup-reply`

---

## Task 5: Inngest cron `warmup-engine-tick` — orchestration only (no actual sends yet, dry-run mode)
**Estimate:** 2h
**Eval:** `apps/web/src/__tests__/warmup-engine-cron.test.ts`
- Cron in dry-run mode lists warming mailboxes, computes per-mailbox sends due this tick, returns plan without dispatching
- Plan respects daily target curve (Task 2)
- Plan respects time-of-day distribution (no plans for 22:00-06:00 local)
- Plan excludes mailboxes flagged for AC-6 health throttling
**Implementation:** `apps/web/src/inngest/warmup-engine.ts` with env-flag `WARMUP_DRY_RUN=true`.
**Verify:** `pnpm vitest run warmup-engine-cron` then deploy to staging with `WARMUP_DRY_RUN=true`, check Inngest dashboard for tick logs.

---

## Task 6: Wire actual sends through `email-send-worker` + persist `warmupEmails` rows
**Estimate:** 3h
**Eval:** `apps/web/src/__tests__/warmup-send-integration.test.ts` (uses Resend test mode + DB)
- Running cron with 2 mailboxes A and B writes a `warmupEmails` row for the send and dispatches via the existing send worker
- Sent email carries header `X-Elevay-Warmup: true`
- Reply-handler (existing) ignores incoming emails with that header (regression test on `reply-handler.test.ts`)
- Send failure (mock SMTP 535) marks mailbox `auth_expired` and pauses warmup
**Implementation:**
1. Update `warmup-engine.ts` to call `enqueueOutboundSend()` (existing helper in send worker) instead of dry-run plan.
2. Patch `apps/web/src/inngest/reply-handler.ts` to skip emails with `X-Elevay-Warmup: true` (return early).
3. Add `intent`-aware send path so guardrail in AC-9 (Task 8) doesn't block warmup sends.
**Verify:** `pnpm vitest run warmup-send-integration`; staging cron actually sends between two test mailboxes.

---

## Task 7: Reply loop — process incoming warmup emails, send replies, mark important/archive
**Estimate:** 3h
**Eval:** `apps/web/src/__tests__/warmup-reply-loop.test.ts`
- When mailbox A sends warmup to mailbox B, the next cron tick on B's tenant queues a reply (subject to `shouldReplyTo`)
- Replies arrive within 0.5-6 hours (random within window)
- 30% of received warmup emails get marked-important via Gmail/Outlook API (provider-specific; for SMTP-only mailboxes, skip silently and log)
- 10% get archived without reply
- Cap: never more than 4 messages in a single warmup thread
**Implementation:** Extend `warmup-engine.ts` to scan incoming `warmupEmails` rows where `intent IN ('initial', 'thread_continuation')` and `behaviorMarkers.replied IS NOT TRUE`, schedule replies.
**Verify:** `pnpm vitest run warmup-reply-loop`; manually verify in staging that two test mailboxes engage in a multi-message thread.

---

## Task 8: Health-aware throttling + completion criterion (AC-6, AC-7)
**Estimate:** 2h
**Eval:** `apps/web/src/__tests__/warmup-health.test.ts`
- Mailbox with `bounceCount7d = 3` is paused for 24h, daily target reduced by 30% on resume
- Mailbox with `spamComplaints7d > 0` is paused immediately and a `coachingInsights` row is created with `insightType = 'process_gap'`
- Mailbox at `dailyLimit` for 3 consecutive days with zero bounces and `dailyLimit ≤ 30` triggers `warmupCompletedAt = NOW()` and `status = 'active'`
- For `dailyLimit ≤ 100`: 5 days. Otherwise: 7 days.
**Implementation:** Extend `warmup-engine.ts` with health checks before dispatch and completion check at end of each daily window.
**Verify:** `pnpm vitest run warmup-health`

---

## Task 9: Send guardrail integration (AC-9, AC-10)
**Estimate:** 1.5h
**Eval:** `apps/web/src/__tests__/warmup-guardrail.test.ts`
- Cold send from mailbox with `warmupCompletedAt IS NULL` and `intent !== 'reply'` is blocked with structured error
- Reply-intent emails pass through (warmup status irrelevant)
- Override flag (UI param) allows the send, logs to `coachingInsights`, sets `warmupOverrideUsedAt = NOW()`, reduces daily target by 50% for next 3 days
**Implementation:** Extend `apps/web/src/lib/guardrails/sending-identity.ts` with warmup check; add override path through send-worker that respects the flag.
**Verify:** `pnpm vitest run warmup-guardrail`

---

## Task 10: Readiness verdict cache + dashboard surfacing (AC-8)
**Estimate:** 2h
**Eval:** `apps/web/src/__tests__/warmup-readiness.test.ts`
- Nightly job computes `warmupReadinessVerdict` for each warming mailbox (`not_ready | low_risk_only | ready`)
- Mailbox at 30% of dailyLimit shows `not_ready`
- Mailbox at 65% shows `low_risk_only`
- Mailbox with `warmupCompletedAt` shows `ready`
- Deliverability dashboard renders verdict + projected completion date
**Implementation:**
1. Nightly Inngest function `warmup-readiness-cron` (cron `0 2 * * *`).
2. Extend `apps/web/src/app/(dashboard)/deliverability/page.tsx` with the warmup pipeline tile (component `apps/web/src/components/warmup-pipeline-tile.tsx`).
**Verify:** `pnpm vitest run warmup-readiness`; visual check on `/deliverability`.

---

## Task 11: Cross-tenant network opt-in + reciprocity (deferred to Phase 2 if time-constrained)
**Estimate:** 4h
**Eval:** `apps/web/src/__tests__/warmup-network.test.ts`
- Tenant opting in writes a `warmupNetworkParticipants` row
- `selectRecipient` returns cross-tenant mailboxes only when source-tenant has opted in
- Reciprocity tracking: tenant whose ratio falls below 0.5 gets `bannedUntil = NOW() + 7 days`
- Network-sent emails always carry `X-Elevay-Warmup-Network: true` (extension of warmup header)
**Implementation:** New `apps/web/src/lib/warmup/network.ts` + opt-in UI on settings page.
**Verify:** `pnpm vitest run warmup-network`. **Status:** Mark as deferred if Tasks 1-10 + Phase 6 eval consume the 2-week sprint window.

---

## Task 12: Phase 6 eval — real-world deliverability test
**Estimate:** ~14 calendar days (waiting on warmup) + 1 day execution + 1 day analysis
**Eval:** Per the requirements.md "Evaluation steps" — 3 fresh mailboxes, 14 days warmup, then 50 cold sends each, measured against control.
**Pass criterion:**
- ≥ 90% inbox placement on Gmail
- ≥ 85% on Outlook
- ≤ 1% spam folder rate
- Warmup cohort beats no-warmup control by ≥ 20 pp on inbox placement
**On fail:** Document the gap in `_specs/SENDING-001/sprint-report.md`, identify which behavioral pattern is being detected as artificial, iterate.

---

## Sprint sequencing
- Tasks 1-3: parallelizable, do in week 1.
- Tasks 4-7: serial, week 1-2.
- Tasks 8-10: serial, week 2.
- Task 11: defer if needed.
- Task 12: starts as soon as Tasks 1-10 ship to staging.

**Critical path:** Task 1 → 2 → 5 → 6 → 7 → 8 → 9. ~17h of focused engineering. Realistic 2-week sprint with QA + iteration.
