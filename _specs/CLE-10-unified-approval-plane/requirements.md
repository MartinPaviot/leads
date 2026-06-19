# CLE-10 — Unified approval plane (`decideAction`) — Requirements

> Constitution: `_specs/chat-live-executor/README.md`. This spec implements the **real body**
> of `decideAction` (README §3.5bis — signature frozen, cited verbatim in design.md §2.1) and
> collapses the **four** disconnected approval/autonomy vocabularies (audit §1.3) into **one**
> decision authority. It does NOT redefine any frozen contract. It depends on CLE-00
> (approval-gate rewire) and CLE-04 (page-action tools + the `decideAction` import site).

---

## 1. User story

**As** a founder running Elevay in any autonomy posture (copilot → strategic),
**I want** every action the system can take — a chat create/update, a live page action, or a
background-loop decision — to pass through **one** decision function that reads **one** setting,
**so that** the autonomy toggle I see in the UI actually governs behaviour, the same risky action
is gated the same way no matter which surface triggered it, and there is exactly one place to audit
"does the human need to see this first?".

Today there are four vocabularies that do not talk to each other (audit §1.3):
- (A) chat proposal-cards (CLE-00 wires them; pre-CLE-00 they were dead);
- (B) `enforceAgentApprovalMode` — the real v2 SSOT (`review-each|batch-daily|auto-high-confidence`),
  called only by background loops;
- (C) `capture-approvals` — governs **ingestion** (stays separate, see Out of scope);
- (D) `autonomyConfig.level` (`copilot|guided|autonomous|strategic`) — decorative; the chat and the
  reactor never read it, so toggling it changes nothing (audit §1.3, G3).

CLE-10 makes (A) and (B) two consumers of **one** core, and wires (D) so it derives the mode that
core reads. (C) is explicitly out of scope.

---

## 2. Definitions (used by every EARS clause below)

**Action class** — derived from the action metadata `{ mutating, outbound?, reversible?, cost?, confirm }`:
- `read` — `mutating === false` (filters, view toggles, list reads).
- `reversible-mutation` — `mutating && reversible && !outbound && cost !== "money"`.
- `destructive` — `mutating && !reversible && !outbound` (irreversible local change, e.g. hard delete).
- `outbound` — `outbound === true` and `cost !== "money"` (external send: email, invite, enroll, call-prepare).
- `paid` — `cost === "money"` (buy a number, paid send) — regardless of any other flag.

**Disposition** (the output, frozen union README §3.5bis): `execute | confirm | queue | refuse`.
- `execute` — run now, no card.
- `confirm` — show a confirmation/proposal card; run only on human approve.
- `queue` — park into the daily-batch review lane (no immediate run, no per-item card now).
- `refuse` — hard stop; never runs; explain why.

**`approvalMode`** — the canonical `ApprovalModeV2` (`approval-mode.ts:23-26`), always read via
`readApprovalMode()` (`approval-mode.ts:39-63`). The **single** mode SSOT.

**`role`** — `"admin" | "member" | "viewer"` (from `authCtx.role`, default `"member"`).

**`confidence`** — optional agent-reported 0–1 signal. Absent → treated as below-threshold (safe).

**`learnedThresholds`** (F005) — per-action learned overrides of `HIGH_CONFIDENCE_THRESHOLDS`
(`approval-mode.ts:88-98`, F005 override at `:164`). Honoured in `auto-high-confidence`.

---

## 3. EARS acceptance criteria

### 3.A The decision matrix — `approvalMode × action class × role × confidence`

> Each row is a frozen GIVEN/WHEN/THEN. The full table is in design.md §3; these are the
> normative cells the unit test (`decide-action.test.ts`, tasks T13) must enumerate.

**AC-1 (viewer hard floor).**
GIVEN `role = "viewer"` AND the action is `reversible-mutation`, `destructive`, `outbound`, or `paid`
WHEN `decideAction` is called with ANY `approvalMode`
THEN it returns `{ disposition: "refuse", reason: "role:viewer …" }`.
(Role floor is evaluated **before** mode — a viewer in `auto-high-confidence` still refuses.)

