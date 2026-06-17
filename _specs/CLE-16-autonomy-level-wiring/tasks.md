# CLE-16 — Wire the autonomy level + learned thresholds + trust gate — Tasks

> Branch: `feat/CLE-16-autonomy-level-wiring`. Merge to `main` only on Phase 6 PASS.
> Commit trailer: `Co-Authored-By: Rippletide <admin@rippletide.com>`.
> Constitution: `_specs/chat-live-executor/README.md`. Requirements: `./requirements.md`. Design: `./design.md`.
> **Hard invariant across every task:** never change `decide-action.ts`'s body or signature (AC-23),
> never modify `tool_call_events`/undo/`capture/approval.ts`/`getTrustScore` (AC-24). CLE-16 wires the
> CLE-10 seams; it does not touch the cores.
> Each task: **action → file → verify → test**. Run `tsc --noEmit` after writing tests (lesson:
> reference docs note test-after-tsc drift). Commit per task.

---

## Phase 0 — Pre-flight (confirm CLE-10/CLE-11 landed; no edits)

### T0 — Confirm dependencies are present
- **Action:** Verify CLE-10 shipped `decide-action.ts` with the `extra?: { actionKey, learnedThresholds }`
  arg + the paid/destructive/outbound `confirm` arms, and `deriveApprovalModeFromLevel` +
  `resolveEffectiveMode` in `approval-mode.ts`. Verify CLE-11 shipped `tool_call_events.status` with
  `reverted` and `outbound_emails.status` with `canceled`. If any is absent, STOP (CLE-16 depends on
  M2). Read `_specs/CLE-10-unified-approval-plane/design.md` §2.1/§4 and the live files.
- **File:** (read-only) `src/lib/guardrails/decide-action.ts`, `src/lib/guardrails/approval-mode.ts`,
  `src/db/schema/intelligence.ts`, `src/db/schema/outbound.ts`.
- **Verify:** grep `resolveEffectiveMode`, `deriveApprovalModeFromLevel`, `extra?: DecideActionExtra`,
  `cost === "money"`, `status` enum `reverted`/`canceled` all resolve.
- **Test:** none (gate check). Note findings in the branch description.

---

## Phase 1 — Typed settings (removes the untyped cast; foundation)

### T1 — Type `learnedThresholds` + `trustStatsUpdatedAt` on `TenantSettings`
- **Action:** Add `learnedThresholds?: Record<string, number>;` and `trustStatsUpdatedAt?: string;` to
  the `TenantSettings` interface near `trustScore` (`tenant-settings.ts:261`). Remove the
  `(settings as Record<string, unknown>)` cast in `learned-trust.ts:34` and the `as Record<string, unknown>`
  on the write (`learned-trust.ts:77`).
- **File:** `src/lib/config/tenant-settings.ts`, `src/lib/guardrails/learned-trust.ts`.
- **Verify:** `tsc --noEmit` 0 errors; `computeEffectiveThresholds` reads `settings.learnedThresholds`
  without a cast.
- **Test:** `tenant-settings.types.test.ts` — a `satisfies TenantSettings` object with
  `learnedThresholds` compiles (compile-time). Confirm storage is the jsonb settings object (no DB
  migration); if it is a typed column store, add the column in a migration and note it here.

---

## Phase 2 — The SSOT module (pure: table, copy, relaxed map, exclusion, clamp)

### T2 — Create `lib/guardrails/level-behavior.ts`
- **Action:** Implement, exactly per design §3.3/§3.4/§4.3:
  `HARD_EXCLUDED_ACTIONS` (Set of `email-send`/`email-reply`/`sequence-enrollment`),
  `STRATEGIC_RELAXED_THRESHOLDS`, `clampThreshold(v)`, `buildEffectiveThresholdMap({learned, relaxThresholds})`,
  `LEVEL_BEHAVIOR` (copy SSOT), `requiredTrustForLevel(level)` + `TRUST_FLOOR`. All pure (no DB/IO).
  Import `HIGH_CONFIDENCE_THRESHOLDS`/`GuardedAction` from `approval-mode.ts`, `AutonomyLevel` from
  `campaign-engine/types.ts`.
