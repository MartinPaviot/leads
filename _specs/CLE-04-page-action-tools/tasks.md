# CLE-04 — Server tools `listPageActions` / `invokePageAction` + plumbing + routing heuristic — Tasks

> Branch: `feat/CLE-04-page-action-tools` (off `main`; depends on CLE-03 being merged or present on the branch base — it provides `invokeActionDirective`, the envelope constants, and the manifest types).
> Commit trailer (CLAUDE.md): `Co-Authored-By: Rippletide <admin@rippletide.com>`.
> All paths under `app/apps/web/`. Work in dependency order: the `decideAction` stub and the JSON-Schema validator are leaf deps of the tools; the tools are the leaf dep of the route/router/prompt wiring.
> Each task: **action → file → verify → test**. A task is "done" only when its verify passes and its test is written + green.

---

### Task 1 — `decideAction` stub (the decision authority, verbatim §3.5bis signature)
- **Action:** Create `lib/guardrails/decide-action.ts` with the exact README §3.5bis signature (input `{ action, approvalMode, role, confidence? }`, output `{ disposition: "execute"|"confirm"|"queue"|"refuse"; reason }`) and the conservative body from design §2.1 (viewer+mutating/outbound→refuse; outbound+money→confirm; outbound→confirm; mutating+!reversible→confirm; mutating+reversible→honour `confirm` policy; pure-read→execute; malformed→fail-safe confirm). Import `ApprovalModeV2` from `@/lib/guardrails/approval-mode`. Add the header comment stating CLE-10 replaces the **body** (not the signature) and that it reconciles with CLE-00's `chatCreateDisposition`.
- **Verify:** `pnpm tsc --noEmit` clean. Manually trace each §4 branch once.
- **Test:** `src/__tests__/decide-action.test.ts` — table-test all branches in design §6 (`decide-action.test.ts` bullet), incl. malformed-scalar fail-safe and a non-empty `reason`. Add a compile-time `satisfies`/type assertion that `DecideActionInput` matches the README §3.5bis shape.

### Task 2 — Server-side JSON-Schema → Zod validator (the AC-4 server gate)
- **Action:** Create `lib/chat/page-actions/manifest-validate.ts` exporting `jsonSchemaToZod(schema: unknown): z.ZodType` covering the `z.toJSONSchema` subset for plain `z.object` params (object/required/enum/array/string/number/integer/boolean/null; unknown → `z.unknown()`), per design §2.4. No new dependency (no `ajv`).
- **Verify:** `pnpm tsc --noEmit` clean. Round-trip a known schema in a scratch REPL: `z.toJSONSchema(z.object({a:z.string(), b:z.number().optional()}))` → `jsonSchemaToZod(...)` accepts `{a:"x"}`, rejects `{}`.
- **Test:** `src/__tests__/manifest-validate.test.ts` — accept/reject cases for object+required, optional, enum, array, type mismatch, and the unknown-construct→accept fallback (design §6 `manifest-validate.test.ts` bullet).

### Task 3 — Extend `ToolContext` with the manifest
- **Action:** In `lib/chat/tools/context.ts`, add `pageActionManifest?: PageActionManifest` to the `ToolContext` interface; add `import type { PageActionManifest } from "@/lib/chat/page-actions/types"` (CLE-03 type, `type`-only import).
- **Verify:** `pnpm tsc --noEmit` clean (no consumer breaks — the field is optional). Confirm `lib/chat/page-actions/types.ts` exists (CLE-03) and exports `PageActionManifest`.
- **Test:** Covered transitively by Task 5's tool tests (which construct a `ToolContext` with `pageActionManifest`). No standalone test needed for a type-only change; the type assertion in Task 5 is the guard.

