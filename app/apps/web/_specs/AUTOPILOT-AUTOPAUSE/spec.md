# AUTOPILOT-AUTOPAUSE — dead-channel / dead-sequence auto-pause

> **Why first.** Elevay's daily-autopilot (`inngest/daily-autopilot.ts`, behind `DAILY_AUTOPILOT_ENABLED`) will enroll ~100/day. Without an outcome circuit-breaker it reproduces the exact Monaco failure the teardown caught (LinkedIn 0/178, SaaS-Email 549→0, no auto-pause; `MONACO-UI-TEARDOWN.md:950`). The effecting machinery already exists — `sequence_status` enum has `"paused"` and the send cron is status-gated — so a flip-to-paused is immediately effective. This spec adds the missing 20%: the per-sequence outcome metric and the wired pause action.
> Grounded against the code found during the delta pass (`_reports/elevay-vs-monaco-grounded-delta-2026-06-26.md`). Date: 2026-06-26.
>
> **Build target = `main`, NOT `feat/hydration-fidelity`.** The autopilot (`lib/autopilot/*` — 19 files, `inngest/daily-autopilot.ts`) lives on `main`; the current branch was cut from an older main and lacks it. Branch off `main`. Anchors independently verified on `main` (2026-06-26): `inngest/sequence-cron.ts:35-36` (`eq(sequences.status,"active")` join), `lib/analytics/optimizer/db-review.ts:178` (`dbIsAutonomous→false`) + `:183-184` (`dbApplyChange` throws "auto-apply is not implemented (observe-only)"), `inngest/daily-autopilot.ts:57-61` (`getActiveSequenceId` → `status='active'`), `db/schema/outbound.ts:23` (`"paused"` enum) + `:496-497` (`sequences.status` default `'active'` + `pausedAt` **already present**). Internal `lib/autopilot/*` line numbers cited in the grounding were produced from a working tree missing those files — re-confirm them against `main` at build time.

## Spec: P0 #1 — Dead-sequence auto-detect → auto-pause (autopilot circuit-breaker)

> Grounded in the real code. The autopilot engine lives on `main` (`lib/autopilot/*`, `inngest/daily-autopilot.ts`); build this on a branch off `main` so those imports resolve. The `"paused"` value already exists in `sequence_status` (`app/apps/web/src/db/schema/outbound.ts:20-24`) and a paused sequence is already honored at delivery (`app/apps/web/src/inngest/sequence-cron.ts:31-40`) and at autopilot enrollment (`daily-autopilot.ts getActiveSequenceId` selects only `status='active'`). This spec adds the missing outcome metric + the wired, audited, reversible pause action.

### Design philosophy
Deterministic, no-LLM circuit-breaker (the kill-switch must not depend on LLM availability or cost). Two-stage flag mirroring spec-31's observe-only philosophy: `shadow` (detect + notify only) → `enforce` (also flip status). Sequence-level pause only (the `"paused"` enum is sequence-level); per-channel disabling is explicitly out of v1 scope.

## Requirements

**AC1 — dead-sequence detection (GIVEN sufficient data).**
GIVEN an `active` sequence whose enrollments produced `sent >= MIN_SAMPLE` outbound sends in the trailing `WINDOW_DAYS`,
WHEN, over that window, `replyRate < REPLY_FLOOR` AND `positiveReplies == 0` AND `meetingsBooked == 0`,
THEN the detector returns verdict `dead` with a reason string citing the metrics (e.g. `"auto:dead_sequence sent=128 replies=0 meetings=0 over 14d"`).

**AC2 — auto-pause in enforce mode.**
GIVEN a sequence flagged `dead` AND `AUTOPILOT_AUTOPAUSE_MODE=enforce`,
WHEN the cron runs,
THEN `sequences.status` is set to `'paused'` with `paused_reason`, `paused_by='autopilot'`, `paused_at=now()`, tenant-scoped (`WHERE id=… AND tenant_id=…`), AND a `notifications` row is written to the tenant owner (mirroring `inngest/deliverability-monitor.ts:62-71`).

