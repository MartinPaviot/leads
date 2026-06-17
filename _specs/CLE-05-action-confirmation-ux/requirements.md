# CLE-05 — Action confirmation / preview / edit-params UX — Requirements

> Constitution: `_specs/chat-live-executor/README.md` (SSOT for every contract cited below).
> Audit: `_research/chat-task-executor-audit-2026-06-16.md` (§ on the four disconnected approval vocabularies and the dead "Ask every time/Auto-run" selector).
> Feature record: `_specs/chat-live-executor/feature_list.json` → `CLE-05-action-confirmation-ux` (phase 1, milestone M1, `depends_on: ["CLE-03-action-directive-and-registry", "CLE-04-page-action-tools"]`, completeness target 9).

This feature implements README **§4.6** (the confirmation/preview/edit UX, "réutilise+corrige proposal-card") riding on the contracts **§3.1** (the `invokeAction` directive, with `requireConfirm`), **§3.2/§3.3** (`PageAction`, `PageActionManifestEntry`, the registry — built in CLE-03), and **§3.5** (the result round-trip envelope — built in CLE-03). It does **not** redefine any contract.

CLE-03 carries `requireConfirm` through the directive and its executor (`runUiDirective` in `components/chat/use-ui-directives.ts`) currently runs the action **directly** in the `invokeAction` arm — CLE-03 §2.4 states verbatim: *"CLE-05 will branch on `d.requireConfirm` to render a confirm card first; in CLE-03 the smoke action is `confirm:"never"`, so we run directly."* CLE-05 is exactly that branch plus the editable card UI behind it.

---

## 1. User story

**As** the founder using the Elevay chat to act live on a page (move a deal, apply a filter, bulk-enrich, send an email, launch a sequence),
**I want** any action the agent proposes that is mutating, outbound, or costs money to stop and show me an **editable confirmation card** — the action's title, what it will do, its parameters pre-filled and editable, and a clear destructive / outbound / cost badge — before it runs,
**so that** I am never surprised by a silent change, I can correct a wrong parameter the model inferred before it executes, and a read-only action (filter, view toggle) still happens instantly without a needless gate.

This sits between CLE-04 (which *computes* `requireConfirm` server-side via `decideAction` and emits the directive) and CLE-06+ (which *register* the real actions). CLE-05 owns one thing: what the client does with a directive based on `requireConfirm` — confirm-then-run, or run-immediately — and the card that makes the confirm path safe and editable. It must reuse and **fix** the existing proposal-card machinery (`components/chat/chat-action-cards.tsx`, `components/action-card.tsx`) rather than fork a parallel one, and it must resolve the dead "Ask every time/Auto-run" selector (`action-card.tsx:242-257`).

---

## 2. EARS acceptance criteria (GIVEN / WHEN / THEN)

Notation: each criterion is testable in isolation. "the executor" = `runUiDirective` in `components/chat/use-ui-directives.ts`. "the registry" = `lib/chat/page-actions/registry.ts` (CLE-03). "`runRegisteredAction`" = the registry's run fn (CLE-03 §2.3) which re-validates params against the live Zod schema before run and never throws. "`encodeActionResult` / `sendActionResult`" = the CLE-03 envelope codec + the dock's round-trip ctx fn. "the confirm card" = the new editable card CLE-05 renders for a directive whose `requireConfirm === true`. "the manifest entry" = the `PageActionManifestEntry` for the directive's `actionId` read from `getActionManifest()`.

### AC-1 — `requireConfirm === true` renders a card and does NOT run the action
- **GIVEN** an `invokeAction` directive arrives whose `requireConfirm` is `true` for a currently-registered `actionId`,
- **WHEN** the executor dispatches it (turn settled, not streaming),
- **THEN** an editable confirmation card is rendered for that invocation (keyed by `invocationId`),
- **AND** `runRegisteredAction` is **NOT** called and the action's `run` handler does **NOT** execute until the user approves,
- **AND** no result envelope is round-tripped yet (the model is not told an outcome it has not produced).

