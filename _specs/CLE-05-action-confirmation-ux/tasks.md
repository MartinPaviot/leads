# CLE-05 — Action confirmation / preview / edit-params UX — Tasks

> Branch: `feat/CLE-05-action-confirmation-ux` (off `main`; depends on CLE-03 + CLE-04 being merged or present on the branch base). Commit trailer on every commit: `Co-Authored-By: Rippletide <admin@rippletide.com>`. Merge to `main` only on Phase 6 PASS.
> Each task is independently verifiable and ends with a `tsc`/`vitest` check. Tests are written **in the same task** as the code they cover. Client-only feature — no server file changes, no migration. No new runtime dependency.
> Citations are to real files: `components/chat/use-ui-directives.ts`, `components/chat/chat-action-cards.tsx`, `components/action-card.tsx`, `components/chat/chat-dock.tsx`, `app/(dashboard)/chat/page.tsx`, `components/email-composer-panel.tsx`. All under `app/apps/web/src/`.

---

## Task 0 — Branch + confirm directive type alias

**Action:** Create `feat/CLE-05-action-confirmation-ux` off the CLE-03/CLE-04 base. In `lib/chat/ui-directives.ts`, export a named alias for the `invokeAction` arm of the union (CLE-03 §2.1) for precise controller/card typing:
```ts
export type InvokeActionDirective = Extract<UiDirective, { kind: "invokeAction" }>;
```
(No contract change — it is a `type` derived from the existing union. README §3.1 untouched.)

**Verify:** `pnpm tsc --noEmit` resolves `InvokeActionDirective` to `{ kind:"invokeAction"; invocationId:string; actionId:string; params:Record<string,unknown>; requireConfirm:boolean }`.

**Test:** A `ts` compile-time `satisfies` assertion (in the directives test file CLE-03 already has) that `InvokeActionDirective["requireConfirm"]` is `boolean` and the four fields are present (caught by `tsc`).

---

## Task 1 — Pure field model: `buildConfirmFields` + `collectEditedParams`

**Action:** Create `components/chat/action-confirm-fields.ts` (pure, no React) with the `ConfirmField` union, `buildConfirmFields(paramsJsonSchema, params)` and `collectEditedParams(fields)` per design §4.2. Map JSON-Schema (the `z.toJSONSchema` subset, CLE-04 §2.4) → fields: string/number/integer/boolean → inline scalar; `enum` → enum; `array`/nested `object` → `complex` (read-only + raw JSON). `collectEditedParams` coerces scalars by kind and `JSON.parse`s `complex` raw JSON, throwing a typed `{ field, message }` on malformed JSON (E-1). Long/large string → flag for textarea (E-2).

**Verify:** Import and call in a scratch test; the smoke schema `z.toJSONSchema(z.object({ stage: z.enum(["A","B"]), value: z.number().optional(), notify: z.boolean(), tags: z.array(z.string()), meta: z.object({ x: z.number() }) }))` yields the expected field kinds.

**Test:** `action-confirm-fields.test.ts` — every kind mapping (enum options, optional→not-required, boolean, array→complex, nested-object→complex); scalars pre-filled from `params`; `collectEditedParams` coerces number/boolean, parses valid complex JSON, throws typed error on malformed JSON (E-1); very-large string flagged for textarea (E-2). Covers AC-9, E-1, E-2 pure logic.

---

## Task 2 — Pure badge logic: `riskBadgesFor`

**Action:** Add `riskBadgesFor(entry)` (pure) to `action-confirm-fields.ts` (or a sibling pure module) per design §5: `outbound`→"Sends externally"; `cost:"money"`→"Costs money"; `cost:"credits"`→"Uses credits"; `mutating && !reversible`→"Permanent"; else `mutating`→single neutral "Updates a record"; read-only→`[]`. No emoji.

**Verify:** Call with each scalar combination; labels match.

**Test:** `action-confirm-badges.test.ts` — the full §11 matrix incl. read-only→`[]` and reversible-free→single neutral; a regex assertion that no label contains an emoji (brand rule, AC-6).

---

## Task 3 — Shared confirm controller `useActionConfirmCards`

**Action:** In `components/chat/chat-action-cards.tsx`, add `useActionConfirmCards(chat: ChatSender)` returning `ActionConfirmController` (design §3): a `byId` map keyed by `invocationId` + insertion-ordered `order`, with `enqueueConfirm` (idempotent per id, E-5), `approveActionCard(invocationId, editedParams)` (single-flight status machine `pending→running→done|failed`, AC-8/E-4; calls `runRegisteredAction` from `@/lib/chat/page-actions/registry`, then `chat.sendMessage(encodeActionResult(...))` from `@/components/chat/use-ui-directives`), and `dismissActionCard(invocationId)` (round-trips the cancelled `{ ok:false, summary:"Cancelled by the user.", error:"cancelled" }`, AC-3). Use a `byIdRef` mirror for the live directive read (mirrors `chat-dock.tsx:80-97`). Reuse the existing `ChatSender` interface (`chat-action-cards.tsx:20-22`).

