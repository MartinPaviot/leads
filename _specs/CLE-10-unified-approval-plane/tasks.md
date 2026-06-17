# CLE-10 — Unified approval plane (`decideAction`) — Tasks

> Branch: `feat/CLE-10-unified-approval-plane`. Merge to main only on Phase 6 PASS. Commit trailer
> `Co-Authored-By: Rippletide <admin@rippletide.com>`. Each task: action + file:line + verify + test.
> Order matters: build the core (T1–T4) and prove it (T13) before any rewire (T5–T12). `tsc --noEmit`
> 0 errors after every task; `regression.sh` green at the end. Working dir: `app/apps/web`.
> Pre-flight reality (2026-06-17): `decide-action.ts` and `chatCreateDisposition` are NOT yet present in
> this tree — T1 is replace-or-create; T5 handles both the pre-CLE-00 (`=== "ask"`) and post-CLE-00
> (`chatCreateDisposition`) shapes.

---

## Phase A — The single authority (core)

### T1 — Create/replace `decideAction` real body
- **Action.** Create `src/lib/guardrails/decide-action.ts` with the §2.1 contents (or replace the CLE-04
  stub body if the file exists). The `DecideActionInput`/`DecideActionResult` and the function shape MUST
  match README §3.5bis verbatim; add the optional `DecideActionExtra` second arg (design §2.1). Import
  `HIGH_CONFIDENCE_THRESHOLDS` + `type GuardedAction` from `@/lib/guardrails/approval-mode`.
- **Verify.** `tsc --noEmit` 0 errors. `grep -n "disposition" src/lib/guardrails/decide-action.ts`
  shows the four-way union. If CLE-04 stub existed: `git diff` shows only the body changed, the
  interfaces byte-identical.
- **Test.** Deferred to T13 (the matrix). Add a trivial smoke (`decideAction({action:{mutating:false,
  confirm:"never"}, approvalMode:"review-each", role:"member"}).disposition === "execute"`) to prove the
  module loads.

### T2 — Add the `GuardedAction` → metadata bridge
- **Action.** In `src/lib/guardrails/approval-mode.ts`, add the exported `GUARDED_ACTION_METADATA`
  table (design §2.2 / §6.1) mapping each of the 7 `GuardedAction` members to
  `DecideActionInput["action"]`.
- **Verify.** `tsc --noEmit` 0 errors; table has exactly 7 keys (compile-time `Record<GuardedAction, …>`
  enforces exhaustiveness).
- **Test.** Covered by T16 parity (each key exercised).

### T3 — Add `deriveApprovalModeFromLevel` + `resolveEffectiveMode`
- **Action.** In `approval-mode.ts`, add the two pure helpers (design §4.2 / §4.3). Import
  `type AutonomyLevel` from `@/lib/campaign-engine/types` (type-only — no runtime cycle).
- **Verify.** `tsc --noEmit` 0 errors. `grep -n "deriveApprovalModeFromLevel\|resolveEffectiveMode"
  src/lib/guardrails/approval-mode.ts` → both exported.
- **Test.** T17.

### T4 — Make `enforceAgentApprovalMode` delegate to `decideAction`
- **Action.** Replace the body of `enforceAgentApprovalMode` (`approval-mode.ts:142-179`) with the
  map→`decideAction`→map-back implementation (design §6.1). Keep the exported signature
  (`ApprovalDecisionInput → ApprovalDecision`) and the `learnedThresholds` field exactly as-is. Forward
  `learnedThresholds` + `actionKey: action` via `DecideActionExtra`.
- **Verify.** `tsc --noEmit` 0 errors. The 9 callers (agent-reactor, autonomous-pipeline,
  email-intelligence-actions ×5, deal-progression/engine, reply-handler, deal-autofill) still compile
  untouched: `grep -rn "enforceAgentApprovalMode(" src | wc -l` unchanged.
- **Test.** T16 (parity grid) — must be written and green before this task is marked done.

---

## Phase B — Prove the core (tests before rewires)

### T13 — The full decision-matrix unit test (write now, keep green forever)
- **Action.** Create `src/__tests__/decide-action.test.ts` enumerating **every cell** of design §3 plus
  the AC-21 fail-safe arms and the compile-time signature-parity check. Full file below.
- **Verify.** `npx vitest run decide-action` green; 100% branch coverage of `decide-action.ts`.
- **Test.** This IS the test.

