# CLE-16 — spec-issues / contract-change log + M4 checkpoint tensions

> Per the constitution's change rule (`README.md` §3.8): a contract change goes
> `spec-issues.md` → amend the README → then code. CLE-16 makes ONE additive,
> retro-compatible README note (no behaviour change) and flags four tensions for
> the M4 product checkpoint. Nothing here redefines a frozen contract.

## 1. Ratified additive note — README §3.5bis (DONE)

**Change:** add a clarifying note to README §3.5bis that `extra.learnedThresholds`
is the **already-resolved** effective bar map — callers fold level/trust/relaxation
into it (via `resolveEffectiveMode` + `buildEffectiveThresholdMap`) BEFORE calling
`decideAction`. The core sees only a `Record<string, number>` (its existing type);
no `relaxThresholds` flag enters the core. The builder ceiling-forces the
outbound/paid/destructive (`HARD_EXCLUDED_ACTIONS`) classes.

**Why additive, not a redefinition:** this is already TRUE of CLE-10's design (the
2nd arg already existed and already carried `learnedThresholds`). The note only
prevents a future reader from re-introducing a raw flag into the core. The
§3.5bis **signature is unchanged** (AC-23). Zero-amendment fallback: if the note
were rejected, no code changes — behaviour is identical.

**Status:** applied to `_specs/chat-live-executor/README.md` §3.5bis (one note
block under the "Consommée identiquement par" line).

## 2. M4 checkpoint tensions (flag for Martin — deferred, not blocking)

1. **`extra.learnedThresholds` as the pre-resolved bar map (tension 1).** Leans on
   CLE-10's optional `extra` (already beyond the literal §3.5bis first-arg surface,
   which CLE-10 itself flagged). Recommendation: keep the note (done). No code risk.

2. **Two trust scores (tension 2).** `systemTrustScore.overall` (0–100) is the GATE
   score used by the autonomy level gate (§4.2) + the strategic relaxation (CLE-10
   `deriveApprovalModeFromLevel`). `tenant_settings.trustScore` (0–1) is the NUDGE
   score (`guardrails/trust-score.ts`, with decay). CLE-16 uses ONLY the gate score
   and documents the boundary with a comment at both call sites + on the
   `TenantSettings.trustScore` field.

   **Boundary re-verified 2026-06-18 (not a correctness bug, only a naming
   overlap).** Full consumer trace:
   - Gate path (0–100): `TRUST_FLOOR` = {copilot 0, guided 50, autonomous 65,
     strategic 80} and the `trustOverall >= 80` strategic-relaxation check both
     compare against `getTrustScore().overall` from `@/lib/campaign-engine/trust-score`.
     All THREE `resolveEffectiveMode` callers (`settings/autonomy/route`,
     `agent-reactor`, `autonomous-pipeline`) pass `trust.overall` from that same
     0–100 module. No 0–1 value enters the gate.
   - Nudge path (0–1): `settings.trustScore` is read only in `nudges/autonomy/route`,
     `deal-progression/engine`, `guardrails/trust-score` (its own updater), and
     `agent-memory` — where it is explicitly `* 100` with a "(0-100)" label for
     DISPLAY, a correct conversion, never a gate input.

   So there is **no scale-crossing** and nothing to fix for safety. The remaining
   item is purely a **future consolidation preference** (one score, two consumers);
   merging now would touch the nudge UX + the route gate at once — out of scope, and
   a product/architecture call rather than a latent defect.

3. **copilot ≡ guided on the disposition axis (tension 3).** CLE-10 maps both to
   `review-each`; the copilot/guided difference lives on the campaign-engine
   send-policy axis (out of CLE-16 scope). CLE-16's UI copy (`LEVEL_BEHAVIOR`) is
   HONEST about this equivalence (guided's copy says "Same as Copilot for actions …
   send timing/policy is set under Guardrails") rather than over-promising. If
   product wants `guided` to auto-run reversible work after a delay, that is a
   one-line `deriveApprovalModeFromLevel` change in CLE-10 — flagged, deferred.

   **Decision 2026-06-18: kept conservative on purpose.** Making `guided` auto-run
   reversible work changes what the product DOES without a human in the loop — an
   autonomy-semantics / product call, not a code-completeness gap, so it is not one
   to make autonomously. The current state is safe and the UI copy is honest, so the
   conservative behaviour (guided ≡ copilot on disposition) stands until product
   asks for the delayed-auto-run semantics. No code change.

4. **Incremental-from-prev learning (tension 4 — a behaviour change to F005 math).**
   `recalculateThresholds` now accumulates the ±0.05 delta from the **previous
   learned value** (clamped) instead of re-deriving from the static base each week.
   This makes the [0.5, 1.0] bounds load-bearing: sustained good outcomes walk a
   threshold down toward (never past) 0.5; a bad streak walks it back toward 1.0.
   Guarded by floor/ceiling/dead-band/min-sample and tested
   (`learned-trust.update.test.ts`: convergence-to-floor, convergence-to-ceiling,
   dead-band, <10 static). Flag so a reviewer confirms the intent (sustained good
   outcomes SHOULD compound).

## 3. Implementation notes / minor deviations (honest record)

- **Orphaned proof test recovered (2026-06-18).** `learned-trust.update.test.ts`
  (the bounded-incremental-learning + reversal-bridge + read-clamp suite referenced
  in tension 4 above) was authored for CLE-16 but never staged when CLE-16 landed
  (11a8c1af). It is now committed (12 tests, green against the shipped code). The
  CLE-16 learning math is no longer only trace-asserted.
- **actionType vocabulary bridge.** `action_outcomes.actionType` is written by the
  reactor in the F003 vocabulary (`send_followup`, `create_task`, …), NOT the
  `GuardedAction` vocabulary (`email-send`, `task-create`). The design (§3.1/§3.2)
  and the required tests (AC-7) assume the learner's keys are `GuardedAction`
  values (so a learned key connects to `decideAction`'s
  `extra.learnedThresholds[actionKey]` lookup, which is `GuardedAction`-keyed).
  CLE-16 therefore treats the learner's `stat.actionType` as the `GuardedAction`
  vocabulary throughout, and the CLE-11 reversal bridge
  (`TOOL_NAME_TO_ACTION_TYPE`) maps tool names to `GuardedAction` values. This is
  the only way the learned bar actually reaches the core (the previous code wrote
  keys that never matched the lookup). A separate follow-up could align the F003
  outcome-detector's stored `actionType` with the `GuardedAction` set end-to-end;
  out of CLE-16 scope. Recorded here for visibility.
- **agent-reactor mode source.** The reactor previously resolved the mode via
  `readApprovalMode(settings)` (stored mode only). CLE-16 switches it to
  `resolveEffectiveMode({ settings, level, trustOverall })` so the autonomy LEVEL
  is authoritative there too (consistent with `autonomous-pipeline.ts` and CLE-10
  §4.3) and so it can obtain `relaxThresholds` to build the injected map. This is
  the wiring §9 calls for; it adds one autonomy_config read + one getTrustScore per
  reactor evaluation.