- **File:** `src/lib/guardrails/level-behavior.ts` (NEW).
- **Verify:** `tsc --noEmit` 0; module has no DB import.
- **Test:** `level-behavior.test.ts` (part 1) —
  `buildEffectiveThresholdMap` forces every `HARD_EXCLUDED_ACTIONS` member to `1.0` regardless of a `0.0`
  learned value (AC-6/AC-7/EC-8); non-excluded class picks `relaxed ?? learned ?? static` then clamps;
  `clampThreshold`: `NaN→1.0`, `0.1→0.5`, `1.5→1.0`, `0.7→0.7` (EC-5/AC-22); `requiredTrustForLevel`
  returns `0/50/65/80` (AC-11).

---

## Phase 3 — The HARD RULE invariant (the headline safety test) + table

### T3 — Lock the learning bounds: money/destructive/outbound never auto-execute
- **Action:** No production code (the guarantee is structural — CLE-10 core arms + T2 exclusion). Write
  the invariant test that proves it end to end through the real composition.
- **File:** `src/__tests__/learning-bounds.test.ts` (NEW).
- **Verify:** test runs green; intentionally set a learned/injected threshold of `0.0` for paid,
  destructive, and outbound classes.
- **Test (REQUIRED — this is the headline AC):**
  - For `cost:"money"` action: for each level in {copilot, guided, autonomous, strategic(trust=100)},
    confidence `1`, `extra.learnedThresholds` forcing `0.0` → `decideAction(...).disposition === "confirm"`
    (AC-4).
  - For a `destructive` action (`mutating:true, reversible:false, outbound:false`): same matrix →
    `confirm` (AC-5).
  - For an `outbound` action: same matrix → `confirm` (AC-6).
  - `recalculateThresholds` given `action_outcomes` rows whose `actionType ∈ {email-send, email-reply,
    sequence-enrollment}` writes **no** learned key for them (AC-7).

### T4 — The level × action-class table test
- **Action:** No production code beyond T2; assert the design §3.1 table via the real seams.
- **File:** `src/__tests__/level-behavior.test.ts` (part 2).
- **Verify:** every `(level, class)` cell asserted through
  `resolveEffectiveMode → buildEffectiveThresholdMap → decideAction`.
- **Test:** all 5 classes × 5 level-rows (incl. strategic trust<80 vs ≥80) equal the table (AC-14);
  adjacent-level distinctness — autonomous disposition ≠ copilot on `reversible-mutation confirm:never`,
  and strategic(trust≥80) applies a *lower* threshold than autonomous for the same class (AC-15).

---

## Phase 4 — The bounded learning update + CLE-11 bad signal + observability

### T5 — Hard-exclusion skip + incremental-from-prev + clamp in `recalculateThresholds`
- **Action:** In `recalculateThresholds` (`learned-trust.ts:53-80`): skip classes in
  `HARD_EXCLUDED_ACTIONS` (AC-7); compute `delta` from `prev(c) = learned(c) ?? base(c)` (not always
  base) with the dead-band (no move for `0.5 ≤ g < 0.8`); `clampThreshold` the result (design §3.2).
  Keep `MIN_OUTCOMES_FOR_ADJUSTMENT`. Load current learned via `computeEffectiveThresholds`.
- **File:** `src/lib/guardrails/learned-trust.ts`.
- **Verify:** `tsc` 0; re-running on the same window yields the same clamped value (idempotent at bound).
- **Test:** `learned-trust.update.test.ts` — good-rate ≥0.8/≥10 ⇒ drops from prev, floored 0.5 (AC-2);
  <0.5 ⇒ rises, ceilinged 1.0 (AC-3); 0.5–0.8 ⇒ no move (EC-2); <10 ⇒ static, no NaN (AC-21/EC-1);
  repeated good windows compound toward 0.5 without crossing it (incremental convergence, §3.2 tension 4).