```ts
import { describe, it, expect } from "vitest";
import { decideAction, type DecideActionInput } from "@/lib/guardrails/decide-action";
import type { ApprovalModeV2 } from "@/lib/guardrails/approval-mode";

// ── Action-class fixtures (design §2 definitions) ──
const READ:        DecideActionInput["action"] = { mutating: false, confirm: "never" };
const REVERSIBLE:  DecideActionInput["action"] = { mutating: true, reversible: true, outbound: false, cost: "free", confirm: "never" };
const REV_RISKY:   DecideActionInput["action"] = { mutating: true, reversible: true, outbound: false, cost: "free", confirm: "risky" };
const REV_ALWAYS:  DecideActionInput["action"] = { mutating: true, reversible: true, outbound: false, cost: "free", confirm: "always" };
const DESTRUCTIVE: DecideActionInput["action"] = { mutating: true, reversible: false, outbound: false, cost: "free", confirm: "never" };
const OUTBOUND:    DecideActionInput["action"] = { mutating: true, reversible: false, outbound: true, cost: "free", confirm: "risky" };
const PAID:        DecideActionInput["action"] = { mutating: true, reversible: false, outbound: true, cost: "money", confirm: "always" };

const MODES: ApprovalModeV2[] = ["review-each", "batch-daily", "auto-high-confidence"];

function d(action: DecideActionInput["action"], approvalMode: ApprovalModeV2,
           role: "admin" | "member" | "viewer" = "member", confidence?: number) {
  return decideAction({ action, approvalMode, role, confidence }).disposition;
}

describe("decideAction — viewer floor (AC-1 / AC-2)", () => {
  it("viewer refuses every write/outbound/paid in every mode", () => {
    for (const m of MODES) {
      for (const a of [REVERSIBLE, REV_RISKY, DESTRUCTIVE, OUTBOUND, PAID]) {
        expect(d(a, m, "viewer")).toBe("refuse");
      }
    }
  });
  it("viewer may read in every mode", () => {
    for (const m of MODES) expect(d(READ, m, "viewer")).toBe("execute");
  });
});

describe("decideAction — paid floor (AC-3)", () => {
  it("paid always confirms regardless of mode, even auto + confidence 1", () => {
    for (const m of MODES) expect(d(PAID, m, "member", 1)).toBe("confirm");
  });
});

describe("decideAction — read executes everywhere (AC-5)", () => {
  it("read → execute in every mode for member", () => {
    for (const m of MODES) expect(d(READ, m, "member")).toBe("execute");
  });
});

describe("decideAction — review-each (AC-4)", () => {
  it("every write/outbound is carded", () => {
    for (const a of [REVERSIBLE, REV_RISKY, DESTRUCTIVE, OUTBOUND]) {
      expect(d(a, "review-each")).toBe("confirm");
    }
  });
});

describe("decideAction — batch-daily (AC-6 / AC-7 / AC-8)", () => {
  it("outbound → queue", () => expect(d(OUTBOUND, "batch-daily")).toBe("queue"));
  it("reversible mutation → queue", () => expect(d(REVERSIBLE, "batch-daily")).toBe("queue"));
  it("destructive → confirm (never silently batched)", () => expect(d(DESTRUCTIVE, "batch-daily")).toBe("confirm"));
});

describe("decideAction — auto-high-confidence (AC-9 / AC-10 / AC-11 / AC-13)", () => {
  it("reversible confirm:never executes when confidence >= bar", () =>
    expect(d(REVERSIBLE, "auto-high-confidence", "member", 0.99)).toBe("execute"));
  it("reversible confirm:never confirms when confidence missing", () =>
    expect(d(REVERSIBLE, "auto-high-confidence", "member", undefined)).toBe("confirm"));
  it("reversible confirm:never confirms when below bar", () =>
    expect(d(REVERSIBLE, "auto-high-confidence", "member", 0.1)).toBe("confirm"));
  it("reversible confirm:always confirms even at confidence 1 (AC-13)", () =>
    expect(d(REV_ALWAYS, "auto-high-confidence", "member", 1)).toBe("confirm"));
  it("reversible confirm:risky confirms (AC-12 raise-the-bar)", () =>
    expect(d(REV_RISKY, "auto-high-confidence", "member", 1)).toBe("confirm"));
  it("destructive always confirms even at confidence 1 (AC-11)", () =>
    expect(d(DESTRUCTIVE, "auto-high-confidence", "member", 1)).toBe("confirm"));
  it("outbound always confirms even at confidence 1 (AC-11)", () =>
    expect(d(OUTBOUND, "auto-high-confidence", "member", 1)).toBe("confirm"));
});

describe("decideAction — F005 learned thresholds (extra arg)", () => {
  it("learned threshold lowers the auto-exec bar", () => {
    const r = decideAction(
      { action: REVERSIBLE, approvalMode: "auto-high-confidence", role: "member", confidence: 0.78 },
      { actionKey: "contact-update", learnedThresholds: { "contact-update": 0.6 } },
    );
    expect(r.disposition).toBe("execute"); // 0.78 >= learned 0.6 (base would be 0.75)
  });
});

describe("decideAction — fail-safe (AC-21)", () => {
  it("malformed mutating scalar → treated as mutating → confirm under review-each", () => {
    // @ts-expect-error intentional malformed input
    expect(decideAction({ action: { mutating: "yes", confirm: "never" }, approvalMode: "review-each", role: "member" }).disposition).toBe("confirm");
  });
  it("unknown confirm scalar → safest (always) → confirm under auto", () => {
    // @ts-expect-error intentional malformed input
    expect(decideAction({ action: { mutating: true, reversible: true, confirm: "garbage" }, approvalMode: "auto-high-confidence", role: "member", confidence: 1 }).disposition).toBe("confirm");
  });
  it("unknown approvalMode → confirm", () => {
    // @ts-expect-error intentional malformed mode
    expect(decideAction({ action: REVERSIBLE, approvalMode: "weird", role: "member" }).disposition).toBe("confirm");
  });
  it("every result carries a non-empty reason", () => {
    for (const m of MODES) {
      for (const a of [READ, REVERSIBLE, DESTRUCTIVE, OUTBOUND, PAID]) {
        expect(decideAction({ action: a, approvalMode: m, role: "member" }).reason.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("decideAction — signature parity with README §3.5bis", () => {
  it("input shape matches the frozen contract (compile-time)", () => {
    const frozen: DecideActionInput = {
      action: { mutating: true, outbound: false, reversible: true, cost: "free", confirm: "never" },
      approvalMode: "review-each",
      role: "admin",
      confidence: 0.5,
    };
    expect(decideAction(frozen).disposition).toBeDefined();
  });
});
```

