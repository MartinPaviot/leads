# CLE-04 — Server tools `listPageActions` / `invokePageAction` + plumbing + routing heuristic — Requirements

> Constitution: `_specs/chat-live-executor/README.md` (the SSOT for every contract cited below).
> Audit: `_research/chat-task-executor-audit-2026-06-16.md` (§1.1 pipeline `route.ts:602-638`; §1.2 "only 2 client directive kinds, no generic action bus").
> Feature record: `_specs/chat-live-executor/feature_list.json` → `CLE-04-page-action-tools` (phase 1, milestone M1, `depends_on: ["CLE-03-action-directive-and-registry"]`, completeness target 10).
> Hard dependency: `_specs/CLE-03-action-directive-and-registry/design.md` — exports the exact names this feature builds on: `invokeActionDirective(...)` (§2.1), the envelope codec `ACTION_RESULT_OPEN` / `ACTION_RESULT_CLOSE` / `encodeActionResult` / `ActionResultEnvelope` (§2.4), and the manifest types `PageActionManifest` / `PageActionManifestEntry` + `getActionManifest()` (§2.2/§2.3). CLE-03 also puts the manifest **on the wire** in the POST body (`chat-dock.tsx` `body: () =>` → `payload.pageActions`, CLE-03 design §2.5). CLE-04 reads it server-side.