**AC-2 (viewer may read).**
GIVEN `role = "viewer"` AND the action is `read`
WHEN `decideAction` is called with ANY `approvalMode`
THEN it returns `{ disposition: "execute", … }`.

**AC-3 (paid always confirms, never silent).**
GIVEN the action is `paid` (`cost === "money"`) AND `role ∈ {member, admin}`
WHEN `decideAction` is called with ANY `approvalMode` (including `auto-high-confidence` with
`confidence = 1`)
THEN it returns `{ disposition: "confirm", … }` (NEVER `execute`, NEVER `queue`).

**AC-4 (`review-each` cards every write).**
GIVEN `approvalMode = "review-each"` AND `role ∈ {member, admin}` AND the action is
`reversible-mutation`, `destructive`, or `outbound`
WHEN `decideAction` is called
THEN it returns `{ disposition: "confirm", … }`.

**AC-5 (`review-each` still executes reads).**
GIVEN `approvalMode = "review-each"` AND the action is `read`
WHEN `decideAction` is called
THEN it returns `{ disposition: "execute", … }`.

**AC-6 (`batch-daily` queues outbound).**
GIVEN `approvalMode = "batch-daily"` AND `role ∈ {member, admin}` AND the action is `outbound`
(non-paid)
WHEN `decideAction` is called
THEN it returns `{ disposition: "queue", … }` (the daily review lane).

**AC-7 (`batch-daily` confirms destructive).**
GIVEN `approvalMode = "batch-daily"` AND the action is `destructive`
WHEN `decideAction` is called
THEN it returns `{ disposition: "confirm", … }` — irreversible changes are never silently batched.

**AC-8 (`batch-daily` queues reversible mutation).**
GIVEN `approvalMode = "batch-daily"` AND the action is `reversible-mutation`
WHEN `decideAction` is called
THEN it returns `{ disposition: "queue", … }`.

**AC-9 (`auto-high-confidence` executes safe high-confidence).**
GIVEN `approvalMode = "auto-high-confidence"` AND the action is `reversible-mutation` (non-outbound,
non-paid) AND `confidence ≥ threshold(action)` (learned threshold if present, else
`HIGH_CONFIDENCE_THRESHOLDS`)
WHEN `decideAction` is called
THEN it returns `{ disposition: "execute", … }`.