### T16 — `enforceAgentApprovalMode` delegation parity test
- **Action.** Create `src/__tests__/approval-mode-delegation.test.ts`: cartesian
  `mode × GuardedAction × confidence∈{0, 0.5, 0.86, 0.95, 1}`; assert the new delegating result's
  `{allowed, queueAs}` matches the documented matrix (design §6.1). Explicitly assert the **intended
  divergence**: `email-send`/`email-reply`/`sequence-enrollment` under `auto-high-confidence` →
  `{allowed:false, queueAs:"pending-per-item"}` (comment: AC-11, "no silent outbound"). Update the two
  affected assertions in `src/__tests__/approval-mode-learned.test.ts` (the `email-send @0.9 →
  allowed:true` cases become `allowed:false` with an AC-11 comment).
- **Verify.** `npx vitest run approval-mode-delegation approval-mode-learned guardrails-approval-mode`
  all green.
- **Test.** This IS the test. (Must pass before T4 is marked done.)

### T17 — Level→mode + resolver test
- **Action.** Create `src/__tests__/approval-level-mode.test.ts`: `deriveApprovalModeFromLevel`
  (`copilot`/`guided` → `review-each`; `autonomous` → `auto-high-confidence` relax:false; `strategic` @
  trust 80 → relax:true, @ 79 → relax:false); `resolveEffectiveMode` (row present → derived; row absent
  → `readApprovalMode(settings)`; legacy `agentApprovalMode:"ask"` + no row → `review-each`).
- **Verify.** `npx vitest run approval-level-mode` green.
- **Test.** This IS the test.

---

## Phase C — Rewire vocabulary A (chat)

### T5 — Route chat create tools through `decideAction`
- **Action.** In `src/lib/chat/tools/create.ts`: replace the three `agentApprovalMode === "ask"` gates
  (`:58,63,96,101,128,133`) with the single `createDecision`/`proposeFirst` pattern (design §5.1),
  adding the `refuse` arm for viewers. Keep the proposal object shape unchanged. Read the mode via
  `readApprovalMode(ctx.settings)`. If `chatCreateDisposition` exists (post-CLE-00), instead reduce it to
  the one-line adapter over `decideAction` (design §5.1) and leave its call sites.
