# CLE-03 — `invokeAction` directive + Page Action Registry (PAR core) — Requirements

> Keystone of the **Chat Live Executor** initiative.
> Constitution: `_specs/chat-live-executor/README.md` (the SSOT for every contract cited below).
> Audit: `_research/chat-task-executor-audit-2026-06-16.md` (§1.2 — existing directive mechanism; the "no generic action bus" / "no `addToolResult`/`onToolCall`" finding).
> Feature record: `_specs/chat-live-executor/feature_list.json` → `CLE-03-action-directive-and-registry` (phase 1, milestone M1, `depends_on: []`, completeness target 10).

This feature implements README contracts **§3.1** (the `invokeAction` directive), **§3.2** (`PageAction` / `PageActionResult` types), **§3.3** (registry API + manifest entry type), and **§3.5** (result round-trip envelope + the v1 transport default). It builds the *foundation* only: the directive kind, the typed registry, the client dispatch wiring, and the result channel. **No real page registers actions in this feature** — that is CLE-06..09. CLE-03 ships exactly one trivial smoke action (`debug.ping`) on a test surface to prove the full loop end to end.

---

## 1. User story

**As** the Elevay chat agent (and, transitively, the founder using it),
**I want** a typed, per-page action registry plus a safe `invokeAction` directive and a result round-trip channel,
**so that** any rich page can later declare its native actions once and the chat can run them live on the page the user is looking at — without writing a bespoke server tool per action (parity by construction, README doctrine §1.1), and with every result fed back to the model so it can chain (README §3.5).

This story is the load-bearing seam. CLE-04 adds the server tools that *emit* the directive; CLE-05 adds the confirmation UX; CLE-06+ register real actions. None of those can be built until CLE-03 fixes the directive contract, the registry API, and the result envelope. Hence: build the foundation correctly and verifiably, but do not over-reach into the dependents' scope.

---

## 2. EARS acceptance criteria (GIVEN / WHEN / THEN)

Notation: each criterion is testable in isolation. "the registry" = `lib/chat/page-actions/registry.ts`. "the directive parser" = `parseUiDirective` in `lib/chat/ui-directives.ts`. "the executor" = `runUiDirective` in `components/chat/use-ui-directives.ts`. "the envelope" = the frozen result shape in README §3.5.

### AC-1 — A registered action appears in the manifest
- **GIVEN** a page has called `useRegisterPageActions([...])` with a valid `PageAction[]` and is mounted,
- **WHEN** `getActionManifest()` is called,
- **THEN** the returned `PageActionManifest` contains one `PageActionManifestEntry` per registered action, each carrying `id`, `title`, `description`, `paramsJsonSchema`, `mutating`, `outbound`, `reversible`, `cost`, `confirm` (README §3.3),
- **AND** the entry contains **no** `run` function and **no** raw `params` Zod object (the manifest is JSON-serializable),
- **AND** `paramsJsonSchema` is a valid JSON Schema produced deterministically from the action's `params` Zod schema (same input → byte-identical output across calls).

### AC-2 — An `invokeAction` directive for a registered id runs that action on the live page
- **GIVEN** an action `id` is currently registered with a `run` fn,
- **WHEN** an assistant tool result carries `{ _uiDirective: { kind: "invokeAction", invocationId, actionId, params, requireConfirm } }` and the turn has settled (not streaming),
- **THEN** the executor parses it via `parseUiDirective`, looks the action up in the registry, validates `params` against the action's registered Zod schema **client-side**, calls `run(params)`,
- **AND** the action's existing page handler runs (the user sees the effect on the live page — proven in CLE-06+; in CLE-03 the smoke action's effect is observable via its returned `data`).

### AC-3 — An `invokeAction` directive for an UNregistered id yields a graceful error result (no crash)
- **GIVEN** an action `id` that is **not** in the registry (never registered, or its page unmounted),
- **WHEN** the executor dispatches an `invokeAction` directive for that id,
- **THEN** `runRegisteredAction` returns `{ ok: false, summary, error }` (a `PageActionResult`, not a thrown exception),
- **AND** the executor never throws, the dock stays interactive, and the failure is fed back to the model via the envelope (AC-5) so it can recover (e.g. fall back to a headless tool).