**Verify:** `pnpm tsc --noEmit` clean; controller exported; no REST call in the page-action path (only `runRegisteredAction` + `sendMessage`).

**Test:** `action-confirm-controller.test.tsx` (React Testing Library), with `runRegisteredAction` mocked and a `sendMessage` spy:
- **REQUIRED — no-run-until-approve:** enqueue a `requireConfirm:true` directive → assert `runRegisteredAction` NOT called and no envelope sent until Approve (AC-1).
- **REQUIRED — edited params reach run:** seed directive `params:{stage:"Negotiation"}`; `approveActionCard(invId, {stage:"Won"})` → assert `runRegisteredAction` received `{stage:"Won"}` (AC-2).
- Approve round-trips `ok:true` envelope with matching `invocationId` (AC-2); dismiss round-trips `error:"cancelled"`, no run (AC-3); enqueue idempotent per id (E-5); double-approve → exactly one run + one envelope (AC-8/E-4); run-fails → `failed`, Retry re-runs same params, two runs total, final `ok:true` (E-3); unregistered at approve → `action_not_registered` envelope (E-6).

---

## Task 4 — Confirm card component `ActionConfirmCard`

**Action:** Create `components/chat/action-confirm-card.tsx` (design §4): props `{ directive, status, onApprove, onDismiss }`. Look up the manifest entry via `getActionManifest()` (`@/lib/chat/page-actions/registry`); render title/description/badges (`riskBadgesFor`)/schema-derived fields (`buildConfirmFields`). Reuse `ActionCard`'s visual grammar + the inline-edit interaction from `action-card.tsx:170-233`; complex fields show read-only preview + an "Edit as JSON" `<textarea>` (long strings → textarea, mirroring `email-composer-panel.tsx:434-449`). Action bar: Dismiss + Approve (contextual label; spinner+disabled on `running`, AC-8; **Retry** on `failed`, E-3; terminal label on `done`/`dismissed`). On Approve, call `collectEditedParams`; a thrown JSON error (E-1) blocks Approve and shows inline. Fallbacks: missing entry → directive data (E-9); unregistered action → unavailable state, Dismiss-only, Approve hidden (E-6). No emoji in any string.

**Verify:** Storybook-free manual render in a test harness shows the card for a fixture directive + manifest entry.

**Test:** `action-confirm-card.test.tsx` — renders title/desc/badges/fields (AC-7); edit a scalar → Approve → `onApprove` gets the edited object (AC-9); malformed complex JSON → Approve blocked + inline error, `onApprove` not called (E-1); `running` → Approve disabled+spinner (AC-8); `failed` → Retry shown (E-3); absent/unregistered entry → unavailable state with Dismiss-only (E-6/AC-7); `requireConfirm:true` read-only → no badge, card still gates (E-8).

---

## Task 5 — Render queue `ActionConfirmCards`

**Action:** In `chat-action-cards.tsx`, add `ActionConfirmCards({ controller })` (sibling of `MessageActionCards`) that maps `controller.pending` → one `ActionConfirmCard` per entry, wiring `onApprove`/`onDismiss` to `controller.approveActionCard`/`dismissActionCard` with the card's collected edited params (design §3.1). One card per `invocationId`; survives re-renders (E-5).

**Verify:** `tsc` clean; component exported.

**Test:** Extend `action-confirm-controller.test.tsx` — enqueue two directives with distinct `invocationId`s → two cards render, each approvable independently with its own envelope (E-5).

---

## Task 6 — Branch the executor on `requireConfirm`

**Action:** In `components/chat/use-ui-directives.ts`, change the `invokeAction` arm of `runUiDirective` (CLE-03 §2.4) to branch (design §2): `requireConfirm === false` → the existing run-now path (`runRegisteredAction(...).then(sendActionResult)`), unchanged; `requireConfirm === true` → `ctx.enqueueConfirm(d)` and **return without running**. Add `enqueueConfirm: (d: InvokeActionDirective) => void` to the ctx type. Keep `navigate`/`composeEmail` arms and `useUiDirectives` untouched.

**Verify:** `tsc` clean; the ctx type now requires `enqueueConfirm`; both callers (Task 7/8) must supply it.

**Test:** `use-ui-directives.confirm.test.ts(x)` — **REQUIRED**: `requireConfirm:true` → `enqueueConfirm` called, `runRegisteredAction` spy NOT called, `sendActionResult` spy NOT called (AC-1). `requireConfirm:false` → run-now path: `runRegisteredAction` ran, envelope sent, `enqueueConfirm` NOT called (AC-4 / CLE-03 regression). Malformed `invokeAction` still ignored (CLE-03 parser regression, via `parseUiDirective`).

---

## Task 7 — Wire the dock (`chat-dock.tsx`)

**Action:** In `components/chat/chat-dock.tsx`: instantiate the confirm controller `const actionConfirm = useActionConfirmCards(chat);` near `useChatActionCards` (`:124`). Add `enqueueConfirm: (d) => actionConfirm.enqueueConfirm(d)` to the `onDirective` ctx (`:129-137`; `sendActionResult` is already wired by CLE-03 §2.5). Render `<ActionConfirmCards controller={actionConfirm} />` in the message stream near `<MessageActionCards>` (`:457`).