### Task 4 — The two server tools (`page-actions.ts`)
- **Action:** Create `lib/chat/tools/page-actions.ts` exporting `buildPageActionTools(ctx: ToolContext)` with `listPageActions` (READ; returns `ctx.pageActionManifest` entries, or `{ actions: [], note }` when absent; trims schemas over the 60-entry hard cap) and `invokePageAction({ actionId, params? })` per design §2.3: guard no-manifest → error; unknown id → `{ error, availableActionIds }`; `jsonSchemaToZod(entry.paramsJsonSchema).safeParse(params)` fail → `{ error }`; `decideAction({action: entry scalars, approvalMode: readApprovalMode(ctx.settings), role})`; `refuse` → `{ error }`; else `requireConfirm = disposition !== "execute"`, `invocationId = crypto.randomUUID()`, return `{ invoked, ...invokeActionDirective(invocationId, actionId, parsed.data, requireConfirm) }`. Import `invokeActionDirective` from `@/lib/chat/ui-directives` (CLE-03 — do NOT re-implement), `decideAction`, `readApprovalMode`, `jsonSchemaToZod`. **Neither tool performs any DB/network mutation.**
- **Verify:** `pnpm tsc --noEmit` clean. Grep the file for `db.`/`fetch(`/`inngest` → zero hits (the tool must not mutate). Confirm `invokeActionDirective` is imported, not defined.
- **Test:** `src/__tests__/page-actions.tools.test.ts` — the fixture-manifest suite in design §6, including:
  - `listPageActions` with manifest → all entries+schema; with `undefined` → empty+note.
  - happy path `invokePageAction("accounts.applyFilter", {industry:"fintech"})` → `_uiDirective.kind==="invokeAction"`, `requireConfirm:false`, uuid `invocationId`.
  - **REQUIRED: `invokePageAction("nope.nope", {})` → `{ error, availableActionIds }` with NO `_uiDirective` key** (refuse unknown actionId).
  - **REQUIRED: `requireConfirm` reflects `decideAction`** — `accounts.delete` (mutating+!reversible) → `true`; `sequences.launch` (outbound+money) → `true`; `accounts.applyFilter` (read) → `false`.
  - bad params → `{ error }` + `decideAction` spy not called.
  - over-cap manifest → `listPageActions` trimmed + `truncated:true`.

### Task 5 — Viewer gating: `invokePageAction` is the gateway (refusal is per-action)
- **Action:** In `lib/agents/capability-resolver.ts`, add `VIEWER_GATEWAY_TOOLS = new Set(["invokePageAction"])` and short-circuit it to `true` inside `isViewerAllowedTool` (design §2.7), so the tool is reachable by viewers while `decideAction` refuses mutating/outbound page actions inside the tool (AC-5/AC-8).
- **Verify:** `pnpm tsc --noEmit` clean. `isViewerAllowedTool("invokePageAction") === true`; `isViewerAllowedTool("accounts.delete-ish-name") ` unaffected.
- **Test:** Extend `page-actions.routing.test.ts` (Task 7) — assert `isViewerAllowedTool("invokePageAction")` is true; assert a viewer `ToolContext` + `accounts.delete` invocation refuses (no directive) while a viewer + `accounts.applyFilter` emits a directive with `requireConfirm:false`.

### Task 6 — Register the two tools in `buildAllChatTools`
- **Action:** In `lib/chat/tools/index.ts`, `import { buildPageActionTools } from "./page-actions"` and add `...buildPageActionTools(ctx)` to the returned object (design §2.5).
- **Verify:** `pnpm tsc --noEmit` clean. `Object.keys(buildAllChatTools(mockCtx))` includes `listPageActions` and `invokePageAction`.
- **Test:** Covered by Task 7 (asserts both names present in a `buildAllChatTools` snapshot). 

### Task 7 — Group the tools in tool-router + orchestrator (CLE-01 drift-guard coordination)
- **Action:** Add `listPageActions: "query"` and `invokePageAction: "action"` to `TOOL_GROUPS` in `lib/chat/tool-router.ts` (near the navigation/command block) **and** to `TOOL_GROUP_MAP` in `lib/agents/orchestrator.ts` (design §2.8).
- **Verify:** `pnpm tsc --noEmit` clean. `getToolGroup("listPageActions")==="query"`, `getToolGroup("invokePageAction")==="action"`. If CLE-01 is present, its drift-guard test (every `buildAllChatTools` tool ∈ `TOOL_GROUPS`) passes.
- **Test:** `src/__tests__/page-actions.routing.test.ts` — assert both group lookups (router + orchestrator agree); assert `resolveCapabilities` keeps both tools for `member`/`admin` and keeps both for `viewer` (`listPageActions` via group `query`, `invokePageAction` via `VIEWER_GATEWAY_TOOLS`); assert `buildAllChatTools(mockCtx)` snapshot contains both names.