### AC-2 — Approve runs the action with the EDITED params and round-trips the result
- **GIVEN** a pending confirm card whose params the user may have edited,
- **WHEN** the user clicks Approve,
- **THEN** the executor calls `runRegisteredAction(actionId, editedParams)` with the **edited** params (not the original directive params if they were changed),
- **AND** on completion it calls `sendActionResult(encodeActionResult(invocationId, result))` so the frozen `[[action-result]]{...}[[/action-result]]` envelope (README §3.5) round-trips with the matching `invocationId`,
- **AND** the card transitions to a terminal "Done"/"Failed" state reflecting `result.ok` (it cannot be approved twice — see AC-8).

### AC-3 — Dismiss runs nothing and round-trips a cancelled envelope
- **GIVEN** a pending confirm card,
- **WHEN** the user clicks Dismiss,
- **THEN** `runRegisteredAction` is **NOT** called and no page handler runs,
- **AND** the executor round-trips a cancelled result envelope — a `PageActionResult`-shaped `{ ok: false, summary: "Cancelled by the user.", error: "cancelled" }` encoded for `invocationId` — so the model learns the user declined and does not silently retry,
- **AND** the card transitions to a terminal "Dismissed" state.

### AC-4 — `requireConfirm === false` runs immediately (CLE-03 path), no card
- **GIVEN** an `invokeAction` directive whose `requireConfirm` is `false` (read-only action, or `decideAction` returned `execute`),
- **WHEN** the executor dispatches it,
- **THEN** it runs the action immediately via `runRegisteredAction(actionId, params)` exactly as CLE-03 wired it, and round-trips the envelope — **no** confirm card is shown,
- **AND** (optional, non-blocking) a brief post-action highlight may be emitted for the affected surface; the absence of a highlight target never blocks or delays the run.

### AC-5 — Edited params are re-validated before run
- **GIVEN** a pending confirm card whose params the user edited to an invalid value (wrong type, or cleared a required field),
- **WHEN** the user clicks Approve,
- **THEN** the params are re-validated against the action's **live Zod schema** before `run` is invoked — this happens inside `runRegisteredAction` (CLE-03 §2.3 `safeParse`), so a bad edit yields `{ ok: false, error: "invalid_params", summary }` and `run` is **not** called,
- **AND** the card surfaces the validation message inline (does not silently swallow it) and stays in a state from which the user can fix the field and re-approve,
- **AND** no partial side-effect occurs on an invalid edit.

### AC-6 — Outbound / money / destructive risk is shown as a badge on the card
- **GIVEN** a confirm card for an action whose manifest entry has `outbound: true`, or `cost: "money"`/`"credits"`, or (`mutating: true` and `reversible: false`),
- **WHEN** the card renders,
- **THEN** it shows a clear, text-labelled badge naming the risk class — e.g. "Sends externally", "Costs money", "Uses credits", "Permanent" — derived from the manifest entry's `outbound` / `cost` / `mutating` / `reversible` scalars (no emoji, per brand rule),
- **AND** a plain reversible mutation with `cost: "free"` shows no alarming badge (at most a neutral "Updates a record" label), so badges signal real risk rather than decorating everything.

### AC-7 — The card shows the action's identity and the params it will run with
- **GIVEN** a confirm card for `actionId`,
- **WHEN** it renders,
- **THEN** it shows the manifest entry's `title` and `description` (human-readable, locale per UI), and the params pre-filled from the directive's `params`, with each param value editable where the schema makes it editable (AC-9),
- **AND** if the directive's `actionId` is not in the current manifest (its page unmounted before render — E-6), the card renders a graceful "This action is no longer available on this page" state with only Dismiss, and Approve is unavailable.

### AC-8 — Double-approve / double-dismiss is guarded
- **GIVEN** a confirm card on which the user has already clicked Approve (run in flight or settled) or Dismiss,
- **WHEN** the user clicks Approve or Dismiss again (double-click, or a re-render re-presents the buttons),
- **THEN** the second click is a no-op: `runRegisteredAction` is invoked **at most once** per `invocationId`, and at most one result envelope (success/failure OR cancelled) is round-tripped per `invocationId`,
- **AND** while a run is in flight the Approve button shows a pending/disabled state.

