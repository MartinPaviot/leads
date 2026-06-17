# CLE-03 — `invokeAction` directive + Page Action Registry (PAR core) — Tasks

> Branch: `feat/CLE-03-action-directive-and-registry`. Commit trailer: `Co-Authored-By: Rippletide <admin@rippletide.com>`.
> Order is dependency-correct: types → directive → registry → executor → dock wiring → smoke action → integration tests → regression.
> Each task: **action**, **file(s)**, **verify**, **test to write**. Implement code → write test → verify → commit → mark done.
> Contracts are frozen in `_specs/chat-live-executor/README.md` §3.1/§3.2/§3.3/§3.5 — match them verbatim (see `design.md` §2 for the exact TypeScript).

---

## T1 — Page Action types (README §3.2 + §3.3)

- **Action:** Create `lib/chat/page-actions/types.ts` with `PageAction<P>`, `PageActionResult`, `PageActionManifestEntry`, `PageActionManifest` exactly as `design.md` §2.2 (verbatim from README §3.2/§3.3). `import type { z } from "zod"`.
- **File:** `app/apps/web/src/lib/chat/page-actions/types.ts` (new).
- **Verify:** `pnpm tsc --noEmit` compiles; field-by-field diff against README §3.2/§3.3 (no renamed/missing/extra fields; `params: z.ZodType<P>`; manifest entry has `outbound`/`reversible`/`cost` **required**).
- **Test:** none yet (pure types; covered by the T9 type-contract guard).
- **Commit:** `feat(CLE-03): page-action types (PageAction, PageActionResult, manifest entry)`.

## T2 — Extend the directive union + builder + parser (README §3.1)

- **Action:** In `ui-directives.ts`: add the `invokeAction` arm to `UiDirective` (verbatim §3.1); add `invokeActionDirective(invocationId, actionId, params, requireConfirm)` (mirrors `navigateDirective`/`composeEmailDirective`); add the `invokeAction` branch to `parseUiDirective` that validates `invocationId`/`actionId` (non-empty strings via `asNonEmptyString`), `params` (object via `isRecord`), `requireConfirm` (boolean), returning `null` on any miss. Do **not** touch the `navigate`/`composeEmail` arms.
- **File:** `app/apps/web/src/lib/chat/ui-directives.ts`.
- **Verify:** `tsc` clean; the two existing builders/branches are byte-unchanged (git diff shows only additions).
- **Test:** `lib/chat/__tests__/ui-directives.test.ts` — `invokeActionDirective` returns `{ [UI_DIRECTIVE_KEY]: { kind:"invokeAction", … } }`; `parseUiDirective` accepts a well-formed `invokeAction`; rejects (→ `null`) each malformed variant: missing `invocationId`, missing `actionId`, `params` not an object, `requireConfirm` not boolean; **regression**: a valid `navigate` and a valid `composeEmail` still parse to the same result as before.
- **Commit:** `feat(CLE-03): invokeAction directive kind + builder + parser (README §3.1)`.

## T3 — The registry: store, serializer, three contract fns (README §3.3)

