# CLE-00 — Approval-gate rewire (tasks)

> Branch: `feat/CLE-00-approval-gate-rewire`. Merge to main only on Phase 6 PASS.
> Commit trailer: `Co-Authored-By: Rippletide <admin@rippletide.com>`.
> Order matters: helper first, then consumers, then prompt, then tests, then verify.
> One feature branch. `tsc` 0 errors and all tests green before merge.

---

### T0 — Branch + re-confirm the bug (verification gate)
- **Action**: create branch `feat/CLE-00-approval-gate-rewire`. Re-read the four sites to
  confirm they still match requirements §0: `route.ts:554-556`, `create.ts:58/63/96/101/
  128/133`, `chat-system-prompt.ts:352`, `tenant-settings.ts:455`.
- **Verify**: `grep -rn 'agentApprovalMode === "ask"' app/apps/web/src/lib` returns the
  create + prompt sites (the dead branches). `grep -n 'agentApprovalMode || "auto"'
  app/apps/web/src/app/api/chat/route.ts` returns line 555.
- **Test to write**: none (verification only). Record the grep output in the PR body.

---

### T1 — Add the minimal disposition mapper to the SSOT module
- **Action**: append `chatCreateDisposition(mode, confidence?)` to
  `app/apps/web/src/lib/guardrails/approval-mode.ts` exactly as in design §3 (uses the
  existing `HIGH_CONFIDENCE_THRESHOLDS["contact-create"]`, `ApprovalModeV2`, exhaustive
  `switch`, default `"proposal"`). Add the forward-compat comment naming CLE-10.
- **File**: `app/apps/web/src/lib/guardrails/approval-mode.ts`.
- **Verify**: `pnpm -C app/apps/web exec tsc --noEmit` → 0 errors; the `never`
  exhaustiveness check compiles.
- **Test to write**: in the new test file (T6), the "Mapper unit" block (design §7.1).

---

### T2 — Coerce at the route read site (the core fix)
- **Action**: in `app/apps/web/src/app/api/chat/route.ts`, replace the producer at
  `route.ts:554-556` body `return tenantSettings.agentApprovalMode || "auto";` with
  `return readApprovalMode(tenantSettings);`. Add the import
  `import { readApprovalMode, chatCreateDisposition, type ApprovalModeV2 } from
  "@/lib/guardrails/approval-mode";` (chatCreateDisposition used in T4).
- **File**: `app/apps/web/src/app/api/chat/route.ts`.
- **Verify**: `tsc` 0 errors; the destructured `agentApprovalMode` (`route.ts:457`) now
  carries a canonical v2 value. Confirm it still flows into `toolCtx` (`route.ts:608`)
  and `buildChatSystemPrompt` (`route.ts:665`).
- **Test to write**: covered by the end-to-end coercion test (design §7.4) — assert
  `readApprovalMode` mapping for `"ask"`/`"auto"`/unset is what the route now emits.

---

### T3 — (Recommended) tighten `ToolContext.agentApprovalMode` type
- **Action**: in `app/apps/web/src/lib/chat/tools/context.ts:11`, change
  `agentApprovalMode: string;` → `agentApprovalMode: ApprovalModeV2;` and import the type
  from `@/lib/guardrails/approval-mode`. (Skip only if it forces churn elsewhere — then
  cast `as ApprovalModeV2` in T4 instead, per design §3.)
- **File**: `app/apps/web/src/lib/chat/tools/context.ts`.
- **Verify**: `tsc` 0 errors. The one producer (`route.ts:608`) already passes a coerced
  value, so no producer change is needed. Search for other `agentApprovalMode:` literals
  passed into a `ToolContext` and confirm none pass a raw legacy value.
- **Test to write**: none (type-level; `tsc` is the gate).

---

### T4 — Rewire the create tools to the disposition
- **Action**: in `app/apps/web/src/lib/chat/tools/create.ts`:
  - import `chatCreateDisposition` (and `ApprovalModeV2` if casting per T3 fallback).
  - after `create.ts:29`, add `const proposeFirst = chatCreateDisposition(agentApprovalMode) === "proposal";`.
  - replace each `agentApprovalMode === "ask"` (descriptions at `:58/:96/:128`, execute
    guards at `:63/:101/:133`) with `proposeFirst`. Keep the proposal object shape and
    the immediate-execute paths byte-for-byte otherwise.
- **File**: `app/apps/web/src/lib/chat/tools/create.ts`.
- **Verify**: `grep -n 'agentApprovalMode === "ask"' app/apps/web/src/lib/chat/tools/
  create.ts` → 0 results. `tsc` 0 errors.
- **Test to write**: the regression assertions (design §7.2 and §7.3) — `review-each`
  returns `{ proposal:true }` with **no insert**; `auto-high-confidence` inserts and
  returns `{ created }`.

---