- **Verify.** `tsc --noEmit` 0 errors. `grep -n "=== \"ask\"" src/lib/chat/tools/create.ts` → no matches.
  `grep -n "proposal: true" src/lib/chat/tools/create.ts` → still 3 (shape preserved).
- **Test.** T14.

### T14 — Chat create gate test
- **Action.** Create (or extend CLE-00's) `src/__tests__/chat-create-approval-gate.test.ts`: build
  create tools with `agentApprovalMode:"review-each"` → `createContact.execute` returns `proposal:true`,
  DB insert spy NOT called; with `auto-high-confidence` → returns `created`, insert called once; with a
  `viewer` authCtx → returns `{ error }` (refuse), insert NOT called. Repeat for `createAccount`,
  `createDeal`. Use the repo's Proxy-fallback DB-mock pattern (see
  `reference_ci-health-and-test-flakes`).
- **Verify.** `npx vitest run chat-create-approval-gate` green.
- **Test.** This IS the test.

### T6 — System-prompt review flag stays driven by the core
- **Action.** Ensure the route passes `approvalRequiresReview = createDecision.disposition !== "execute"`
  to `buildChatSystemPrompt` (design §5.3). If CLE-00 already wired the boolean, confirm it now derives
  from `decideAction` (via the §5.1 adapter); no new prompt copy.
- **Verify.** `tsc --noEmit` 0 errors. `grep -n "approvalRequiresReview" src/app/api/chat/route.ts
  src/lib/prompts/chat-system-prompt.ts` consistent.