### AC-9 — Editable fields are derived from the action's params schema
- **GIVEN** a confirm card whose action has a `paramsJsonSchema` (from the manifest entry) and a live Zod schema (in the registry),
- **WHEN** the card builds its editable fields,
- **THEN** scalar params (string, number, boolean, enum) are rendered as inline editable controls pre-filled from the directive params (reusing the existing inline-edit pattern in `action-card.tsx:170-233`),
- **AND** complex params (nested object, array) are shown **read-only** in a compact JSON preview with a single "Edit as JSON" raw-edit fallback (so no param is silently hidden or made un-correctable),
- **AND** whatever the user submits is the `editedParams` object passed to `runRegisteredAction` (AC-2), which re-validates it (AC-5).

### AC-10 — The "Ask every time / Auto-run" selector is no longer cosmetic
- **GIVEN** the action-card action bar today renders a `<select>` "Ask every time / Auto-run" (`action-card.tsx:242-257`) with `defaultValue="ask"` whose value is **never read** by any handler,
- **WHEN** CLE-05 ships,
- **THEN** that selector either (a) persists a real per-action preference that the executor consults on the next directive for the same `actionId` (so "Auto-run" makes a subsequently-confirmable action skip the card), **or** (b) is removed entirely,
- **AND** the chosen resolution is documented in `design.md` with its rationale; **the recommended resolution is (b) remove it** for v1 (the real autonomy lever is `decideAction` / approval-mode, CLE-10/CLE-16 — a second, client-only per-action toggle would be a fifth disconnected approval vocabulary, exactly what the audit and README §1.4 say to collapse). No dead control ships either way.

### AC-11 — One controller, no worsened duplication
- **GIVEN** the approve/dismiss card controller exists today in **two** places — the shared `useChatActionCards`/`MessageActionCards` in `components/chat/chat-action-cards.tsx` (used by the dock) and an **inline copy** of the same logic in the `/chat` page (`app/(dashboard)/chat/page.tsx:586-761`),
- **WHEN** CLE-05 adds page-action confirm cards,
- **THEN** the new page-action confirm/edit/approve/dismiss logic lives in the shared module (`chat-action-cards.tsx` or a sibling it re-exports), consumed identically by both the dock and the `/chat` page,
- **AND** CLE-05 does **not** add a second inline copy of the page-action card logic to the `/chat` page; at minimum the duplication is not worsened, and the page-action path is single-sourced (consolidating the *existing* create-card duplication is a documented, low-risk bonus, not a blocker — see §5).

---

## 3. Edge cases (must be handled, with a test each)