### T6 — Fold CLE-11 reversal/bounce + F003 into the good/bad signal (read-only)
- **Action:** Extend `getOutcomeStats` (`learned-trust.ts:82-105`) to subtract a bad-outcome count
  sourced read-only from `tool_call_events WHERE status='reverted'` (CLE-11) and
  `outbound_emails WHERE status IN ('canceled','bounced')`, mapped to `actionType`/class; a good-then-
  reverted action nets bad (reversal dominates) (design §5.2/AC-19). Do NOT write either table.
- **File:** `src/lib/guardrails/learned-trust.ts` (read-only joins to `tool_call_events`,
  `outbound_emails`).
- **Verify:** grep confirms no `update`/`insert` on those tables in this file; `tsc` 0.
- **Test:** `learned-trust.update.test.ts` (cont.) — a `reverted` row counts bad and lowers good-rate
  enough to raise the threshold; a good F003 row + a later reversal for the same action nets bad (AC-19).

### T7 — Observability: structured log + recalc wiring
- **Action:** In `recalculateThresholds`, on a changed class, emit
  `logger.info("learned-threshold.update", { tenantId, actionType, oldThreshold, newThreshold, sampleSize, goodRate })`
  (use `lib/observability/logger`). Confirm `trust-recalculator.ts` still calls `recalculateThresholds`
  per tenant (no cadence change); thread nothing new into the cron beyond what the function reads.
- **File:** `src/lib/guardrails/learned-trust.ts`, (read-only confirm) `src/inngest/trust-recalculator.ts`.
- **Verify:** log line emitted only when `oldThreshold !== newThreshold`.
- **Test:** `autonomy-observability.test.ts` (part 1) — spy `logger.info`; a changing class logs the
  line with all fields; an unchanged class does not (AC-20).

---

## Phase 5 — trustScore gate (server-side, all levels)

### T8 — Generalize the autonomy route gate from strategic-only to all levels
- **Action:** Replace the strategic-only block (`autonomy/route.ts:40-48`) with the
  `requiredTrustForLevel`-driven gate (design §4.2): on a level change, if `floor > 0` and
  `getTrustScore().overall < floor` → `403` with `{ error, currentScore, requiredScore }`. Downgrades
  (floor ≤ current trust) pass. Keep the guardrail validations (`:51-58`) and the CLE-10 derived-mode
  write-side sync intact.
- **File:** `src/app/api/settings/autonomy/route.ts`.
- **Verify:** `tsc` 0; strategic still requires 80 (no behaviour change for strategic); new floors for
  guided(50)/autonomous(65).
- **Test:** `trust-gate.test.ts` (REQUIRED) — mock `getTrustScore`:
  - trust 79 + `level:"strategic"` → `403`, `autonomyConfig` not written (AC-10);
  - trust 80 + strategic → 200 (AC-10);
  - trust 64 + autonomous → `403`; trust 65 → 200 (AC-11);
  - trust 49 + guided → `403`; trust 50 → 200 (AC-11);
  - any trust + `level:"copilot"` (downgrade) → 200 (EC-6);
  - direct call without UI (the route IS the server path) still refuses above floor (AC-12).

### T9 — Belt-and-braces: relaxation re-checks live trust (verify CLE-10, add regression)
- **Action:** No code change if CLE-10's `deriveApprovalModeFromLevel(level, trustOverall)` already
  returns `relaxThresholds = trustOverall >= 80` (CLE-10 §4.4). Add a CLE-16 regression test that a
  forged `strategic` level with live trust < 80 yields `relaxThresholds:false` so `buildEffectiveThresholdMap`
  falls back to static (AC-13/EC-4). If CLE-10 did NOT add the independent floor, STOP and fix it in
  CLE-10's file (it is CLE-10's contract), then proceed.
- **File:** (read-only) `src/lib/guardrails/approval-mode.ts`.
- **Verify:** `resolveEffectiveMode({ level:"strategic", trustOverall:50 }).relaxThresholds === false`.
- **Test:** `trust-gate.test.ts` (cont.) — the forged-level case (AC-13).