**AC3 — pause is effective immediately (no extra wiring).**
GIVEN a sequence set to `'paused'` by AC2,
WHEN `cron-trigger-sequence-steps` next runs,
THEN no due steps fire for that sequence (the `eq(sequences.status, 'active')` join at `inngest/sequence-cron.ts:35-37` excludes it), AND `daily-autopilot.ts getActiveSequenceId` no longer selects it as the enrollment target.

**AC4 — shadow mode is observe-only.**
GIVEN `AUTOPILOT_AUTOPAUSE_MODE=shadow`,
WHEN a sequence is flagged `dead`,
THEN a notification is written and the detection is logged, but `sequences.status` is NOT mutated.

**AC5 — re-enable path with cooldown.**
GIVEN a sequence auto-paused by AC2,
WHEN a human resumes it (the existing Start/Resume control flips `status` back to `'active'`),
THEN `autopilot_protected=true` and `paused_at` is cleared, AND the detector skips it for `COOLDOWN_DAYS` (default 7) so it is not immediately re-paused; after the cooldown, protection lapses and AC1 applies again.

### Edge cases
- **Zero-data sequence** (`sent == 0`): verdict `insufficient_data`, never paused (0 sends is untested, not dead).
- **Brand-new sequence under the sample floor** (`0 < sent < MIN_SAMPLE`): verdict `insufficient_data`, never paused. Reuse the `minBaseline` guard concept from `lib/analytics/alerts/detect.ts:64`.
- **Manually-pinned / protected sequence** (`autopilot_protected = true` OR `paused_reason` indicates a human action): skip entirely — never auto-pause a human-protected sequence.
- **Multi-channel sequence** (steps span `email` + `linkedin` via `sequence_steps.step_type`, `outbound.ts:76`): compute per-channel diagnostics for the reason string, but v1 pauses the **whole sequence only when the aggregate meets AC1** (all traction dead). A sequence with a dead email channel but a live LinkedIn channel is logged as a `partial_dead` advisory notification, NOT paused. (Per-channel step disabling is a follow-up — `"paused"` is sequence-level.)
- **Already paused/archived/draft**: detector only considers `status='active'` sequences.
- **Idempotent re-run**: re-running the cron on an already-auto-paused sequence is a no-op (status already `'paused'`); the notification is deduped on `(tenantId, sequenceId, day)`.

### Thresholds (defaults, env/setting-overridable)
- `MIN_SAMPLE = 50` (sends over the window below which → `insufficient_data`).
- `WINDOW_DAYS = 14`.
- `REPLY_FLOOR = 0.01` (1% — deliberately well below the 5% benchmark in `lib/.../benchmarks.ts:19` so the breaker is conservative).
- `COOLDOWN_DAYS = 7` (post-resume re-pause suppression).
- `AUTOPILOT_AUTOPAUSE_MODE ∈ {off, shadow, enforce}`, default `off`.

## Design

**Migration (additive, columns on `sequences`).**
File: a new SQL file applied via `db:push` on localdev + `DATABASE_URL_OWNER` on prod (journal frozen at idx 12 per CLAUDE.md — do NOT use the disabled `db:migrate`). On `main` the `sequences` table is at `app/apps/web/src/db/schema/outbound.ts:489-497` and **already has `status` (text, default `'active'`) and `paused_at`** (`outbound.ts:496-497`) — reuse those; add only:
- `paused_reason text` (nullable)
- `paused_by text` (nullable — `'autopilot' | userId`)
- `autopilot_protected boolean not null default false`
- (`paused_at` already exists — do NOT re-add it; AC2 writes the existing column.)