- **Action:** Create `lib/chat/page-actions/registry.ts` per `design.md` §2.3: module-level `Map<id, {action, owner}>`; `toJsonSchema` via **`z.toJSONSchema`** with a `WeakMap` cache; `toManifestEntry` (strips fns, applies defaults `outbound??false`, `reversible??false`, `cost??"free"`); `useRegisterPageActions` (idempotent per id, owner-scoped unmount cleanup, collision `console.warn`); `getActionManifest` (serialize all, soft 16 KB budget warn); `runRegisteredAction` (unregistered → error result; `safeParse` bad params → error result without calling `run`; try/catch around `run`). `"use client"` at top.
- **File:** `app/apps/web/src/lib/chat/page-actions/registry.ts` (new).
- **Verify:** `tsc` clean; **no new dependency added to `package.json`** (Zod 4 native); a quick `node -e` (or the T3 test) confirms `z.toJSONSchema(z.object({message:z.string().optional()}))` yields an object schema with `message:string`, not required.
- **Test:** `lib/chat/page-actions/__tests__/registry.test.ts` —
  1. register smoke action → `getActionManifest()` returns 1 entry; deep-equal AND `JSON.stringify` byte-identical across two calls;
  2. entry has no `run` key, no Zod object; `paramsJsonSchema` equals expected JSON Schema; defaults applied;
  3. `runRegisteredAction("nope", {})` → `{ok:false, error:"action_not_registered"}` (resolves, not rejects);
  4. `runRegisteredAction("debug.ping", {message:42})` → `{ok:false, error:"invalid_params"}` and a `run` **spy is not called**;
  5. register an action whose `run` throws → `{ok:false}` with an `error`, no unhandled rejection;
  6. E-1: register `[debug.ping]` twice → manifest length 1 for that id;
  7. E-2: register the same id from two distinct owners → `console.warn` spy called, manifest has id once;
  8. E-4: register an action with an oversized description (> 16 KB) → `console.warn` spy called with byte size; manifest still returned (not truncated).
  > Reset module state between tests (clear the store) — e.g. `vi.resetModules()` + re-import, or an internal test-only `__clearRegistry()` un-exported from the public surface but reachable in tests via `vi.resetModules`. Prefer `vi.resetModules()` to keep the public API clean.
- **Commit:** `feat(CLE-03): page-action registry (register/manifest/run) + z.toJSONSchema serialization`.

## T4 — Result envelope codec (README §3.5, frozen format)

- **Action:** In `use-ui-directives.ts`, add the exported constants `ACTION_RESULT_OPEN`, `ACTION_RESULT_CLOSE`, the `ActionResultEnvelope` interface, and `encodeActionResult(invocationId, result)` per `design.md` §2.4. These are the contract CLE-04's prompt imports.
- **File:** `app/apps/web/src/components/chat/use-ui-directives.ts`.
- **Verify:** `tsc` clean; the produced string matches `^\[\[action-result\]\]\{.*\}\[\[/action-result\]\]$`.
- **Test:** `components/chat/__tests__/action-result-envelope.test.ts` — `encodeActionResult("inv-1", {ok:true, summary:"pong: hi", data:{echoed:"hi"}})` wraps the exact tags; round-trips via `JSON.parse(inner)` to `{invocationId:"inv-1", ok:true, summary:"pong: hi", data:{echoed:"hi"}}`; omits `data` when undefined and `error` when falsy; always preserves `invocationId`.
- **Commit:** `feat(CLE-03): frozen action-result envelope codec ([[action-result]]…)`.

## T5 — Dispatch branch in `runUiDirective` (the client executor)