---

## Phase 6 — Wire the effective map into the background callers (the composition)

### T10 — Inject `buildEffectiveThresholdMap` into the background loops
- **Action:** In `agent-reactor.ts` and `autonomous-pipeline.ts`, where they obtain the mode via
  `resolveEffectiveMode` (CLE-10 §6.2/§6.3), also load `tenant_settings.learnedThresholds`, run
  `buildEffectiveThresholdMap({ learned, relaxThresholds })`, and pass the result as the
  `learnedThresholds` field of `enforceAgentApprovalMode` (which CLE-10 forwards to `decideAction`'s
  `extra` — `approval-mode.ts:112,164`, CLE-10 §6.1). One load + one transform per tenant evaluation.
  Do not change `decideAction` or `enforceAgentApprovalMode` signatures.
- **File:** `src/inngest/agent-reactor.ts`, `src/inngest/autonomous-pipeline.ts`.
- **Verify:** `tsc` 0; grep confirms the background loops pass a `learnedThresholds` built via
  `buildEffectiveThresholdMap`, not a raw `tenant_settings.learnedThresholds` (so excluded classes are
  ceiling-forced even in background).
- **Test:** `learning-composition.test.ts` — with `learnedThresholds={contact-update:0.6}` and an
  autonomous tenant, a `contact-update` at confidence 0.65 → the loop's `enforceAgentApprovalMode`
  returns `allowed:true` (AC-1); removing the learned key → 0.65 < static 0.75 → `allowed:false` (EC-5);
  an `email-send` at confidence 0.99 with learned `0.0` → `allowed:false` (AC-6 through the loop).

---

## Phase 7 — UI copy from SSOT + observability surface

### T11 — Replace autonomy level copy with `LEVEL_BEHAVIOR`; add threshold display
- **Action:** In `autonomy/page.tsx`, build `LEVELS` descriptions from `LEVEL_BEHAVIOR[id].behavior`
  (keep the icons). Under the level selector, render the per-action threshold block from the GET
  `thresholds` field (T12): e.g. "Updating a contact — asks above 60% (learned, was 75%)". Secondary
  styling; English UI copy (per repo convention).
- **File:** `src/app/(dashboard)/(rest)/settings/autonomy/page.tsx`.
- **Verify:** Playwright load `/settings/autonomy` → the four descriptions match `LEVEL_BEHAVIOR`; the
  threshold block renders for a tenant with learned values. No emoji.
- **Test:** `autonomy-copy.test.ts` — the shipped `LEVELS[].description` strings equal
  `LEVEL_BEHAVIOR[id].behavior` (AC-16/AC-17); regex guard that no description claims auto-send under
  copilot/guided (AC-16).

### T12 — Observability read surface on the autonomy GET
- **Action:** In `GET /api/settings/autonomy`, add a `thresholds` object:
  `{ [action]: { static, current, source: "static"|"learned"|"relaxed", excluded } }` computed from
  `HIGH_CONFIDENCE_THRESHOLDS` + `buildEffectiveThresholdMap({ learned, relaxThresholds })` (relax from
  `resolveEffectiveMode` for the tenant). Read-only derivation; no write.
- **File:** `src/app/api/settings/autonomy/route.ts`.
- **Verify:** GET returns `thresholds`; excluded classes show `source:"static", excluded:true,
  current:1.0`; a learned class shows `source:"learned"` with the clamped value.
- **Test:** `autonomy-observability.test.ts` (part 2) — GET payload contains `thresholds` with the right
  `source`/`excluded`/`current` per class for a seeded tenant (AC-20/§5.3).

---

## Phase 8 — Cleanup, regression, drift