| # | Edge case | Required behaviour |
|---|---|---|
| E-1 | **Schema with nested object / array params** | The editor shows scalars inline-editable and complex params read-only with an "Edit as JSON" raw fallback (AC-9). The raw JSON is parsed and merged back into `editedParams`; a JSON parse error is surfaced inline and blocks Approve until fixed (no malformed object reaches `runRegisteredAction`). |
| E-2 | **Very large params** (long body string, big array) | The card renders the value in a scrollable/clamped container (does not blow up the dock width); a long string param uses a `textarea` (mirrors the email composer body, `email-composer-panel.tsx:434-449`), a large complex param shows a truncated preview behind "Edit as JSON". The card stays within `min(400px, …)` dock width and the wider `/chat` column. |
| E-3 | **Run fails after Approve** (`runRegisteredAction` returns `ok:false`, e.g. server 500 inside the page handler) | The error envelope round-trips (AC-2 still sends it), the card shows a "Failed: <reason>" state with a **Retry** affordance that re-invokes `runRegisteredAction` with the same edited params (mirrors the existing create-card retry, `chat-action-cards.tsx:108-113`). Retry is still single-flight (AC-8) — one in-flight run at a time. |
| E-4 | **Double-approve guard** | `runRegisteredAction` is called at most once per `invocationId`; the controller tracks per-invocation status (`pending` → `running` → `done`/`failed`/`dismissed`) and ignores clicks outside `pending`/`failed` (failed allows Retry). At most one success/failure envelope per invocation; Dismiss after a successful run is a no-op. |
| E-5 | **Two confirm cards in one assistant turn** | Two `invokeAction` directives with `requireConfirm:true` in one turn render two independent cards (keyed by their distinct `invocationId`s), each approvable/dismissable independently, each round-tripping its own envelope with its own `invocationId`. The CLE-03 once-only executor key `${messageId}:${partIndex}` already fires each tool part once; CLE-05 keys card state by `invocationId`. |
| E-6 | **Card for an action whose page has since unmounted** | When the user finally clicks Approve, `runRegisteredAction` looks the id up in the live registry; if the page unmounted, it returns the CLE-03 unregistered-id error `{ ok:false, error:"action_not_registered" }`, which round-trips so the model can fall back to a headless tool. The card may also pre-empt this at render time (AC-7) by detecting the id is absent from the live manifest and showing the unavailable state with Dismiss-only. No throw, no stale handler. |
| E-7 | **Dismiss of a `requireConfirm:false` directive** | Not applicable by construction — a `requireConfirm:false` directive runs immediately (AC-4) and never renders a card, so there is no Dismiss to press. (Documented to forestall a "where's the cancel for instant actions" gap: instant actions are reversible-or-read-only by `decideAction`'s contract, and undo is CLE-11.) |
| E-8 | **`requireConfirm:true` for a read-only action** (manifest says `mutating:false` but `decideAction` still asked to confirm) | The card still renders and gates (the directive's `requireConfirm` is authoritative for the gate, not the local scalars — the client trusts the server decision); the badge logic shows no risk badge (read-only), but the confirm gate is honoured. This keeps `decideAction` (CLE-10/CLE-16, which may confirm-everything in a cautious mode) authoritative. |
| E-9 | **Manifest entry missing for badge/title at render** (directive arrived but `getActionManifest()` has no entry for the id — race) | The card degrades to the directive's own data: it shows `actionId` as the title fallback, no badge, params from the directive, and still gates on `requireConfirm`. It never crashes on a missing manifest entry. (Distinct from E-6: here the action may still be registered; only the manifest snapshot read was empty/stale.) |
| E-10 | **Approve while the chat is streaming the next turn** | Approve is allowed regardless of `chat.status` (the user is acting on a settled card, not the live stream); the round-tripped envelope is queued as the next user turn via `sendActionResult` (`chat.sendMessage`), the same mechanism the create-card approve already uses mid-conversation. No requirement that the chat be idle to approve. |

---

## 4. Out of scope (belongs to other CLE features)

- **Computing `requireConfirm`** — the server-side `decideAction` decision (execute/confirm/queue/refuse) → **CLE-04** (stub) / **CLE-10** (real). CLE-05 treats `requireConfirm` as an authoritative boolean carried on the directive (E-8) and never recomputes the decision client-side.
- **The directive contract, the registry, `runRegisteredAction`, `encodeActionResult`/`sendActionResult`, the manifest, and putting it on the wire** → **CLE-03**. CLE-05 consumes these; it does not modify the registry API or the envelope format.
- **The server tools `listPageActions`/`invokePageAction`** and the system-prompt that teaches the model to read the envelope → **CLE-04**.
- **Registering real page actions** (`/opportunities`, `/accounts`, `/contacts`, `/call-mode`) → **CLE-06..09**. CLE-05 is exercised against CLE-03's `debug.ping` smoke action (made/forced `requireConfirm:true` in tests) plus fixtures; it ships no real page action.
- **Audit log + undo window** for executed actions (the "unsend"/undo affordance) → **CLE-11**. CLE-05's Retry on failure is in scope; programmatic undo of a *successful* action is not.
- **Permission matrix** (who may invoke which action) → **CLE-12**. CLE-05 renders whatever directive arrives; role-gating already happened in `decideAction` (a `refuse` never produces a directive, so no card is ever shown for a refused action).
- **Post-action highlight as a full subsystem** (narrate+actuate, cross-page highlight) → **CLE-15**. CLE-05 may emit a *local, best-effort, non-blocking* highlight hook for the immediate surface (AC-4), but the highlight infrastructure and off-web degradation are CLE-15.
- **The four-vocabulary collapse / autonomy wiring** → **CLE-10/CLE-16**. CLE-05's resolution of the "Auto-run" selector (AC-10) must not introduce a new client-side autonomy vocabulary; if kept, it defers to the unified plane — recommended resolution is removal.

---

## 5. Evaluation steps (Phase 6, hostile QA — read literally)

1. **No-run-until-approve (the headline test).** Register the smoke action with `confirm:"always"` (or feed a directive with `requireConfirm:true`). Dispatch the directive through the executor with a `run` spy and a `sendActionResult` spy. Assert: a confirm card mounts, the `run` spy was **NOT** called, and `sendActionResult` was **NOT** called. Then click Approve; assert `run` was called **exactly once** and `sendActionResult` got one `[[action-result]]…` envelope with `ok:true` and the matching `invocationId`. Any pre-approve run = FAIL (AC-1/AC-2).
2. **Edited params reach `runRegisteredAction`.** On a pending card, edit a scalar param (e.g. change `stage` from "Negotiation" to "Won"), click Approve, assert the object passed to `runRegisteredAction` contains the **edited** value, not the original directive value (AC-2/AC-9). This is a required, named test.
3. **Dismiss → cancelled envelope.** Click Dismiss on a pending card; assert `run` was never called and `sendActionResult` got exactly one envelope with `ok:false` and `error:"cancelled"` for the matching `invocationId` (AC-3).
4. **`requireConfirm:false` runs immediately.** Dispatch a directive with `requireConfirm:false`; assert no card mounts, `runRegisteredAction` ran once, and the envelope round-tripped (AC-4) — i.e. CLE-03 behaviour is preserved exactly.
5. **Bad edit re-validated.** On a pending card, edit a param to an invalid value (wrong type / clear a required field), Approve; assert the round-tripped envelope is `ok:false, error:"invalid_params"`, the page handler did **not** run, and the card shows an inline validation message and remains correctable (AC-5).
6. **Badge logic.** Render cards for: `outbound:true` (assert "Sends externally"), `cost:"money"` (assert "Costs money"), `cost:"credits"` (assert "Uses credits"), `mutating:true,reversible:false` (assert "Permanent"), and `mutating:true,reversible:true,cost:"free"` (assert no alarming badge). No emoji in any badge string (AC-6, brand rule).
7. **Nested/array param editing.** Render a card whose params include a nested object and an array; assert scalars are inline-editable and the complex params appear read-only with an "Edit as JSON" control; a valid JSON edit merges back and a malformed JSON edit blocks Approve with an inline error (E-1/AC-9).
8. **Double-approve guard.** Click Approve twice rapidly (and once more after settle); assert `runRegisteredAction` was called exactly once and exactly one envelope round-tripped (AC-8/E-4).
9. **Unmounted-action card.** Render a card, unmount the action's page (remove it from the registry), click Approve; assert the round-tripped envelope is `ok:false, error:"action_not_registered"` and nothing threw; and/or assert the card pre-empts with the unavailable state when the manifest lacks the id (E-6/AC-7).
10. **Run-fails Retry.** Stub `runRegisteredAction` to return `ok:false` once then `ok:true`; Approve → failed state + Retry; click Retry → second run with the same edited params → success; assert exactly two runs total and the final envelope is `ok:true` (E-3), still single-flight.
11. **Selector resolution.** Grep the shipped tree: assert the dead `<select defaultValue="ask">` with un-read value is gone (recommended) — or, if kept, assert a test proves "Auto-run" persists and is consulted by the executor on the next same-`actionId` directive (AC-10). A still-cosmetic selector = FAIL.
12. **Single controller / no worsened duplication.** Assert the page-action confirm-card logic is imported from the shared module by **both** the dock and the `/chat` page (no second inline copy added). Grep `app/(dashboard)/chat/page.tsx` for a duplicated page-action approve handler = FAIL (AC-11).
13. **Regression.** `pnpm tsc --noEmit` → 0 errors. `regression.sh` → green. The existing create/update proposal cards (createContact/createAccount/createDeal/proposeCampaign) and the "Create all N" batch still render and approve exactly as before (CLE-05 must not regress the create-card path it reuses). The two pre-existing directive kinds (`navigate`, `composeEmail`) are behaviourally unchanged.

**Hard thresholds:** AC-1..AC-11 all pass; every edge case E-1..E-10 has a passing test; the two named required tests (no-run-until-approve; edited-params-reach-run) pass; `tsc` 0 errors; the "Auto-run" selector is no longer cosmetic; no second inline copy of the page-action card logic; no emoji in any UI string; the create-card path is not regressed. Any miss = FAIL → delete branch → respec.