- **Test.** Assertion in T14 that the exact expression `decideAction(...).disposition !== "execute"`
  yields `true` for `review-each` and `false` for `auto-high-confidence` (prompt/tool can't drift).

### T7 — Confirm `update.ts` needs no functional change
- **Action.** Verify `update.ts` has no create-style proposal branch (design §5.2). If a future one
  exists, route it through `decideAction`. Otherwise no edit.
- **Verify.** `grep -n "proposal: true\|=== \"ask\"" src/lib/chat/tools/update.ts` → no create gate.
- **Test.** Covered by the T18 grep guard.

---

## Phase D — Rewire vocabulary B (background) + vocabulary D (level)

### T8 — Persist derived mode on autonomy PUT (level→mode write-side sync)
- **Action.** In `src/app/api/settings/autonomy/route.ts` `PUT` (`:30-91`), after computing
  `merged.level` and `trustScore`, compute `deriveApprovalModeFromLevel(merged.level, trustScore.overall)`
  and call `updateTenantSettings(authCtx.tenantId, { agentApprovalMode: mode })` (design §4.3). Import the
  helper + `updateTenantSettings`.
- **Verify.** `tsc --noEmit` 0 errors. Manual: `PUT {level:"autonomous"}` then read tenant settings →
  `agentApprovalMode === "auto-high-confidence"`.
- **Test.** T17 extension or a focused route test asserting the write happens for each level.

### T9 — Delete autonomous-pipeline's bespoke mapping; route through the core
- **Action.** In `src/inngest/autonomous-pipeline.ts`: delete the `shouldExecute` ternary (`:242-247`);
  map the pipeline action to a `GuardedAction` and set `shouldExecute = enforceAgentApprovalMode({mode,
  action, confidence}).allowed` (design §6.3). Swap `readApprovalMode` (`:98`) for `resolveEffectiveMode`
  (load the `autonomy_config.level` row inside the per-tenant `step.run`).
- **Verify.** `tsc --noEmit` 0 errors. `grep -n "shouldExecute =" src/inngest/autonomous-pipeline.ts` →
  the ternary is gone (single assignment from the gate). `grep -n "d.confidence >= 0.7" src/inngest` → 0.
- **Test.** T16 covers the mapping; add a focused assertion that `SEND_FOLLOWUP` under
  `auto-high-confidence` defers (`allowed:false`).

### T10 — Agent-reactor reads effective mode (relaxed-threshold awareness)
- **Action.** In `src/inngest/agent-reactor.ts` `dispatch` step (`:159-202`): replace
  `readApprovalMode(...)` (`:161`) with `resolveEffectiveMode({settings, level, trustOverall})` (load the
  `autonomy_config.level` row + `getTrustScore`). No other reactor change — it already calls
  `enforceAgentApprovalMode` (`:186`), which now delegates to the core. (Cheaper path acceptable: keep
  `readApprovalMode(settings)` since T8 syncs the cache; then the row read only adds relaxed flag —
  document the choice in the commit.)
- **Verify.** `tsc --noEmit` 0 errors. Reactor still compiles; `enforceAgentApprovalMode` call at `:186`
  unchanged.
- **Test.** T16 (the gate it calls is parity-tested). Optional: a reactor-dispatch unit test that a
  `deal-stage-change` @0.95 under derived `auto-high-confidence` is `allowed`.

### T11 — Migration backfill script
- **Action.** Create `scripts/cle10-backfill-approval-mode.ts`: for each `autonomy_config` row, compute
  `deriveApprovalModeFromLevel(level, trustOverall)` and write `agentApprovalMode` into that tenant's
  settings (idempotent). Log `(tenantId, oldMode, newMode)`. Skip tenants with no row (EC-4).
- **Verify.** Dry-run (`--dry`) prints the plan without writing; confirms Pilae (`47dca783`) → no change
  (EC-5). Real run logged to `_research/raw/cle10-backfill-<date>.log`.
- **Test.** A unit test over the pure derivation already in T17; the script is a thin DB loop. Assert
  idempotency by re-running `--dry` after the real run → empty change set.

### T12 — Add the boundary comment in execution-gate
- **Action.** Add a comment at `src/lib/campaign-engine/execution-gate.ts:31` noting that the
  `PermissionValue` send-policy axis is downstream of the level and is deliberately NOT unified by
  CLE-10 (design §4.4 / §8) — pointer to this spec.
- **Verify.** Comment present; no code change; `tsc` 0.
- **Test.** None (comment only).

---

## Phase E — Guards, hygiene, doc

### T18 — Grep guards in `regression.sh`
- **Action.** Add lines to `regression.sh` asserting: (a) no `agentApprovalMode === "ask"` in
  `lib/chat/tools/**` or `lib/prompts/**` (finishes CLE-00); (b) no approval-mode ternary outside
  `decide-action.ts`/`approval-mode.ts` (`grep -rn "auto-high-confidence" src --include=*.ts | grep -v
  "guardrails/" | grep "?" ` heuristic — manual review allowed); (c) `git diff --stat
  src/lib/chat/tools/page-actions.ts` is empty on this branch (AC-18, CLE-04 untouched); (d)
  `src/lib/capture/approval.ts` untouched (out-of-scope proof).
- **Verify.** `bash regression.sh` green.
- **Test.** This IS the guard.

### T19 — Full regression + type + coverage gate
- **Action.** Run `npx tsc --noEmit`, `npx vitest run` (full), `bash regression.sh`. Fix any drift.
  Confirm no new runtime dependency added (`git diff package.json` empty).
- **Verify.** All green; coverage of `decide-action.ts` = 100% branches.
- **Test.** The whole suite.

### T20 — Doc update (README amendment for the optional `extra`)
- **Action.** If the optional `DecideActionExtra` second arg is kept (design §10 tension 1), amend
  `_specs/chat-live-executor/README.md` §3.5bis to note the additive optional `extra` param (per the
  README's own change rule §6). Note the §6.1 outbound-confirm behaviour change and the
  `guided→review-each` choice in the CLE-10 sprint report for the M2 checkpoint.
- **Verify.** README §3.5bis still shows the frozen first-arg signature verbatim, with a clearly-marked
  additive note. No other contract touched.
- **Test.** None (doc).

---

## Definition of done (Phase 6 entry)
- T1–T20 complete; `tsc --noEmit` 0 errors; `npx vitest run` green; `regression.sh` green.
- `decideAction` is the single authority: chat creates (T5), `invokePageAction` (unchanged, T18 guard),
  and both background loops (T9/T10 via the delegating `enforceAgentApprovalMode`, T4) all route through
  it. The full matrix (T13) and the delegation parity (T16) are pinned.
- Toggling `autonomyConfig.level` changes `decideAction`'s output (T8 + T17), proving the headline
  requirement AC-14.
- `lib/capture/approval.ts` (vocabulary C) and `execution-gate.ts`'s send-policy axis are untouched
  (T12/T18) — scope held.