### Task 8 — Route plumbing: parse `pageActions` and thread it into `toolCtx`
- **Action:** In `app/api/chat/route.ts`: add `pageActions` to the body destructure + its body type `pageActions?: PageActionManifest` (`route.ts:401-418`); add `import type { PageActionManifest } from "@/lib/chat/page-actions/types"`; set `pageActionManifest: pageActions` in the `toolCtx` object (`route.ts:603-609`). Per design §2.6.
- **Verify:** `pnpm tsc --noEmit` clean. Trace that `pageActions` from the body reaches `toolCtx.pageActionManifest` (read the two edited spots). Confirm no other route logic changed.
- **Test:** `src/__tests__/chat-route-pageactions.test.ts` (or typed inspection per design §6) — assert the body type admits `pageActions: PageActionManifest` and that `buildPageActionTools` reads `ctx.pageActionManifest` (a thin test constructing a `ToolContext` and asserting `listPageActions` returns the threaded manifest).

### Task 9 — System prompt: §3.6 heuristic, envelope reading, third command-layer lever
- **Action:** In `lib/prompts/chat-system-prompt.ts`: import `ACTION_RESULT_OPEN`/`ACTION_RESULT_CLOSE` from `@/components/chat/use-ui-directives` (CLE-03 §2.4; if the client-module import is awkward at the bundler boundary, re-export them from a tiny pure `lib/chat/page-actions/result-tags.ts` and import there — do NOT redefine the literals). Add the third `invokePageAction` bullet to `<command_layer>` (`:179-191`). Insert the new `<page_actions>` block (two-tier routing heuristic + envelope-reading rules) after `</command_layer>`, before `<multi_step_orchestration>` (`:193`), per design §2.9.
- **Verify:** `pnpm tsc --noEmit` clean. Build the prompt with a stub `SystemPromptParams`; print and eyeball the `<page_actions>` block + the new command-layer bullet; confirm the envelope tags render their literal values.
- **Test:** Extend `src/__tests__/chat-system-prompt.test.ts` (or add one) — assert the built prompt string contains "Two-tier routing", "invokePageAction", "Off-web", the literal `[[action-result]]`/`[[/action-result]]` tags, and that `<command_layer>` mentions `invokePageAction` (design §6 prompt bullet).

### Task 10 — Full acceptance + regression sweep
- **Action:** Run the whole CLE-04 test set + the repo regression. Re-read AC-1..AC-9 and E-1..E-9 against the code; confirm the two **required** tests (unknown-actionId refusal; `requireConfirm` reflects `decideAction`) are present and green.
- **Verify:** `pnpm tsc --noEmit` → 0 errors. `pnpm vitest run` for the new files → all green. `bash regression.sh` (repo root) → green. CLE-03's tests (`ui-directives`, `registry`, `action-result-envelope`, the integration tests) untouched and green. Grep `lib/chat/tools/page-actions.ts` once more for `db.`/`fetch(` → zero (no mutation). Confirm no new runtime dependency landed in `apps/web/package.json`.
- **Test:** This task is the gate, not new code. If any AC/edge case lacks a test, add it before declaring done (CLAUDE.md: every feature 100% tested, every bug → regression test).

---

## Dependency / ordering notes
- Tasks 1–2 (leaf deps) before Task 4 (the tools consume both). Task 3 (context) before Task 4. Task 4 before Tasks 6–8 (registration/routing/route read the tool). Task 5 (viewer gate) pairs with Task 7's routing test. Task 9 (prompt) is independent of 4–8 and can be done any time after CLE-03's envelope constants exist; do it before Task 10.
- **CLE-01 interaction:** Task 7 adds the two tools to both group maps, so CLE-01's drift-guard stays green regardless of merge order. If CLE-04 lands first, the tools fail-open (unknown→included) until CLE-01; once CLE-01 lands they are already mapped. No orphaned-tool window.
- **CLE-05 interaction:** CLE-04 emits `requireConfirm` on the directive; CLE-05 renders the confirm card when `requireConfirm:true`. Until CLE-05, a `requireConfirm:true` directive still reaches CLE-03's `runUiDirective`, whose `invokeAction` arm (CLE-03 §2.4) currently runs directly for the smoke action; CLE-05 adds the branch on `requireConfirm`. CLE-04 does not depend on CLE-05 to emit a correct boolean.
- **CLE-10 interaction:** `decideAction`'s **body** is replaced by CLE-10 (unified plane reading `approvalMode`×confidence×role×metadata) — the **signature** and the import site in `invokePageAction` do not change. CLE-10 also absorbs CLE-00's `chatCreateDisposition`. Keep the stub's outputs non-contradictory with CLE-00 for overlapping cases (requirements §4).