### T5 — Drive the system-prompt block from the same function
- **Action**:
  - in `app/apps/web/src/lib/prompts/chat-system-prompt.ts`: add
    `approvalRequiresReview: boolean;` to `SystemPromptParams` (`:8-18`); change the
    block guard at `:352` from `agentApprovalMode === "ask"` to
    `params.approvalRequiresReview`. Remove `agentApprovalMode` from the interface/destructure
    if it has no other reader (it does not).
  - in `app/apps/web/src/app/api/chat/route.ts:658-668`: pass
    `approvalRequiresReview: chatCreateDisposition(agentApprovalMode) === "proposal"` into
    `buildChatSystemPrompt({...})`; drop the now-unused `agentApprovalMode` arg if removed
    from the interface.
- **Files**: `chat-system-prompt.ts`, `route.ts`.
- **Verify**: `grep -n 'agentApprovalMode === "ask"' app/apps/web/src/lib/prompts/
  chat-system-prompt.ts` → 0 results. `tsc` 0 errors. Manually confirm the
  `<approval_mode>` block (with the `[Approved: …]` instructions, `:358-362`) is present
  for `review-each` and absent for `auto-high-confidence` (no confidence) by reading the
  built prompt in a unit assertion.
- **Test to write**: prompt-flag test (design §7.5) — assert the exact expression
  `chatCreateDisposition(mode) === "proposal"` yields true for review-each/batch-daily,
  false for auto-high-confidence(null). (Guarantees prompt + tool can't drift.)

---

### T6 — Write the test file (regression net)
- **Action**: create `app/apps/web/src/__tests__/chat-create-approval-gate.test.ts`
  implementing design §7.1–§7.5 (+ §7.6 grep guard optional). Reuse the repo's DB-mock
  pattern (Proxy-fallback schema mock per `reference_ci-health-and-test-flakes`); spy on
  `db.insert` to assert it is NOT called in `review-each` and IS called once in
  `auto-high-confidence`. Build tools via `buildCreateTools(ctx)` with a hand-made
  `ToolContext` (mock `authCtx.role: "member"`).
- **File**: `app/apps/web/src/__tests__/chat-create-approval-gate.test.ts`.
- **Verify**: `pnpm -C app/apps/web exec vitest run chat-create-approval-gate` → all
  green. The **review-each → proposal, no mutation** case is the assertion that fails on
  the pre-fix code (run it once against a stash of the old `create.ts` to prove it
  catches the regression).
- **Test to write**: this task *is* the tests.

---

### T7 — Full static + unit gate
- **Action**: run `pnpm -C app/apps/web exec tsc --noEmit` and the relevant vitest
  files: the new one plus `guardrails-approval-mode.test.ts` (must stay green —
  unchanged signatures).
- **Verify**: 0 tsc errors; both test files green. Repo-wide grep:
  `grep -rn 'agentApprovalMode === "ask"' app/apps/web/src` returns **only** the legacy
  coercion table in `approval-mode.ts` (the `case "ask":` arm) and the `update.ts`
  settings-writer enum list — **no** behavioral branch in tools/prompt.
- **Test to write**: none.

---

### T8 — Live verification (Playwright, hostile)
- **Action**: per `reference_callmode-local-verify` / `reference_dev-session-mint`, run
  the app with `--turbopack`, mint a session as `martin.paviot@pilae.ch` (tenant
  `47dca783`, effective mode `review-each` = prod default). In chat, send: *"create a
  contact named Test Reviewer at Acme"*.
- **Verify**:
  1. An editable proposal card renders (no immediate "created" confirmation).
  2. `SELECT count(*) FROM contacts WHERE tenant_id='47dca783' AND first_name='Test'`
     → unchanged **before** clicking Approve (proves no silent mutation).
  3. Click Approve → row appears; the `[Approved: …]` follow-up is handled without error.
  4. Set mode to `auto-high-confidence` (Settings or `update.ts`), ask to create a deal →
     immediate `{ created }`, row present, `tool_call_events` create row written, no card.
     Restore mode to `review-each` after.
  Screenshot each state to `_research/raw/` (CLAUDE.md screenshot rule).
- **Test to write**: none (manual eval evidence; attach screenshots to the PR).

---

### T9 — Commit + PR
- **Action**: commit per task group with the Rippletide trailer; open PR
  `feat/CLE-00-approval-gate-rewire`. PR body: paste the T0 grep proof, the requirements
  §0 value-flow trace, the T8 screenshots, and the EC-3 callout (unconfigured tenants now
  card instead of auto-executing — intentional, matches the stored default).
- **Verify**: CI (tsc + vitest) green. Phase 6 hostile eval per requirements §5. Merge to
  main only on PASS; on FAIL delete branch + respec.
- **Test to write**: none.

---

## Definition of done
- `readApprovalMode` is the only producer of the chat approval mode (no raw value past
  `route.ts:556`).
- Create tools + system prompt branch on `chatCreateDisposition` (one function, no
  literal `=== "ask"` behavioral test remains).
- `review-each` (and `batch-daily`) → proposal card, **no mutation**; `auto-high-confidence`
  → immediate create (current UX preserved); unknown → safest (card).
- New regression test asserts create-in-review-each returns a proposal, not a mutation.
- `tsc` 0 errors; new + existing approval-mode tests green; live eval shows a card (not a
  silent write) under the prod-default mode.
- No README contract redefined; the mapper is documented as the CLE-10 `decideAction` seam.