### T13 — One-shot prune of stale excluded learned keys
- **Action:** Add `scripts/cle16-prune-excluded-learned.ts`: for each tenant, drop any
  `learnedThresholds` key in `HARD_EXCLUDED_ACTIONS` (legacy data from before T5's skip). Idempotent;
  logs `(tenant, prunedKeys)`. Run once in the verify; safe to re-run.
- **File:** `src/scripts/cle16-prune-excluded-learned.ts` (NEW).
- **Verify:** dry-run logs the keys it would prune; run prunes them; second run prunes nothing.
- **Test:** `cle16-prune.test.ts` — a tenant with `{ "email-send":0.5, "contact-update":0.6 }` →
  after prune `{ "contact-update":0.6 }` (EC-8).

### T14 — Regression guards + signature parity
- **Action:** Add to `regression.sh`: (i) `git diff --stat` asserts `src/lib/guardrails/decide-action.ts`,
  `src/lib/chat/tool-call-log.ts`, `src/lib/chat/tools/undo.ts`, `src/lib/capture/approval.ts`,
  `src/lib/campaign-engine/trust-score.ts` are UNMODIFIED on this branch (AC-23/AC-24);
  (ii) a `satisfies` compile check that `DecideActionInput` still equals README §3.5bis (AC-23);
  (iii) grep that the background loops build the injected map via `buildEffectiveThresholdMap`.
- **File:** `regression.sh`, `src/__tests__/decide-action-signature.test.ts` (NEW, the `satisfies`).
- **Verify:** `regression.sh` green; the diff guard fails if any protected file is touched.
- **Test:** the `satisfies` test compiles only if the signature is unchanged (AC-23).

### T15 — Full suite + tsc + drift check
- **Action:** Run `tsc --noEmit`, the full vitest suite (incl. CLE-10 `approval-mode-learned.test.ts`,
  CLE-10/CLE-11 suites), and `regression.sh`. Fix any drift. Re-read design §1 anchors and confirm no
  file:line moved under us (concurrent-editor lesson).
- **File:** repo-wide.
- **Verify:** `tsc` 0; all tests green; `regression.sh` green; CLE-10/CLE-11 suites unchanged and green.
- **Test:** the whole suite is the test. 100% of new branches in `level-behavior.ts`,
  `learned-trust.ts` (new arms), and the route gate covered.

---

## Phase 9 — Doc + checkpoint (M4)

### T16 — Doc update + checkpoint note
- **Action:** Update `_specs/chat-live-executor/README.md` ONLY if the §3.5bis clarifying note is
  accepted (design §9/§10 tension 1) — open `_specs/CLE-16-autonomy-level-wiring/spec-issues.md` first
  per the constitution's change rule; if rejected, no README change (behaviour identical). Record the M4
  checkpoint summary: level is now real (table), learning is bounded + trust-gated + observable, HARD
  RULE locked, two-trust-score + copilot≡guided tensions flagged.
- **File:** `_specs/chat-live-executor/README.md` (conditional), `_specs/CLE-16-autonomy-level-wiring/spec-issues.md` (if amending).
- **Verify:** README change (if any) is exactly the one-line note; M4 is a checkpoint — STOP for Martin's
  review after build+eval PASS.
- **Test:** none (doc). The 4 flagged tensions (§10) are the checkpoint agenda.

---

### Task → AC coverage map

| Task | Primary ACs / ECs |
|---|---|
| T1 | (foundation) EC-5 read path |
| T2 | AC-6, AC-7, AC-11, EC-5, EC-8, AC-22 |
| T3 (REQUIRED) | **AC-4, AC-5, AC-6, AC-7** |
| T4 | AC-14, AC-15 |
| T5 | AC-2, AC-3, AC-21, EC-1, EC-2, EC-10 |
| T6 | AC-19, §5.2 |
| T7 | AC-20 |
| T8 (REQUIRED) | **AC-10, AC-11, AC-12**, EC-6 |
| T9 | AC-13, EC-4 |
| T10 | AC-1, AC-6 (loop), EC-5, EC-11 |
| T11 | AC-16, AC-17 |
| T12 | AC-20 |
| T13 | EC-8 |
| T14 | AC-23, AC-24 |
| T15 | AC-22 (fail-safe via suite), regression |
| T16 | §10 tensions / checkpoint |