- **Action:** In `use-ui-directives.ts`, extend the `runUiDirective` ctx with `sendActionResult: (text: string) => void` and add the `invokeAction` branch: `void runRegisteredAction(d.actionId, d.params).then(r => ctx.sendActionResult(encodeActionResult(d.invocationId, r)))` (fire-and-forget so a page unmount can't cancel it — E-3). Leave `navigate`/`composeEmail` arms unchanged. `useUiDirectives` structure (once-only, keyed `${last.id}:${idx}`) is unchanged.
- **File:** `app/apps/web/src/components/chat/use-ui-directives.ts`.
- **Verify:** `tsc` clean across both call sites (dock + `/chat` page) — they will fail to compile until T6 supplies `sendActionResult`; that is expected and fixed in T6 (or stub the ctx in both within this task to keep `tsc` green per-commit). Prefer: update both call sites' ctx in this same commit so `tsc` stays green.
- **Test:** covered by T7 (integration). Optionally a focused unit: call `runUiDirective({kind:"invokeAction", …}, {…, sendActionResult: spy})` with `debug.ping` registered → `spy` called once with an `[[action-result]]` string carrying `ok:true`.
- **Commit:** `feat(CLE-03): dispatch invokeAction → registry → result round-trip in runUiDirective`.

## T6 — Put the manifest on the wire + wire `sendActionResult` (ChatDock + /chat)

- **Action:** In `chat-dock.tsx`: add `manifestRef = useRef(getActionManifest())` refreshed each render; in the transport `body: () =>` include `payload.pageActions = manifestRef.current` **only when non-empty** (extends `chat-dock.tsx:110-119`); add `sendActionResult: (text) => chat.sendMessage({ text })` to the `onDirective` ctx (extends `:129-137`) and add `chat` to its dep array. In `chat/page.tsx`: add the same `sendActionResult` one-liner to its `runUiDirective` ctx (`:69-76`) so the shared signature is satisfied; **do not** add a `body` fn there (it must keep sending no manifest — AC-7).
- **Files:** `app/apps/web/src/components/chat/chat-dock.tsx`, `app/apps/web/src/app/(dashboard)/chat/page.tsx`.
- **Verify:** `tsc` clean; manual inspection — dock body includes `pageActions` iff a manifest exists; `/chat` transport (`page.tsx:46-51`) still has no `body`. Confirm `getActionManifest` import added to the dock. The server reading `body.pageActions` is CLE-04 — here we only confirm the field is present in the outgoing body (e.g. log the payload in a dev run, or assert via the T6 unit below).
- **Test:** `components/chat/__tests__/chat-dock-body.test.ts` (or a focused harness) — with the smoke action registered, the transport `body()` returns an object containing `pageActions` (length 1); with nothing registered, `body()` omits `pageActions`. (If the `body` closure is not easily isolable, assert the equivalent helper: a small exported `buildChatBody(surface, threadId, manifest)` that both the test and the dock use — extract it to keep the closure testable.)
  > Recommended: extract `buildChatBody(...)` into `chat-dock.tsx` (or a tiny `chat/transport-body.ts`) so the body logic is unit-testable rather than trapped in the `useMemo` closure.
- **Commit:** `feat(CLE-03): ChatDock posts page-action manifest in body; round-trip wired (both surfaces)`.

## T7 — Smoke action + full round-trip integration test (AC-9, AC-2, AC-3)

- **Action:** Add the `debug.ping` smoke action fixture: `{ id:"debug.ping", title:"Ping (debug)", description:"Test action: echoes a message back.", params: z.object({ message: z.string().optional() }), run: async ({message}) => ({ ok:true, summary:`pong: ${message ?? ""}`, data:{ echoed: message ?? "" } }), mutating:false, confirm:"never" }`. Place it in a fixtures file so it ships no real page surface.
- **File:** `app/apps/web/src/lib/chat/page-actions/__fixtures__/debug-ping.ts` (new) — or co-located in the test if preferred.
- **Verify:** the fixture compiles and satisfies `PageAction`.
- **Test:** `components/chat/__tests__/use-ui-directives.integration.test.tsx` —
  - **Happy path:** register `debug.ping`; build a directive via `invokeActionDirective("inv-1","debug.ping",{message:"hi"},false)`; extract the directive with `parseUiDirective`; call `runUiDirective(directive, {navigate:noop, openComposer:noop, sendActionResult: spy})`; await a microtask; assert `spy` called once with text whose inner JSON deep-equals `{invocationId:"inv-1", ok:true, summary:"pong: hi", data:{echoed:"hi"}}`.
  - **Unregistered id (AC-3):** same harness, `invokeActionDirective("inv-2","does.notExist",{},false)` → `spy` text inner JSON has `ok:false`, `error:"action_not_registered"`, `invocationId:"inv-2"`; no throw.
- **Commit:** `feat(CLE-03): debug.ping smoke action + register→directive→run→envelope round-trip test`.

## T8 — Unmount-cleanup integration test (AC-6, E-3)

- **Action:** No new product code (validates T3's owner-scoped cleanup). Write the lifecycle test.
- **File:** `app/apps/web/src/lib/chat/page-actions/__tests__/registry-lifecycle.integration.test.tsx` (new).
- **Verify:** test passes.
- **Test:** Using `@testing-library/react`: render a tiny `<Probe/>` that calls `useRegisterPageActions([debugPing])`; assert `getActionManifest()` contains `debug.ping`; `unmount()`; assert `getActionManifest()` no longer contains it AND `await runRegisteredAction("debug.ping", {message:"x"})` returns `{ok:false, error:"action_not_registered"}`. Add a second case (E-3 spirit): mount Probe A `[a.one]`, mount Probe B `[b.one]`, unmount A → manifest has only `b.one`; `a.one` invoke → unregistered error.
- **Commit:** `test(CLE-03): page-action register/unregister lifecycle + multi-page cleanup`.

## T9 — Type-contract guard + defensiveness regression (AC-8)

- **Action:** Add a compile-time structural assertion that the new `invokeAction` arm and `PageAction`/`PageActionManifestEntry` match README §3 (e.g. an internal `satisfies` against a literal mirror of the contract, in a `*.contract.ts` or inside an existing test). Add the malformed-directive defensiveness cases if not already in T2.
- **Files:** `app/apps/web/src/lib/chat/page-actions/__tests__/contract.test.ts` (or extend `ui-directives.test.ts`).
- **Verify:** `tsc` catches any field drift (rename/optionality change) at build; the defensiveness unit asserts `parseUiDirective` never throws on the three malformed `invokeAction` shapes.
- **Test:** structural `expectTypeOf`/`satisfies` checks + the malformed-input `null`-return assertions (overlaps T2; keep one canonical location).
- **Commit:** `test(CLE-03): contract-shape guard + directive defensiveness`.

## T10 — Acceptance + regression sweep (Phase 5 close-out)

- **Action:** Run the full acceptance suite + repo regression. Fix any drift. Confirm the two pre-existing directive kinds are behaviourally unchanged.
- **Verify:**
  - `pnpm tsc --noEmit` → 0 errors.
  - All CLE-03 tests green; coverage of new branches in `ui-directives.ts` / `registry.ts` / envelope codec = 100%.
  - `regression.sh` → green.
  - `git diff package.json` shows **no** new dependency (Zod 4 native serializer).
  - Re-read `requirements.md` §2 (AC-1..AC-9) and §3 (E-1..E-8); tick each against a passing test.
- **Test:** the suite itself; this task adds no new code, only confirms the gate.
- **Commit:** `chore(CLE-03): acceptance + regression green; PAR core foundation complete`.

---

## Sequencing & dependency notes

- **T1 → T2/T3** (types first; the registry and parser both depend on them).
- **T2, T3, T4** are independently testable and can be committed in any order after T1, but T5 depends on all three (it imports `runRegisteredAction` + `encodeActionResult`).
- **T6 must accompany or immediately follow T5** so `tsc` stays green at both `runUiDirective` call sites (the ctx gains `sendActionResult`).
- **T7/T8** are the two integration tests the prompt explicitly requires (round-trip + unmount-cleanup); they validate T2–T6 end to end.
- **Out of scope (do not start here):** the `listPageActions`/`invokePageAction` server tools, the body **read** server-side, the system-prompt addendum (all CLE-04); the confirm card for `requireConfirm:true` (CLE-05); `decideAction` (CLE-10); real page registrations (CLE-06+). CLE-03's `requireConfirm` is carried but not acted on; the smoke action is `confirm:"never"`.
- **Verification reality:** CLE-03 ships no real page, so the loop is proven in-memory via the T7/T8 integration tests (no Playwright needed). A live browser walkthrough of an actioned page first becomes meaningful in CLE-06.