**Stats reader + detector (pure where possible).**
New file `app/apps/web/src/lib/autopilot/sequence-health.ts`:
- `loadSequenceHealth(tenantId, opts): Promise<SequenceHealth[]>` — for each `active` sequence of the tenant, computes `{ sequenceId, sent, replies, positiveReplies, meetingsBooked, replyRate, oldestSendAt, byChannel }` over `WINDOW_DAYS`. Reuse the join shape from `app/apps/web/src/app/api/sequences/[id]/analytics/route.ts:76-130` (`sequenceEnrollments → outboundEmails`, replyRate = replied/sent), generalized to all sequences in one pass. Add the meetings count from `pipeline_events` (`app/apps/web/src/db/schema/campaign.ts:194-224`) filtered to `stage='meeting_booked'` (`lib/analytics/pipeline-tracker.ts:16`), joined by `enrollmentId` when present else `contactId → sequence_enrollments.contactId → sequenceId` (indexes `pe_enrollment_idx`, `pe_contact_idx` exist). `byChannel` splits sends via `sequence_steps.step_type` (`outbound.ts:76`).
- `classifySequence(health, thresholds): { verdict: 'dead'|'insufficient_data'|'healthy', reason }` — PURE, no IO/clock (unit-testable like `detect.ts`). Implements AC1 + edge cases.
- **Tenant scoping**: `sequence_enrollments` has no `tenant_id` (see comment in `lib/autopilot/candidates.ts`) — scope via the `sequences.tenantId` join; `outbound_emails` and `pipeline_events` are scoped by their own `tenant_id`.

**Pause mutation + notify.**
New file `app/apps/web/src/lib/autopilot/auto-pause.ts`:
- `pauseSequence(tenantId, sequenceId, reason, opts): Promise<boolean>` — `UPDATE sequences SET status='paused', paused_reason=reason, paused_by='autopilot', paused_at=now() WHERE id=sequenceId AND tenant_id=tenantId AND status='active' AND autopilot_protected=false`. Returns whether a row changed (false ⇒ already paused/protected/cross-tenant ⇒ no-op, satisfies idempotency).
- `notifyPaused(tenantId, sequence, health)` — insert a `notifications` row to the tenant owner, mirroring `inngest/deliverability-monitor.ts:55-71` (`type:'system'`, `entityType:'sequence'`, `entityId:sequenceId`).
- Note: the in-memory `pauseSequence/resumeSequence` in `lib/sequence/engine.ts:79-87` operate on the conductor's `Enrollment` objects — a different layer; the DB-effective control is `sequences.status`. Document this so the two are not confused.