**AC-10 (`auto-high-confidence` confirms below-threshold).**
GIVEN `approvalMode = "auto-high-confidence"` AND the action is `reversible-mutation` AND
(`confidence` is absent OR `confidence < threshold(action)`)
WHEN `decideAction` is called
THEN it returns `{ disposition: "confirm", … }` (fall back to per-item review, NOT batch — mirrors
`enforceAgentApprovalMode`'s borderline rule, `approval-mode.ts:174-178`).

**AC-11 (`auto-high-confidence` still confirms destructive + outbound).**
GIVEN `approvalMode = "auto-high-confidence"` AND the action is `destructive` OR `outbound`
WHEN `decideAction` is called (even with `confidence = 1`)
THEN it returns `{ disposition: "confirm", … }`. (Autonomy auto-runs *reversible safe* work; it does
not silently fire irreversible or external actions — matches the conservative `1.1`-threshold posture
for sequence enrollment, `approval-mode.ts:95-97`.)

**AC-12 (action's own `confirm:"never"` is honoured only when safe).**
GIVEN the action is `reversible-mutation` with `confirm === "never"` AND `role ∈ {member, admin}` AND
`approvalMode ∈ {batch-daily, auto-high-confidence}`
WHEN `decideAction` is called
THEN under `auto-high-confidence` it returns `execute` (subject to AC-9/AC-10 confidence), and under
`batch-daily` it returns `queue`. The action's `confirm` policy can only **raise** the bar
(`confirm:"always"|"risky"` → `confirm`), never **lower** the mode's floor.

**AC-13 (`confirm:"always"` forces a card regardless of mode, except refuse/paid win).**
GIVEN any `reversible-mutation` with `confirm === "always"` AND `role ∈ {member, admin}`
WHEN `decideAction` is called with `approvalMode = "auto-high-confidence"` and `confidence = 1`
THEN it returns `{ disposition: "confirm", … }`.

### 3.B Autonomy level drives the decision

**AC-14 (level change changes `decideAction` output).**
GIVEN a tenant whose `autonomyConfig.level` is `copilot`
WHEN the level is changed to `autonomous` (via `PUT /api/settings/autonomy`) AND `decideAction` is
subsequently called for a `reversible-mutation` with `confidence ≥ threshold`
THEN the disposition changes from `confirm` (copilot ⇒ derived `review-each`) to `execute`
(autonomous ⇒ derived `auto-high-confidence`). The user-facing toggle is now load-bearing.

**AC-15 (single read path; level ⟶ mode).**
GIVEN a tenant
WHEN any consumer needs the effective approval mode
THEN it obtains it through the single derivation `readApprovalMode(settings)` where
`settings.agentApprovalMode` is kept in sync with `autonomyConfig.level` by
`deriveApprovalModeFromLevel(level, trustScore)` (design.md §4). No consumer reads
`autonomyConfig.level` to make an approval decision directly; no consumer re-implements a mode map.

**AC-16 (strategic relaxes thresholds, gated by trust).**
GIVEN `autonomyConfig.level = "strategic"` AND `trustScore.overall ≥ 80`
WHEN the derived mode is computed
THEN it is `auto-high-confidence` **with relaxed learned thresholds passed through**; AND
GIVEN the same level but `trustScore.overall < 80`
THEN level cannot be set to `strategic` (the route already 403s, `autonomy/route.ts:40-48`) — so the
derived mode never reaches relaxed-strategic without trust.

### 3.C One core for chat and background

**AC-17 (chat create/update route through `decideAction`).**
GIVEN the chat `createContact|createAccount|createDeal` (and any create-style `update` branch) tool
WHEN it is invoked
THEN its proposal-vs-execute decision is the result of `decideAction(...)` (mapped: `confirm|queue` ⇒
the existing proposal card; `execute` ⇒ immediate write; `refuse` ⇒ explain + no write). The
pre-CLE-10 `chatCreateDisposition` behaviour is reproduced as a **special case** of the matrix
(design.md §5.1, AC verified by the parity test, tasks T14).

**AC-18 (`invokePageAction` contract unchanged).**
GIVEN `invokePageAction` (CLE-04, `page-actions.ts`)
WHEN CLE-10 replaces the `decideAction` body
THEN `invokePageAction`'s import site and call shape are **byte-identical** to CLE-04 (it already
calls `decideAction({ action, approvalMode, role })`); only the returned disposition for a given input
may change because the body now branches on `approvalMode`/`confidence`. No edit to `page-actions.ts`
is required by CLE-10 (confirmed by an import-stability assertion, tasks T15).

**AC-19 (background loops use the same decision as chat).**
GIVEN the agent-reactor dispatch loop (`agent-reactor.ts:159-202`) and the autonomous pipeline
(`autonomous-pipeline.ts:242-247`)
WHEN they decide whether to execute or defer an action
THEN that decision is produced by the **same core** as chat — either by calling `decideAction`
directly or by calling `enforceAgentApprovalMode`, which CLE-10 re-implements as a thin **delegation
to `decideAction`** (design.md §6). After CLE-10, `autonomous-pipeline.ts`'s bespoke `shouldExecute`
ternary (`:242-247`) is deleted.

**AC-20 (`enforceAgentApprovalMode` signature preserved).**
GIVEN the 9 existing callers of `enforceAgentApprovalMode` (agent-reactor, autonomous-pipeline,
email-intelligence-actions ×5, deal-progression/engine, reply-handler, deal-autofill —
`enforce` call inventory, design.md §1)
WHEN CLE-10 makes it delegate to `decideAction`
THEN its exported signature (`ApprovalDecisionInput → ApprovalDecision`, `approval-mode.ts:142-144`)
is unchanged AND every caller compiles and behaves equivalently for the same inputs (a behaviour-parity
test pins the mapping, tasks T16). This is the "one core, nine green call sites" guarantee.

### 3.D Fail-safe

**AC-21 (fail-safe = confirm/refuse, never silent execute).**
GIVEN any malformed or unknown input (unknown `approvalMode` literal, malformed `confirm`/`cost`
scalar, `mutating` not a boolean)
WHEN `decideAction` is called
THEN it resolves toward MORE control: a malformed mutating/outbound action returns `confirm` (or
`refuse` for a viewer), never `execute`. No defaulting path yields a silent write.

---

## 4. Edge cases

- **EC-1 (unknown stored mode).** `agentApprovalMode` is a legacy/garbage literal on disk →
  `readApprovalMode` already coerces to `"review-each"` (`approval-mode.ts:58-62`); `decideAction`
  receives a valid enum. No special handling needed inside `decideAction`, but the matrix's `default`
  arm still returns `confirm` for safety (AC-21).
- **EC-2 (missing confidence under `auto-high-confidence`).** `confidence === undefined` is treated as
  `0` (below every threshold) → `reversible-mutation` ⇒ `confirm` (AC-10). Matches
  `enforceAgentApprovalMode`'s `confidence ?? 0` (`approval-mode.ts:165`). Deliberate and documented.
- **EC-3 (level vs mode conflict / drift).** `autonomyConfig.level` and `settings.agentApprovalMode`
  disagree (e.g. a legacy tenant whose level was set before the derivation existed, or an admin who
  wrote `agentApprovalMode` directly). Resolution rule (design.md §4): **level is authoritative**;
  the PUT handler always recomputes and persists `agentApprovalMode` from level, and a read-time
  reconciliation (`readApprovalMode` unchanged + a `resolveEffectiveMode(settings, autonomyRow)`
  helper) prefers the level-derived mode when a level row exists. Documented migration backfills
  existing `autonomy_config` rows once.
- **EC-4 (legacy tenants — no `autonomy_config` row).** Many tenants have `agentApprovalMode` set but
  **no** `autonomy_config` row (the table is campaign-engine-scoped). Then there is no level to derive
  from → `resolveEffectiveMode` falls back to `readApprovalMode(settings)` (the existing SSOT). No
  behaviour change for these tenants; CLE-10 is additive for them.
- **EC-5 (Pilae prod tenant).** Pilae (`47dca783`) has `onboardingCompleted:true` and a locked ICP; it
  must not silently change posture. Verify its effective mode is unchanged (it has no relaxed-strategic
  trust and default `review-each` ⇒ stays `review-each`). Spot-check in evaluation.
- **EC-6 (`queue` with no chat-side batch store).** Chat `create/update` and `invokePageAction` have no
  daily-batch persistence pre-CLE-11. When `decideAction` returns `queue` on those surfaces, the caller
  maps `queue → confirm` (show a card) defensively — never silent. Background loops (which DO have the
  `agent_actions` deferral lane) honour `queue` as "defer to the approval lane". The disposition is the
  same; the **caller's** handling of `queue` differs by available infrastructure (design.md §5/§6).
- **EC-7 (`trustScore` unavailable).** `getTrustScore` returns a default state (`overall: 50`) when no
  row exists (`trust-score.ts:76-89`); relaxed-strategic is therefore never granted to a trustless
  tenant. No throw.
- **EC-8 (concurrent level write).** Two PUTs racing on `autonomy_config` — last-writer-wins on the row
  (existing behaviour); the derived `agentApprovalMode` written to `tenant_settings` is recomputed each
  time, so it converges. No new locking required.

---

## 5. Out of scope (explicit)

- **Capture-approvals stays separate (C).** `lib/capture/approval.ts` governs **ingestion** — whether
  an auto-captured `activities` row (email/meeting/call) lands now or waits for human approval. It is a
  *different question* ("should we record what happened?") from `decideAction`'s ("should the agent
  *take* this action?"). Its mode (`captureApprovalMode = auto|review|hybrid`) is a separate setting
  with a separate UI and a separate store (`capture_approvals`). Collapsing it into `decideAction`
  would conflate observation with action and is **not** done here. Documented as a non-goal in
  design.md §8. (Audit §1.3 lists it as the third system precisely because it is correctly scoped to
  ingestion.)
- **Undo / audit extension** (logging every `decideAction` outcome + outbound undo window) = **CLE-11**.
  CLE-10 returns a decision; it persists nothing.
- **Unified permission matrix** (the full role × action SSOT consumed by middleware +
  capability-resolver + PAR) = **CLE-12**. CLE-10's `role` handling is the minimal viewer floor only;
  it does not generalise admin/member route gating.
- **Sending-guardrail hardening** (`enforceSendingIdentity`, `signalAutoEnroll` gating, opt-out, TZ
  windows) = **CLE-13**.
- **Learned-threshold *training*** (computing `learnedThresholds` from outcomes) and full level→behaviour
  per-action wiring = **CLE-16**. CLE-10 only *consumes* `learnedThresholds` if supplied and derives the
  mode from level; it does not train thresholds.
- The `PermissionsMap`/`PermissionValue` campaign-engine vocabulary (`types.ts:120-142`) and
  `execution-gate.ts` are **not** rewired by CLE-10. They are the campaign-engine's per-action send
  policy, downstream of the level. CLE-10 only unifies the *approval-mode* axis; the level→mode
  derivation leaves `execution-gate.ts` reading the same `autonomy_config` row it reads today. (Noted as
  a deliberate boundary, design.md §4.4.)

---

## 6. Evaluation steps (Phase 6, hostile QA)

1. **Matrix unit test green.** Run `vitest run decide-action` — the enumerated matrix test
   (`approvalMode × class × role × confidence`, tasks T13) passes 100%, including every AC-1..AC-13 cell
   and the AC-21 fail-safe arms. `tsc --noEmit` 0 errors.
2. **Signature parity.** A compile-time `satisfies` assertion proves `DecideActionInput` matches README
   §3.5bis verbatim (tasks T13). Grep `decide-action.ts` for the signature and diff it char-for-char
   against §3.5bis.
3. **`enforceAgentApprovalMode` parity.** Run `vitest run guardrails-approval-mode approval-mode-learned`
   — the existing two suites stay **green unchanged** (the delegation preserves behaviour), plus the new
   parity test (tasks T16) asserts equivalence across the full mode×action×confidence grid.
4. **Chat create gate.** Build the create tools with `agentApprovalMode: "review-each"`; invoke
   `createContact.execute({...})`; assert `proposal === true` and **no DB insert** (spy not called).
   Repeat with `auto-high-confidence` (+ no confidence) → assert immediate write. This reproduces the
   CLE-00 regression net through the new core (tasks T14).
5. **`invokePageAction` import stability.** Confirm `page-actions.ts` is **unmodified** by CLE-10 (git
   diff shows no change) and its tests (`page-actions.tools.test.ts`) still pass — the body swap is
   transparent at the call site (AC-18, tasks T15).
6. **Background parity.** Unit-test the agent-reactor dispatch mapping and the autonomous-pipeline
   decision: for a fixed `(mode, action, confidence)` the execute/defer outcome equals chat's
   disposition for the equivalent action metadata (tasks T16/T17). Confirm `autonomous-pipeline.ts`'s
   `shouldExecute` ternary is gone (grep).
7. **Level toggles behaviour (the headline).** With a test tenant: set level `copilot`, assert derived
   mode `review-each` and a reversible-mutation ⇒ `confirm`; `PUT` level `autonomous`, assert derived
   mode `auto-high-confidence` and the same action at high confidence ⇒ `execute` (AC-14). Verify the
   single read path (`resolveEffectiveMode`) returns the level-derived mode (AC-15).
8. **Strategic trust gate.** With `trustScore < 80`, `PUT level:"strategic"` → 403 (unchanged); with
   `trustScore ≥ 80`, derived mode is `auto-high-confidence` with relaxed thresholds (AC-16).
9. **Capture-approvals untouched.** Confirm `lib/capture/approval.ts` and its tests are unchanged; a
   tenant in `captureApprovalMode:"review"` still parks captures regardless of `decideAction` (out of
   scope proof).
10. **Regression.** `regression.sh` green; drift check; no new runtime dependency.