### AC-4 — Params failing Zod validation yield an error result, not a throw
- **GIVEN** a registered action whose `params` schema rejects the supplied `params` (wrong type / missing required field),
- **WHEN** `runRegisteredAction(actionId, params)` is called,
- **THEN** it returns `{ ok: false, summary, error }` describing the validation failure (sourced from Zod's error) **before** `run` is ever called,
- **AND** `run` is **not** invoked (no partial side-effect on bad input).

### AC-5 — The result envelope round-trips to the model
- **GIVEN** any `invokeAction` directive has been dispatched and produced a `PageActionResult` (ok or error),
- **WHEN** dispatch completes,
- **THEN** the client re-injects the frozen envelope `{ invocationId, ok, summary, data?, error? }` (README §3.5) into the conversation via `chat.sendMessage`, wrapped in the tagged transport string `[[action-result]]{json}[[/action-result]]` (the v1 default, §4 transport decision),
- **AND** `invocationId` in the envelope equals the `invocationId` of the originating directive (correlation),
- **AND** the message is plain enough that a model reading the system-prompt addendum (CLE-04) can parse it; CLE-03 freezes the exact byte format as the contract.

### AC-6 — Multiple pages register and unregister cleanly
- **GIVEN** page A registers actions `[a.one]`, then the user navigates so page A unmounts and page B mounts and registers `[b.one]`,
- **WHEN** `getActionManifest()` is called after each transition,
- **THEN** the manifest reflects exactly the currently-mounted page's actions (`[a.one]` then `[b.one]`); page A's actions are gone after its unmount (the unmount cleanup ran),
- **AND** `runRegisteredAction("a.one", ...)` after A unmounts returns the unregistered-id error result (AC-3), never a stale handler.

### AC-7 — Off-web / no-manifest case degrades cleanly
- **GIVEN** a chat surface that posts **no** manifest in the request body — the full `/chat` page (`app/(dashboard)/chat/page.tsx`, whose transport has no `body` fn and where the dock is hidden), or an off-web channel (Slack/MCP),
- **WHEN** a message is sent,
- **THEN** the POST body simply omits the `pageActions` field (no error), and on the client there is no mounted dock to dispatch page-action directives,
- **AND** nothing throws; headless tools continue to work; the registry returning an empty manifest is a valid, expected state.

### AC-8 — The directive's safety posture matches the existing union
- **GIVEN** the existing `navigate` directive guards against open-redirect via `isSafeInternalPath` (`ui-directives.ts:70-77`) and `parseUiDirective` defensively returns `null` on any malformed directive (never throws),
- **WHEN** an `invokeAction` directive is parsed,
- **THEN** `parseUiDirective` validates every field (`invocationId` non-empty string, `actionId` non-empty string, `params` a plain object, `requireConfirm` a boolean) and returns `null` if any is malformed — never throwing,
- **AND** a malformed `invokeAction` directive is silently ignored exactly like a malformed `navigate`/`composeEmail` one (parity of defensiveness),
- **AND** the `invokeAction` branch introduces **no** new arbitrary-code or eval path: the only thing runnable is an id that a mounted page has *itself* registered (see §6 security).

### AC-9 — The smoke action proves the loop
- **GIVEN** a test surface mounts `useRegisterPageActions([debugPingAction])` where `debug.ping` takes `{ message?: string }` and returns `{ ok: true, summary: "pong: <message>", data: { echoed: <message> } }`,
- **WHEN** the register → manifest → directive → run → envelope loop is exercised (integration test),
- **THEN** `debug.ping` appears in the manifest with a JSON Schema for `{ message?: string }`, an `invokeAction` directive for it runs it, and the `[[action-result]]…` envelope carrying `pong:` round-trips with the matching `invocationId`.

---

## 3. Edge cases (must be handled, with a test each)

| # | Edge case | Required behaviour |
|---|---|---|
| E-1 | **HMR double-register** (Fast Refresh re-runs the effect; or React 18 StrictMode double-invokes mount in dev) | Register is **idempotent per id**: the registry stores actions in a `Map<id, …>` keyed by id, so a second register of the same id replaces (does not duplicate) the entry. Manifest still lists each id once. |
| E-2 | **Action id collision across two mounted sources** | Last-writer-wins by id, but the registry **warns** (`console.warn`) on a collision between two *distinct* registration owners so it surfaces in dev. Manifest never contains duplicate ids. (Real pages namespace by surface — `"<surface>.<verb>"`, README §3.2 — so collisions are a dev mistake, not a runtime norm.) |
| E-3 | **Page unmounts mid-run** (action's `run` promise is in flight when the component unmounts) | The in-flight `run` promise is allowed to settle; its `PageActionResult` still round-trips. The *executor* (in the globally-mounted dock) owns the promise, not the unmounting page, so unmount does not cancel it. The registry entry is removed on unmount, so a *subsequent* invoke of that id gets the unregistered error (AC-3). No unhandled rejection. |
| E-4 | **Very large manifest** | The manifest carries a soft **size budget**: total serialized manifest is capped (default 16 KB). If exceeded, `getActionManifest()` returns the entries but logs a `console.warn` with the byte size (so CLE-04/CLE-06 catch a page that over-declares). CLE-03 does not truncate (no real page is near the cap); the budget is a guard-rail + test, not silent data loss. |
| E-5 | **Two `invokeAction` directives in one assistant turn** | The executor's once-only set is keyed `${messageId}:${partIndex}` (existing `use-ui-directives.ts:52`), so each tool part fires once; multiple distinct directives in one turn each dispatch + round-trip independently, each with its own `invocationId`. |
| E-6 | **Duplicate / replayed directive** (re-render, or thread history reload) | Already safe by construction: history replay reconstructs text-only parts (no tool parts → no directives), and the once-only `executedRef` set prevents re-fire on re-render (`use-ui-directives.ts:44-58`). The `invokeAction` branch inherits this unchanged. |
| E-7 | **`run` throws** (handler bug) | `runRegisteredAction` wraps `run` in try/catch and converts a thrown error into `{ ok: false, summary, error }`. A handler bug never breaks the chat loop; it round-trips as an error the model can read. |
| E-8 | **Manifest requested with zero registered actions** | `getActionManifest()` returns `[]` (valid). The dock includes `pageActions: []` only when a manifest exists for the surface; an empty manifest is fine and is the steady state for unregistered pages (and the `/chat` page sends none at all — AC-7). |

---

## 4. Transport decision (frozen here; cited by §3.5 of the README)

README §3.5 imposes a **v1 default**: after `runRegisteredAction`, the client re-injects a structured tagged message via the existing card mechanism (`chat.sendMessage`) as `[[action-result]]{json}[[/action-result]]`. It notes a **v2 evolution**: AI SDK v6 native `addToolResult` (client-tool). §3.5 explicitly delegates the code-level decision to CLE-03.

**Decision: ship the v1 default (tagged message via `chat.sendMessage`).** Rationale (full version in `design.md` §5):
1. The repo uses `ai@^6.0.199` + `@ai-sdk/react@^3.0.201`, but a codebase grep found **zero** uses of `addToolResult` / `onToolCall` / `toolCallId` anywhere (audit §1.2 confirms "no `addToolResult`/`onToolCall`/`onData`"). The client-tool round-trip is unproven in this repo; v6's client-tool ergonomics (how a *server-emitted directive* maps back onto a client `tool` with a `toolCallId` the client can resolve) are uncertain for our directive-not-tool emission model.
2. The existing approve→REST→`sendMessage` round-trip (`chat-action-cards.tsx:79-97`) already proves the `sendMessage` re-injection path end to end. Reusing it is the lowest-risk, highest-completeness choice for the keystone.
3. README §3.5 says: "en cas de blocage v6, le défaut v1 s'applique" — and v6 is, at minimum, *unproven here*. So v1 is the contract-compliant choice.

The exact frozen byte format (the contract dependents rely on): a single user-role message whose text is exactly `[[action-result]]` + `JSON.stringify({ invocationId, ok, summary, data?, error? })` + `[[/action-result]]`. CLE-04 will teach the system prompt to read it; CLE-03 owns the format.

**README-contract tension:** none. This decision is the README's own imposed default. CLE-03 records the v2 path as a noted future evolution but does not implement it. No `spec-issues.md` is required.

---

## 5. Out of scope (belongs to dependent CLE features)

- **Server tools `listPageActions` / `invokePageAction`** and the manifest **read** by the model + the two-level routing system-prompt addendum → **CLE-04** (README §3.4, §3.6). CLE-03 only puts the manifest *on the wire* (in the POST body) and freezes the envelope the prompt will read.
- **Confirmation / preview / edit-params UX** when `requireConfirm` is true (the proposal-card extension) → **CLE-05** (README §4.6). CLE-03 carries `requireConfirm` through the directive contract but does not render a card for it; in CLE-03 the smoke action is `confirm: "never"` so it executes directly.
- **`decideAction`** (the unified decision that *computes* `requireConfirm`) → **CLE-10** (README §3.5bis). CLE-03 treats `requireConfirm` as an opaque boolean carried on the directive.
- **Registering real page actions** (`/opportunities`, `/accounts`, `/contacts`, `/call-mode`, then the sweep) → **CLE-06..09 / CLE-14**.
- **Audit log / undo** for PAR actions, **permission matrix**, **outbound guardrails** → **CLE-11 / CLE-12 / CLE-13**.
- **Actuation visibility** (post-action highlight, narrate+actuate) → **CLE-15**.

---

## 6. Evaluation steps (Phase 6, hostile QA — read literally)

1. **Type contract parity.** Diff the emitted TypeScript in `design.md` §2 against README §3.1/§3.2/§3.3 field-by-field. Any deviation (renamed field, changed optionality, extra field) = FAIL.
2. **Manifest determinism.** Unit: register the smoke action, call `getActionManifest()` twice, assert deep-equal AND that `JSON.stringify` of the two is byte-identical. Assert no `run` key and no Zod object leaked into any entry.
3. **JSON Schema correctness.** Unit: assert the smoke action's `paramsJsonSchema` is the expected JSON Schema for `z.object({ message: z.string().optional() })` (object, `message: string`, not required). Confirm `z.toJSONSchema` is the serializer (no new dependency added to `package.json`).
4. **Happy-path round-trip (integration).** Drive register → build an `invokeAction` directive (via `invokeActionDirective(...)`) → feed it through `parseUiDirective` → `runUiDirective` with a stub `sendMessage` capture → assert: action ran, `sendMessage` was called once with text matching `^\[\[action-result\]\]\{.*\}\[\[/action-result\]\]$`, parsed JSON deep-equals `{ invocationId, ok: true, summary: "pong: hi", data: { echoed: "hi" } }`.
5. **Unregistered id (integration).** Same harness, `actionId: "does.notExist"` → assert `runRegisteredAction` resolves (does not reject), `sendMessage` got an envelope with `ok: false` and a non-empty `error`, executor did not throw.
6. **Bad params (unit).** `runRegisteredAction("debug.ping", { message: 42 })` → `ok: false`, `error` mentions the validation issue, and a `run` spy was **not** called.
7. **Unmount cleanup (integration, React Testing Library).** Render a component that calls `useRegisterPageActions([debugPing])`; assert manifest has it; unmount; assert `getActionManifest()` no longer has it AND `runRegisteredAction("debug.ping", …)` returns the unregistered error.
8. **HMR / double-register idempotency (unit).** Register `[debug.ping]` twice; assert manifest length is 1 for that id.
9. **`run` throws (unit).** Register an action whose `run` throws; invoke it; assert `ok: false` envelope, no unhandled rejection.
10. **Directive defensiveness (unit).** Feed `parseUiDirective` a malformed `invokeAction` (missing `invocationId`; `params` not an object; `requireConfirm` not boolean) → returns `null` each time, never throws. Confirm the existing `navigate`/`composeEmail` cases still parse unchanged (regression).
11. **Dock body plumbing (unit/inspection).** Confirm `chat-dock.tsx`'s transport `body: () =>` now reads a `manifestRef` and includes `pageActions` only when non-empty; confirm `/chat` page transport still has no `body` (sends no manifest) — AC-7.
12. **Regression.** `pnpm tsc --noEmit` → 0 errors. `regression.sh` → green. Existing `navigate` + `composeEmail` directives still fire (no behavioural change to the two existing kinds).

**Hard thresholds:** AC-1..AC-9 all pass; every edge case E-1..E-8 has a passing test; `tsc` 0 errors; no new runtime dependency for JSON-Schema serialization; the two pre-existing directive kinds are behaviourally unchanged. Any miss = FAIL → delete branch → respec.