This feature implements README contracts **§3.4** (the two server tools `listPageActions` / `invokePageAction`), **§3.1** (the `invokeAction` directive it emits via CLE-03's builder), **§3.5** (it produces directives whose results return through the frozen envelope), **§3.5bis** (it consumes `decideAction` — which CLE-04 ships as a **conservative stub** with the verbatim signature; the real unified body is CLE-10), and **§3.6** (the two-tier routing heuristic, added to the system prompt). It also threads the manifest from the request body into `ToolContext` and registers/groups/gates the two tools.

CLE-04 is the **server half** of the keystone: CLE-03 built the client registry + directive + round-trip; CLE-04 lets the model *see* the page's actions (`listPageActions`) and *emit* an invocation (`invokePageAction`) that CLE-03's client dispatch then runs on the live page. CLE-04 ships **no real page actions** (those are CLE-06..09) and **never mutates** — `invokePageAction` only emits a directive.

---

## 1. User story

**As** the Elevay chat agent (and, transitively, the founder using it),
**I want** two server tools — one that lists the actions the current page has declared, and one that invokes a named action with validated params — that route through the single decision function and emit a client directive rather than mutating directly,
**so that** when I'm on a rich page the model can do that page's native flows live, under the user's eyes, with confirmation gated centrally (README doctrine §1.2 + §3.4), and degrade cleanly to headless tools when there is no page (off-web).

This story sits between CLE-03 (the mechanism: registry + directive + round-trip) and CLE-06..09 (real page actions). It must: read the manifest CLE-03 already put on the wire, validate the model's params against that manifest server-side, call `decideAction` to compute `requireConfirm`, emit `invokeActionDirective(...)` with CLE-03's builder, and teach the model (a) the two-tier routing heuristic and (b) how to read the `[[action-result]]` envelope CLE-03 froze.

---

## 2. EARS acceptance criteria (GIVEN / WHEN / THEN)

Notation: each criterion is testable in isolation. "the manifest" = the `PageActionManifest` (CLE-03 §2.2) posted in the request body as `pageActions`. "the two tools" = `listPageActions` / `invokePageAction` in `lib/chat/tools/page-actions.ts` (NEW). "the directive" = `{ kind: "invokeAction", invocationId, actionId, params, requireConfirm }` (README §3.1, built by CLE-03's `invokeActionDirective`). "decideAction" = the stub in `lib/guardrails/decide-action.ts` (NEW here; CLE-10 replaces the body). "the envelope" = the frozen result shape (README §3.5, codec in CLE-03 §2.4).

### AC-1 — Manifest present → `listPageActions` returns it to the model
- **GIVEN** the request body carried a non-empty `pageActions` manifest (the user is on a rich page that registered actions; CLE-03 plumbed it onto the wire),
- **WHEN** the model calls `listPageActions()`,
- **THEN** the tool returns the actions available on the current page — each with `id`, `title`, `description`, `paramsJsonSchema`, and the policy scalars (`mutating`, `outbound`, `reversible`, `cost`, `confirm`) — sourced from the manifest threaded into `ToolContext`,
- **AND** the tool is READ-only: it performs no DB write, no directive, no mutation; it is the model's discovery surface ("here is what you can do on this page").

### AC-2 — Invoking a manifest action emits a directive with `requireConfirm` from `decideAction`
- **GIVEN** the manifest contains an entry for `actionId` and the model calls `invokePageAction({ actionId, params })` with params that satisfy that entry's `paramsJsonSchema`,
- **WHEN** the tool executes,
- **THEN** it calls `decideAction({ action: <policy scalars from the manifest entry>, approvalMode, role })` to obtain a `disposition`,
- **AND** it maps `disposition` to `requireConfirm` (`execute` → `false`; `confirm` → `true`; `queue` → `true`; `refuse` → no directive, see AC-5),
- **AND** it returns `{ ...invokeActionDirective(invocationId, actionId, params, requireConfirm) }` where `invocationId = crypto.randomUUID()` (decided once at the emit site, per CLE-03 §2.1),
- **AND** it does **not** mutate any persistent state itself (the real run happens client-side via CLE-03's `runRegisteredAction`).

### AC-3 — Invoking an `actionId` NOT in the manifest → refuse, no directive
- **GIVEN** the model calls `invokePageAction({ actionId, params })` for an `actionId` that is **not** present in the manifest threaded into `ToolContext` (model hallucinated it, the page changed, or it was never registered),
- **WHEN** the tool executes,
- **THEN** it returns a plain error result `{ error: "..." }` naming the unknown action and (when a manifest exists) listing the available action ids,
- **AND** it emits **no** `invokeAction` directive (no `_uiDirective` key in the result) — the client has nothing to dispatch,
- **AND** the tool never throws; the model can read the error and fall back to a headless tool.

### AC-4 — Params failing the manifest entry's schema → tool error, no directive
- **GIVEN** the manifest contains `actionId` but the model's `params` do not satisfy that entry's `paramsJsonSchema` (wrong type, missing required field),
- **WHEN** `invokePageAction` validates `params` against the entry's JSON Schema **server-side**,
- **THEN** it returns `{ error: "..." }` describing the validation failure (which field, why) **before** computing any directive,
- **AND** it emits **no** directive (`decideAction` is not even consulted for an invalid call),
- **AND** `run` is never reached (it cannot be — `run` lives client-side and only fires on a dispatched directive); server-side rejection is the first of two validation gates (the client re-validates against the live Zod schema, CLE-03 §2.3 / AC-4).

### AC-5 — Viewer role + mutating action → refuse
- **GIVEN** the authenticated user's workspace role is `viewer` and the manifest entry for `actionId` has `mutating: true` (or `outbound: true`),
- **WHEN** the model calls `invokePageAction({ actionId, params })`,
- **THEN** `decideAction({ ..., role: "viewer" })` returns `disposition: "refuse"`,
- **AND** the tool returns a refusal result explaining the viewer role is read-only and emits **no** directive,
- **AND** a pure-read action (`mutating: false`, `outbound` falsy) for a viewer still resolves to `execute` (viewers may drive read-only page actions such as `applyFilter`/`toggleView`).

### AC-6 — Off-web / no manifest → graceful degradation
- **GIVEN** the request body carried **no** `pageActions` (off-web: Slack / external MCP, or the full `/chat` page whose transport sends no manifest — CLE-03 AC-7),
- **WHEN** the model calls `listPageActions()`,
- **THEN** it returns an **empty** action list plus a short note that no page is attached and that headless tools should be used instead — it does not error,
- **AND** **WHEN** the model calls `invokePageAction(...)` in that state, the tool refuses with a clear message ("no page is attached to this session; use a headless tool") and emits no directive,
- **AND** nothing throws; the two-tier prompt heuristic (§3.6) also steers the model away from page actions when none are offered.

### AC-7 — `requireConfirm` faithfully reflects `decideAction`'s disposition
- **GIVEN** identical `(actionId, params)` but a manifest entry whose policy scalars vary,
- **WHEN** `invokePageAction` is called for a `mutating: true, reversible: false` action vs a `mutating: false, reversible: true` action under the same `approvalMode`/`role`,
- **THEN** the first yields a directive with `requireConfirm: true` (`decideAction → "confirm"`) and the second yields `requireConfirm: false` (`decideAction → "execute"`),
- **AND** an `outbound: true, cost: "money"` action yields `requireConfirm: true` regardless (the conservative stub always confirms outbound),
- **AND** the boolean on the wire is exactly the mapping of the disposition the function returned — the tool re-encodes nothing of its own.

### AC-8 — The two tools are reachable through routing + capability gating
- **GIVEN** `buildAllChatTools(ctx)` registers `listPageActions` and `invokePageAction`,
- **WHEN** `resolveCapabilities` runs, then `routeTools` / `orchestrate` route the turn,
- **THEN** both tools survive `resolveCapabilities` for every non-`viewer` role (they are the gateway; per-action gating is `decideAction`'s job, not per-tool hiding — README §3.4 and CLE-12 note), and both are reachable for a `viewer` too (the *tool* is allowed; `invokePageAction` itself refuses mutating actions for viewers per AC-5),
- **AND** both tools belong to a routing group in `tool-router.ts` `TOOL_GROUPS` **and** the orchestrator's `TOOL_GROUP_MAP` (so they are not silently fail-open / orphaned — coordinating with CLE-01's drift-guard, which asserts every `buildAllChatTools` tool has a group),
- **AND** they are grouped so the routing heuristic that matches "on this page / do X here" intents includes them.

### AC-9 — The system prompt teaches the two-tier heuristic + the envelope
- **GIVEN** the assembled chat system prompt,
- **WHEN** CLE-04's addendum is applied,
- **THEN** the prompt contains the §3.6 two-tier routing heuristic (on-surface native flow → `invokePageAction`; mass/multi-entity/off-page/background → headless tool; never run mutating/outbound without `decideAction`'s disposition; off-web → page actions not offered),
- **AND** the prompt teaches the model to read the `[[action-result]]…[[/action-result]]` envelope (CLE-03's frozen tags, imported as constants) — extract the JSON, correlate by `invocationId`, treat `summary`/`ok`/`error` as the action outcome and chain,
- **AND** the existing `<command_layer>` section names page actions as the **third lever** (after `openRecord`/`openListView` and `composeEmail`).

---

## 3. Edge cases (must be handled, with a test each)

| # | Edge case | Required behaviour |
|---|---|---|
| E-1 | **Manifest / actionId mismatch** — model calls an id absent from the manifest (hallucinated or from a stale turn) | Refuse with the unknown-id error + list of available ids; no directive (AC-3). Never resolve a stale handler — the server never holds handlers, only descriptors, so this is structurally safe. |
| E-2 | **Schema drift between client and what the model sent** — the model's params match the manifest JSON Schema sent this turn, but the live page's Zod schema has since changed | Server validates against the **manifest the request carried** (the source of truth for *this* turn); the client re-validates against the **live** Zod schema before `run` (CLE-03 §2.3). If they disagree, the client's `runRegisteredAction` returns `{ ok:false, error:"invalid_params" }` and that round-trips — the model learns and recovers. Two-gate defense; the server gate is not weakened by drift. |
| E-3 | **Huge manifest token budget** — a page over-declares; the serialized manifest is large | `listPageActions` returns the manifest as-is (CLE-03's `getActionManifest` already `console.warn`s past a 16 KB soft budget, CLE-03 §2.3 / E-4). CLE-04 adds a server-side guard: if the manifest exceeds a hard cap (e.g. 64 KB or N entries), `listPageActions` returns a trimmed view (ids + titles + descriptions, omitting `paramsJsonSchema` for the overflow) plus a note to call again for a specific action's schema. This keeps the tool result within the LLM context budget (`allocateContextBudget`, `route.ts:676`). No throw. |
| E-4 | **Model calls `invokePageAction` without first calling `listPageActions`** | Allowed. `invokePageAction` does not require a prior `listPageActions` call — it validates against the manifest in `ToolContext` directly. If the id is present and params validate → directive; if absent → AC-3 refusal (which lists available ids, nudging the model to discover). The heuristic prompt *encourages* listing first but the tool does not hard-require it (robustness over ceremony). |
| E-5 | **`decideAction` returns `queue`** (e.g. `batch-daily` mode) | The stub maps `queue` → `requireConfirm: true` (degrade to a confirm card; there is no chat-side batch queue store pre-CLE-11, mirroring CLE-00's `chatCreateDisposition` `batch-daily → "proposal"` choice). The directive is still emitted so the user can act; the tool's text result notes it was queued for review. Never silent-execute a queued action. |
| E-6 | **Manifest present but empty array** (`pageActions: []`) | Treated identically to "no manifest" for `invokePageAction` (refuse: nothing to invoke). `listPageActions` returns an empty list + the "no actions on this page" note. Distinguishes "page with zero actions" from "off-web" only in the note wording; behaviour is the same. |
| E-7 | **`params` omitted entirely** on `invokePageAction` | Default `params` to `{}` before validation; a `{}` that fails a schema with required fields yields AC-4's validation error. An action whose schema is `z.object({}).optional()`-equivalent (no required fields) validates and emits a directive with `params: {}`. |
| E-8 | **Two `invokePageAction` calls in one assistant turn** | Each call independently computes its own `invocationId` (`crypto.randomUUID()`), runs `decideAction`, and returns its own directive. CLE-03's client executor keys dispatch by `${messageId}:${partIndex}` (CLE-03 E-5), so both dispatch + round-trip independently. CLE-04 adds nothing stateful per-turn. |
| E-9 | **`actionId` present but its policy scalars are malformed in the manifest** (e.g. `confirm` not in the enum) | The manifest is produced by CLE-03's `toManifestEntry` (typed), so this is a contract violation, not a runtime norm. Defensive: `decideAction`'s stub treats any unknown `confirm` value as `"always"` and any non-boolean `mutating` as `true` (fail-safe toward confirmation). Documented; not expected from a conformant CLE-03 client. |

---

## 4. `decideAction` stub — scope and forward-compatibility (frozen contract carried, body conservative)

CLE-04 creates `lib/guardrails/decide-action.ts` with the **verbatim §3.5bis signature** (input shape, output `{ disposition, reason }`, the `disposition` union `"execute" | "confirm" | "queue" | "refuse"`). This is the one place the README permits CLE-04 to stand in for CLE-10, because `invokePageAction` cannot emit a correct `requireConfirm` without *a* decision function, and CLE-10 (the unified plane) does not land until phase 2 / M2.

**The stub body is intentionally conservative and metadata-driven** (no `approvalMode`/confidence subtlety yet — those are CLE-10/CLE-16):
- `role === "viewer"` AND (`mutating` OR `outbound`) → **`refuse`** (read-only role; AC-5).
- `outbound` AND `cost === "money"` → **`confirm`** (spending money always shows a card).
- `outbound` (any) → **`confirm`** (external send under the user's eyes).
- `mutating` AND NOT `reversible` → **`confirm`** (irreversible mutation always confirmed).
- `mutating` AND `reversible` → honour the action's own `confirm` policy: `"always"` → `confirm`; `"risky"` → `confirm`; `"never"` → `execute` (a reversible mutation the page marked safe).
- pure read (`mutating: false`, `outbound` falsy) → **`execute`** (filters, view toggles, read-only flows — even for viewers).
- unknown/malformed metadata → fail-safe toward `confirm` (E-9).

**Compatibility requirements the stub MUST satisfy (so CLE-10's swap is a body replacement, not a signature change):**
1. **Signature is byte-identical to README §3.5bis** — including the `approvalMode: ApprovalModeV2` field (imported from `@/lib/guardrails/approval-mode`) and the optional `confidence?: number`, even though the stub does not yet branch on them. CLE-10 fills the body; callers do not change.
2. **It is the seam CLE-00 named.** CLE-00's `chatCreateDisposition` (`approval-mode.ts`) is explicitly documented as "the seam CLE-10 will replace with `decideAction`". CLE-04's stub and CLE-00's mapper must be **disposition-compatible**: both map `review-each`/`batch-daily` toward "show a card" and `auto-high-confidence` toward "execute" for low-risk actions. CLE-04's stub does not yet read `approvalMode` (it gates on metadata + role only), but its outputs must not contradict CLE-00 for the cases they overlap (a reversible non-outbound create under any mode → CLE-00 may execute; CLE-04's page-action equivalent honours `confirm` policy). This is documented as the reconciliation point CLE-10 owns.
3. **It maps onto CLE-00's local mapper vocabulary.** CLE-00 emits `"proposal" | "execute"`; CLE-04 emits the richer `"execute" | "confirm" | "queue" | "refuse"`. CLE-10 unifies both onto the §3.5bis output; until then, CLE-04 treats `confirm`/`queue` as "card" (= CLE-00's `"proposal"`) and `refuse` as a hard stop (CLE-00 had no `refuse` because role-gating happens earlier in `capability-resolver`; for page actions the gate must live in `decideAction` because the *tool* is allowed for viewers — AC-8). This asymmetry is the contract tension flagged in §6 and resolved by CLE-10 + CLE-12.

---

## 5. Out of scope (belongs to other CLE features)

- **The client registry, hook, dispatch, and result round-trip** (`useRegisterPageActions`, `getActionManifest`, `runRegisteredAction`, `runUiDirective`'s `invokeAction` branch, the envelope codec, the dock body plumbing) → **CLE-03** (README §3.1–3.3, §3.5). CLE-04 *reads* the manifest CLE-03 puts on the wire and *imports* CLE-03's `invokeActionDirective` + envelope constants.
- **Confirmation / preview / edit-params card UX** when `requireConfirm: true` → **CLE-05** (README §4.6). CLE-04 computes and carries `requireConfirm`; it renders no card.
- **The real `decideAction` body** (unified plane: `approvalMode` × confidence × role × metadata, collapse of the 4 approval vocabularies) → **CLE-10** (README §3.5bis). CLE-04 ships the **stub** only.
- **Registering real page actions** for `/opportunities`, `/accounts`, `/contacts`, `/call-mode` (and the sweep) → **CLE-06..09 / CLE-14**. CLE-04 ships **no** real action; tests use a fixture manifest.
- **Audit log / undo** for invoked page actions, the **unified permission matrix**, **outbound guardrail hardening** → **CLE-11 / CLE-12 / CLE-13**.
- **Actuation visibility** (post-action highlight, narrate+actuate) → **CLE-15**.

---

## 6. Evaluation steps (Phase 6, hostile QA — read literally)

1. **Type contract parity (decideAction).** Diff the `decideAction` signature in `design.md` §2 against README §3.5bis field-by-field — input object keys, types (`approvalMode: ApprovalModeV2`, `role` union, optional `confidence`), and output `{ disposition: "execute"|"confirm"|"queue"|"refuse"; reason: string }`. Any deviation = FAIL. Confirm the body is the conservative stub from §4 and is documented as CLE-10-replaceable.
2. **Type contract parity (tools).** Confirm `invokePageAction` returns `{ ...invokeActionDirective(invocationId, actionId, params, requireConfirm) }` using CLE-03's **imported** builder (not a re-implementation), and that `listPageActions` returns the manifest entries (CLE-03's `PageActionManifestEntry`). No redefinition of CLE-03 types.
3. **Manifest read plumbing.** Inspect `route.ts`: `pageActions` is destructured from the POST body (alongside `contextType`/`contextId`/`surface`/`threadId`, `route.ts:401-418`), typed as `PageActionManifest | undefined`, and threaded into `toolCtx` (`route.ts:603-609`). Confirm `ToolContext` (`context.ts:6-12`) gained `pageActionManifest?: PageActionManifest`.
4. **`listPageActions` with manifest (unit).** Build the tools with a `ToolContext` carrying a 2-entry fixture manifest; call `listPageActions`; assert it returns both entries with all scalar fields + `paramsJsonSchema`, and performs no mutation.
5. **`listPageActions` off-web (unit).** Same with `pageActionManifest: undefined`; assert it returns an empty list + a note; no throw (AC-6).
6. **`invokePageAction` happy path → directive (unit).** Fixture entry `accounts.applyFilter` (`mutating:false, reversible:true, confirm:"never"`); call with valid params; assert the result carries `_uiDirective` with `kind:"invokeAction"`, the right `actionId`/`params`, a uuid `invocationId`, and `requireConfirm:false`. Assert no DB write.
7. **`invokePageAction` unknown id → refuse, no directive (unit).** Call with `actionId:"nope.nope"` not in the fixture manifest; assert result has `error`, lists available ids, and has **no** `_uiDirective` key. **(Required test: refuse unknown actionId.)**
8. **`invokePageAction` bad params → error, no directive (unit).** Fixture entry whose JSON Schema requires `minScore: number`; call with `{ minScore: "high" }`; assert `error` mentions the field, no directive, and `decideAction` was not consulted (spy not called).
9. **`requireConfirm` reflects `decideAction` (unit).** For a `mutating:true, reversible:false` fixture entry → assert `requireConfirm:true`; for a `mutating:false, reversible:true, confirm:"never"` entry → assert `requireConfirm:false`; for an `outbound:true, cost:"money"` entry → `requireConfirm:true`. **(Required test: requireConfirm reflects decideAction.)**
10. **Viewer + mutating → refuse (unit).** `ToolContext.authCtx.role === "viewer"` + a `mutating:true` fixture entry; assert refusal result, no directive. A `mutating:false` entry for the same viewer → directive with `requireConfirm:false` (AC-5).
11. **`decideAction` stub matrix (unit).** Table-test every §4 branch: viewer+mutating→refuse; outbound+money→confirm; outbound→confirm; mutating+!reversible→confirm; mutating+reversible+confirm:"never"→execute; mutating+reversible+confirm:"always"→confirm; pure-read→execute (incl. viewer); malformed→confirm.
12. **Routing + gating (unit).** Assert `getToolGroup("listPageActions")` and `getToolGroup("invokePageAction")` are defined in `tool-router.ts`; assert the same in the orchestrator's `TOOL_GROUP_MAP`; assert both survive `resolveCapabilities` for `member`/`admin` and that the *tools* are present for `viewer` (gating is per-action via `decideAction`, not per-tool hiding). Confirm CLE-01's drift-guard test (every `buildAllChatTools` tool has a group) still passes with the two new tools.
13. **System-prompt addendum (inspection + unit).** Assert the assembled prompt contains the §3.6 heuristic text, the `[[action-result]]` envelope-reading instructions (referencing CLE-03's `ACTION_RESULT_OPEN`/`ACTION_RESULT_CLOSE` constants), and that `<command_layer>` now lists page actions as the third lever. A unit test greps the built prompt string for the marker phrases.
14. **Huge manifest (unit).** Pass a manifest over the hard cap; assert `listPageActions` returns the trimmed (schema-omitted) view + the "call again per action" note; no throw (E-3).
15. **Regression.** `pnpm tsc --noEmit` → 0 errors. `regression.sh` → green. CLE-03's tests (directive parse, registry, envelope) untouched and green. The two existing client directive kinds (`navigate`, `composeEmail`) behaviourally unchanged.

**Hard thresholds:** AC-1..AC-9 all pass; every edge case E-1..E-9 has a passing test; the two required tests (unknown-actionId refusal; `requireConfirm` reflects `decideAction`) are present and green; `decideAction`'s signature is byte-identical to README §3.5bis; `invokePageAction` is proven to emit a directive and **never** to mutate; `tsc` 0 errors. Any miss = FAIL → delete branch → respec.