**Verify:** `tsc` clean; the dock compiles with the new ctx field. Manual: dispatching a `requireConfirm:true` directive in the dock shows a card and does not run; Approve runs + the assistant continues.

**Test:** A dock-level RTL smoke (or extend the controller test) asserting the dock passes `enqueueConfirm` into `runUiDirective` and renders a pending card from the controller. (No Playwright; CLE-05 ships no real page.)

---

## Task 8 — Wire the `/chat` page (`app/(dashboard)/chat/page.tsx`) without worsening duplication

**Action:** In the `/chat` page: instantiate `const actionConfirm = useActionConfirmCards(chat);`; add `sendActionResult: (text) => chat.sendMessage({ text })` **and** `enqueueConfirm: (d) => actionConfirm.enqueueConfirm(d)` to its `onDirective` ctx (`:69-77`); render the shared `<ActionConfirmCards controller={actionConfirm} />`. Do **NOT** add any inline page-action approve/dismiss logic (AC-11). (The page's existing inline *create-card* block at `:586-761` is untouched in this task — see Task 9.)

**Verify:** `tsc` clean; grep the page for an inline page-action handler → none added; the page imports `useActionConfirmCards`/`ActionConfirmCards` from `chat-action-cards.tsx`.

**Test:** Consolidation guard test — assert `app/(dashboard)/chat/page.tsx` references the shared confirm controller/renderer and contains no second `runRegisteredAction`/page-action approve copy (AC-11).

---

## Task 9 — (Optional, isolated commit) Consolidate the existing inline create-card duplication

**Action:** Replace the `/chat` page's inline create-card controller (`app/(dashboard)/chat/page.tsx:586-761`) with the shared `useChatActionCards(chat)` + `<MessageActionCards message=… controller=… />` the dock already uses (design §7, item 1 bonus). Delete the inline `approveCard`, `cardStatuses`/`cardExecuting` locals, and the inline batch bar; keep behaviour identical. This is its own commit so it can be reverted independently.

**Verify:** `tsc` clean; the create/update/campaign cards + "Create all N" still render and approve on the `/chat` page identically (manual + the regression test below). If the change perturbs page layout or risks scope-creep, **drop this task** — CLE-05 passes without it (headline scope is page-action cards).

**Test:** Create-card regression (eval step 13) runs against the `/chat` page after consolidation: createContact/createAccount/createDeal proposals + campaign + "Create all N" approve exactly as before. Assert the inline block is gone (no `defaultValue` create handler inline in the page).

---

## Task 10 — Remove the dead "Ask every time / Auto-run" selector

**Action:** Delete the `<select defaultValue="ask">` block from `components/action-card.tsx:242-257` (design §6, AC-10 resolution (b) = remove). Keep the rest of the action bar (Dismiss + Approve) and the inline field editing intact.

**Verify:** `tsc` clean; the create-card still renders Approve/Dismiss and edits fields; no orphaned imports.

**Test:** Selector-removal guard — assert `action-card.tsx` no longer contains `defaultValue="ask"` or the "Auto-run" `<option>` (AC-10); assert `ActionCard` approve/dismiss still works (create-card not regressed).

---

## Task 11 — Full acceptance + regression sweep

**Action:** Run the Phase-6 evaluation steps (requirements §5) end to end against the smoke action (`debug.ping` forced `requireConfirm:true`) + fixtures. Confirm both **required named tests** pass (no-run-until-approve, Task 6/3; edited-params-reach-run, Task 3). Run `regression.sh`.

**Verify:**
- `pnpm tsc --noEmit` → 0 errors.
- `pnpm vitest run` (the CLE-05 files + CLE-03/CLE-04 suites) → green; CLE-03/CLE-04 tests untouched.
- `regression.sh` → green.
- Grep sweep: no emoji in any new UI string; no `defaultValue="ask"` in the tree; no inline page-action card copy in the `/chat` page.
- Manual (dock): a `requireConfirm:true` directive shows an editable card with the right badge, does not run until Approve, runs edited params on Approve, round-trips a cancelled envelope on Dismiss; a `requireConfirm:false` directive runs immediately with no card.

**Test:** This task gates the merge: every AC-1..AC-11 and E-1..E-10 has a green test (the tests authored in Tasks 1–10). Any miss → fix or, per CLAUDE.md max-retries, respec. On PASS → merge to `main`.

---

## Ordering rationale

1–2 (pure helpers) have no deps and are fully unit-testable → build + prove first. 3 (controller) depends on the codec/registry (CLE-03) only. 4–5 (card + queue) depend on 1–3. 6 (executor branch) depends on 3's `enqueueConfirm` shape. 7–8 (wiring) depend on 3–6 and must both supply the new ctx field (so the build is green only once both callers are wired). 9 (optional consolidation) and 10 (selector removal) are independent cleanups gated behind their own regression. 11 is the acceptance gate. This order keeps `tsc` green after each task except the brief window between Task 6 (ctx type widened) and Tasks 7–8 (callers updated) — do 6→7→8 back-to-back, or land 6 with both callers in the same commit if a green intermediate is required.