**Cron (flag-gated, runs before autopilot enrolls).**
New file `app/apps/web/src/inngest/autopilot-auto-pause.ts`: `cron: "0 6 * * *"` (daily 06:00 UTC — ahead of daily-autopilot's `0 7 * * 1-5`; covers weekends too). Mirror the structure of `daily-autopilot.ts`: `concurrency:[{limit:1}]`, `onFailure` dead-letter log, fetch tenants, per-tenant `step.run` fault-isolation. Read `AUTOPILOT_AUTOPAUSE_MODE` (new helper in `app/apps/web/src/lib/autopilot/flag.ts` alongside `isDailyAutopilotEnabled`). For each tenant: `loadSequenceHealth → classifySequence`; on `dead` → `notifyPaused`; if mode==`enforce` → `pauseSequence`. Register in the Inngest function manifest next to the other crons. Independent of `DAILY_AUTOPILOT_ENABLED` so it can be turned on first as the guardrail.

**Re-enable path.**
Edit the sequence Resume/Start handler (where `sequences.status` flips `paused→active`; the action behind `sequences/page.tsx` status control / its API route) to also set `autopilot_protected=true` and clear `paused_at` when a human resumes an autopilot-paused sequence (`paused_by='autopilot'`). `classifySequence` skips `autopilot_protected` sequences until `COOLDOWN_DAYS` elapse since the resume.

## Tasks

**T1 — Migration: audit columns on `sequences`.**
- Code: add `paused_reason`, `paused_by`, `autopilot_protected` to the `sequences` table in `app/apps/web/src/db/schema/outbound.ts` (`paused_at` already exists at `outbound.ts:497` — reuse it, do not re-add); write the idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` SQL.
- Verify: `pnpm db:push` on localdev; confirm columns via `pnpm db:studio`; on prod apply via `DATABASE_URL_OWNER` (idempotent), record + verify.
- Test: `lib/autopilot/__tests__/sequence-health.test.ts` asserts the schema type includes the new columns (compile-time) — and a drizzle round-trip test inserting/reading `autopilot_protected`.

**T2 — Stats reader `loadSequenceHealth`.**
- Code: `app/apps/web/src/lib/autopilot/sequence-health.ts` — the multi-sequence join (enrollments→outboundEmails + pipeline_events meeting count), tenant-scoped via `sequences.tenantId`, `byChannel` split.
- Verify: run against a localdev tenant with a known sequence; assert `sent`/`replies`/`meetingsBooked` match a hand-written SQL count.
- Test: inject a fake `db` (as `lib/analytics/optimizer/db-review.ts` does) and assert the aggregation shape; include a sequence with a `meeting_booked` event attributed by `contactId`.

**T3 — Pure classifier `classifySequence`.**
- Code: same file; implement AC1 + all edge cases; PURE (thresholds injected, default constants exported).
- Verify: n/a (pure) — covered by tests.
- Test: `lib/autopilot/__tests__/sequence-health.test.ts` — cases: zero-data→`insufficient_data`; `sent=49`→`insufficient_data`; `sent=128, replies=0, meetings=0`→`dead`; `sent=128, replies=2`→`healthy`; `meetings=1`→`healthy`; `autopilot_protected=true`→skipped; multi-channel one-dead-one-live→`partial_dead` advisory (not `dead`).

**T4 — Pause mutation + notify `auto-pause.ts`.**
- Code: `app/apps/web/src/lib/autopilot/pauseSequence` (tenant-scoped, status='active' AND not protected guard) + `notifyPaused`.
- Verify: on localdev, call `pauseSequence` for a dead sequence; confirm `status='paused'` + audit columns + a notification row; confirm `cron-trigger-sequence-steps` then fires 0 steps for it (AC3).
- Test: `lib/autopilot/__tests__/auto-pause.test.ts` — asserts the WHERE clause includes `tenant_id` (cross-tenant id is a no-op), the protected guard blocks the update, and a second call is idempotent (returns false, no double-notify).

**T5 — Flag helper + cron `autopilot-auto-pause.ts`.**
- Code: add `autoPauseMode()` to `lib/autopilot/flag.ts`; new cron `inngest/autopilot-auto-pause.ts`; register it.
- Verify: with `AUTOPILOT_AUTOPAUSE_MODE=shadow`, trigger the function locally and confirm notify-only (no status change); set `enforce` and confirm pause.
- Test: `__tests__/autopilot-auto-pause.test.ts` (mirror `__tests__/autopilot-api.test.ts`) — `off`→no-op; `shadow`→notify, no mutation (AC4); `enforce`→mutation (AC2); per-tenant fault isolation (one tenant throwing doesn't abort the loop).

**T6 — Re-enable path + cooldown.**
- Code: edit the sequence Resume/Start API handler to set `autopilot_protected=true` + clear `paused_at` when a human resumes an `autopilot`-paused sequence; `classifySequence` honors `COOLDOWN_DAYS`.
- Verify: auto-pause a sequence, resume it via the UI, re-run the cron, confirm it is NOT re-paused within the cooldown (AC5).
- Test: extend `sequence-health.test.ts` — a resumed sequence within `COOLDOWN_DAYS` → skipped; after cooldown → eligible again.

**T7 — Smoke + flag flip.**
- Verify: run `pnpm test` (full autopilot suite green), `pnpm tsc`. On localdev set `AUTOPILOT_AUTOPAUSE_MODE=shadow` for one cron cycle, inspect notifications, then `enforce`. Only after this guardrail is live does flipping `DAILY_AUTOPILOT_ENABLED=1` become safe.
