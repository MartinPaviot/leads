# CLE-05 — Action confirmation / preview / edit-params UX — Design

> Implements README §4.6 on the §3.1 directive (`requireConfirm`), §3.2/§3.3 registry types, and §3.5 envelope — all built in CLE-03. Every contract type is consumed **verbatim**; CLE-05 adds UI + one executor branch and changes **no** contract. Anything internal is marked "internal — not in §3".
> Builds on `_specs/CLE-03-action-directive-and-registry/design.md` (the executor arm it replaces is CLE-03 §2.4; the registry it calls is CLE-03 §2.3; the codec it reuses is CLE-03 §2.4) and `_specs/CLE-04-page-action-tools/design.md` (which produces `requireConfirm` and emits the directive). CLE-05 touches the **client** only.

---

## 1. System fit (where each piece lands, with file:line)

CLE-03 left a deliberate seam: `runUiDirective`'s `invokeAction` arm runs the action **immediately** and round-trips, with a comment that *CLE-05 will branch on `d.requireConfirm` to render a confirm card first* (CLE-03 §2.4). CLE-05 fills that seam. The confirm path needs a place to **hold** a pending directive and render a card — that place is the existing card controller the dock already owns (`useChatActionCards`, `chat-action-cards.tsx:42-138`) and the existing editable card component (`action-card.tsx`). We extend, not fork.

| Concern | Today | After CLE-05 |
|---|---|---|
| Directive executor (`invokeAction` arm) | `components/chat/use-ui-directives.ts` — CLE-03 added an `invokeAction` arm that always `runRegisteredAction(...).then(sendActionResult)` (CLE-03 §2.4 `use-ui-directives.ts` new arm). | The arm **branches on `d.requireConfirm`**: `false` → run-now (unchanged CLE-03 path, AC-4); `true` → hand the directive to a new `enqueueConfirm(d)` ctx fn that the card controller owns (AC-1). The run + envelope helpers (`runRegisteredAction`, `encodeActionResult`) are reused verbatim. |
| Card controller (approve/dismiss/state) | `components/chat/chat-action-cards.tsx:42-138` — `useChatActionCards(chat)` holds `cardStatuses`/`cardExecuting` keyed by `cardKey`, with `approveCard` (REST round-trip for create) + `dismissCard`. The dock uses it (`chat-dock.tsx:124`). | + a parallel **page-action confirm controller** in the same module: holds a queue of pending `invokeAction` directives keyed by `invocationId`, plus per-invocation status, and exposes `enqueueConfirm`, `approveActionCard`, `dismissActionCard`. It calls `runRegisteredAction` + `sendActionResult` (NOT REST — page actions run on the client). Single-sourced; the `/chat` page consumes the same controller (AC-11). |
| Card renderer | `components/action-card.tsx:49-279` — `ActionCard` (entity create/update card: header, editable fields via inline `Pencil`, `:170-233`; action bar with the dead `<select>`, `:242-257`; Approve/Dismiss). `parseToolResultForCard` (`:282-399`) maps a tool result → card props. | **NEW** `components/chat/action-confirm-card.tsx` — `ActionConfirmCard` for page actions: reuses the visual grammar of `ActionCard` (header, fields block, action bar) but is driven by a **JSON-Schema-derived** field set (§4) and shows a **risk badge** (§5). The dead `<select>` is **removed** from `ActionCard` (AC-10, §6). |
| Field editor | `action-card.tsx:170-233` — flat `Record<string,string|number|null>` fields, one inline `<input>` per key on click (`editingKey`), `handleFieldChange` (`:79-81`). | A small **schema-driven field model** (§4): scalars → inline controls (reusing this exact pattern), enums → `<select>`, booleans → toggle, complex → read-only preview + "Edit as JSON" `<textarea>` fallback. Lives in `action-confirm-card.tsx`. |
| Round-trip codec | `components/chat/use-ui-directives.ts` (CLE-03 §2.4) — `encodeActionResult(invocationId, result)`, `ACTION_RESULT_OPEN/CLOSE`, `sendActionResult` ctx fn wired in `chat-dock.tsx` `onDirective` (CLE-03 §2.5). | Reused unchanged for Approve (AC-2). For Dismiss, CLE-05 encodes a **cancelled** `PageActionResult` (`{ ok:false, summary:"Cancelled by the user.", error:"cancelled" }`) through the **same** `encodeActionResult` (AC-3) — no new envelope format. |
| Dock wiring | `chat-dock.tsx:129-137` — `onDirective` builds the ctx (`navigate`, `openComposer`, `sendActionResult`) for `runUiDirective`; renders `<MessageActionCards controller={actionCards} />` (`:457`). | `onDirective` ctx gains `enqueueConfirm: (d) => actionCards.enqueueConfirm(d)`; the dock renders pending `ActionConfirmCard`s from the controller queue (a new `<ActionConfirmCards controller=… />`, sibling of `MessageActionCards`). |
| `/chat` page wiring | `app/(dashboard)/chat/page.tsx:69-77` builds its own `onDirective` (only `navigate`+`openComposer` — no `sendActionResult` yet, since CLE-03 added it via the dock); `:586-761` is an **inline copy** of the create-card controller (duplication CLE-05 must not worsen, AC-11). | `onDirective` gains `sendActionResult` + `enqueueConfirm` (both from the shared controller); the page renders the shared `<ActionConfirmCards controller=… />`. CLE-05 adds **no** inline page-action logic here (AC-11). Consolidating the *existing* inline create-card copy is an optional bonus task (§7). |

CLE-05 stops at: the executor branches on `requireConfirm`; the shared controller holds + renders editable confirm cards; Approve runs edited params and round-trips; Dismiss round-trips a cancelled envelope; the badge + schema-driven editor exist; the dead selector is resolved. It modifies **no** server file and **no** contract.

---

## 2. The executor branch (the one seam CLE-05 changes)

`runUiDirective` (`components/chat/use-ui-directives.ts`) — replace CLE-03's always-run `invokeAction` arm with a branch. The two existing arms (`navigate`, `composeEmail`) and the `false` path stay byte-for-byte CLE-03 behaviour.

```ts
export function runUiDirective(
  d: UiDirective,
  ctx: {
    navigate: (path: string) => void;
    openComposer: (draft: ComposeEmailDraft) => void;
    sendActionResult: (text: string) => void;       // CLE-03 — round-trip the envelope
    enqueueConfirm: (d: InvokeActionDirective) => void; // CLE-05 — hand a confirm-needed directive to the card controller
  },
): void {
  if (d.kind === "navigate") ctx.navigate(d.path);
  else if (d.kind === "composeEmail") ctx.openComposer(d.draft);
  else if (d.kind === "invokeAction") {
    if (d.requireConfirm) {
      // AC-1: do NOT run. Hand to the controller, which renders an editable card.
      ctx.enqueueConfirm(d);
    } else {
      // AC-4: unchanged CLE-03 path — run immediately, round-trip the result.
      void runRegisteredAction(d.actionId, d.params).then((result) => {
        ctx.sendActionResult(encodeActionResult(d.invocationId, result));
      });
    }
  }
}
```

> `InvokeActionDirective` is the `invokeAction` arm of the `UiDirective` union (CLE-03 §2.1). We export a named alias for it from `lib/chat/ui-directives.ts` (internal convenience, not a new contract field) so the controller signature is precise: `export type InvokeActionDirective = Extract<UiDirective, { kind: "invokeAction" }>;`.

`useUiDirectives` is unchanged in structure (once-only, keyed `${last.id}:${idx}`, CLE-03). It still fires each tool part once; for a `requireConfirm:true` directive "firing" now means *enqueue a card*, not *run*. Because enqueue is keyed by `invocationId` in the controller (§3), a re-render cannot enqueue the same card twice (E-5).

---

## 3. The shared confirm controller (`chat-action-cards.tsx`)

Add to `components/chat/chat-action-cards.tsx` a page-action confirm controller, **next to** `useChatActionCards`. It is the single owner of pending-confirm state for both surfaces (AC-11). It must NOT use REST (unlike the create-card `approveCard`); page actions run on the client via `runRegisteredAction`.

```ts
import { runRegisteredAction } from "@/lib/chat/page-actions/registry";
import { encodeActionResult } from "@/components/chat/use-ui-directives";
import type { InvokeActionDirective } from "@/lib/chat/ui-directives";
import type { PageActionResult } from "@/lib/chat/page-actions/types";

type ConfirmStatus = "pending" | "running" | "done" | "failed" | "dismissed";

interface PendingConfirm {
  directive: InvokeActionDirective;   // carries invocationId, actionId, params, requireConfirm:true
  status: ConfirmStatus;
  resultSummary?: string;             // last run summary (for done/failed display)
  error?: string;                     // last error (for failed display)
}

export interface ActionConfirmController {
  pending: PendingConfirm[];                       // render order; one card per invocationId
  enqueueConfirm: (d: InvokeActionDirective) => void;
  approveActionCard: (invocationId: string, editedParams: Record<string, unknown>) => Promise<void>;
  dismissActionCard: (invocationId: string) => void;
}

export function useActionConfirmCards(chat: ChatSender): ActionConfirmController {
  const [byId, setById] = useState<Record<string, PendingConfirm>>({});
  // Stable render order: keep an insertion-ordered id list.
  const [order, setOrder] = useState<string[]>([]);

  const enqueueConfirm = useCallback((d: InvokeActionDirective) => {
    setById((prev) => {
      if (prev[d.invocationId]) return prev;        // E-5: idempotent per invocationId
      return { ...prev, [d.invocationId]: { directive: d, status: "pending" } };
    });
    setOrder((prev) => (prev.includes(d.invocationId) ? prev : [...prev, d.invocationId]));
  }, []);

  const roundTrip = useCallback((invocationId: string, r: PageActionResult) => {
    chat.sendMessage({ text: encodeActionResult(invocationId, r) });   // AC-2 / AC-3 — same path as create card
  }, [chat]);

  const approveActionCard = useCallback(async (invocationId: string, editedParams: Record<string, unknown>) => {
    let proceed = false;
    setById((prev) => {
      const cur = prev[invocationId];
      if (!cur || (cur.status !== "pending" && cur.status !== "failed")) return prev; // AC-8 / E-4 single-flight
      proceed = true;
      return { ...prev, [invocationId]: { ...cur, status: "running", error: undefined } };
    });
    if (!proceed) return;                            // double-click / not in a runnable state

    const cur = byIdRef.current[invocationId];       // read live directive (ref mirror, see note)
    const result = await runRegisteredAction(cur.directive.actionId, editedParams); // AC-2; re-validates (AC-5); never throws (CLE-03 §2.3)
    roundTrip(invocationId, result);                 // AC-2: success OR validation/lookup error envelope
    setById((prev) => ({
      ...prev,
      [invocationId]: {
        ...prev[invocationId],
        status: result.ok ? "done" : "failed",        // E-3: failed keeps Retry available
        resultSummary: result.summary,
        error: result.error,
      },
    }));
  }, [roundTrip]);

  const dismissActionCard = useCallback((invocationId: string) => {
    let proceed = false;
    setById((prev) => {
      const cur = prev[invocationId];
      if (!cur || cur.status === "running" || cur.status === "done" || cur.status === "dismissed") return prev; // AC-8
      proceed = true;
      return { ...prev, [invocationId]: { ...cur, status: "dismissed" } };
    });
    if (!proceed) return;
    // AC-3: round-trip a cancelled PageActionResult through the SAME codec.
    roundTrip(invocationId, { ok: false, summary: "Cancelled by the user.", error: "cancelled" });
  }, [roundTrip]);

  const pending = order.map((id) => byId[id]).filter(Boolean);
  return { pending, enqueueConfirm, approveActionCard, dismissActionCard };
}
```

> Internal notes (not §3 contract): `byIdRef` is a `useRef` mirror of `byId` so `approveActionCard` reads the live directive without adding `byId` to its deps (keeps the callback stable, mirrors the dock's `surfaceRef`/`threadIdRef` pattern, `chat-dock.tsx:80-97`). The `running`/`done`/`failed`/`dismissed` machine is the AC-8/E-4 single-flight guard. `runRegisteredAction` already converts a thrown handler into `{ok:false,error}` (CLE-03 §2.3 / CLE-03 E-7), so `approveActionCard` needs no try/catch around it; the envelope still round-trips (E-3).

`ChatSender` is the existing minimal interface (`chat-action-cards.tsx:20-22`, `{ sendMessage }`) — reused, no change.

### 3.1 The render component

Add `ActionConfirmCards` to `chat-action-cards.tsx` (sibling of `MessageActionCards`), iterating `controller.pending` and rendering one `ActionConfirmCard` (§4) per entry. Unlike `MessageActionCards` (which parses cards off a specific message's tool parts), confirm cards are **conversation-global pending UI** owned by the controller — they render in the message stream after the assistant message that produced them (the dock/page place `<ActionConfirmCards>` once, near `<MessageActionCards>`).

Placement decision (rationale): a confirm card is tied to an `invocationId`, not to a re-render of a message's parts. Rendering it from the controller queue (not by re-parsing message parts) means a card survives re-renders, never double-mounts (E-5), and does not depend on the directive still being present in `chat.messages` — matching how the email composer is a single panel owned by the surface, not re-derived per message.

---

## 4. The confirm card + JSON-Schema-driven field editor (`action-confirm-card.tsx`)

`ActionConfirmCard` reuses `ActionCard`'s visual grammar (same tokens, header, fields rows, action bar) but is parameterized by a schema-derived field model rather than a flat string map. It reads its display data from the **manifest entry** (looked up live via `getActionManifest()`), falling back to the directive on a miss (E-9).

### 4.1 Props + manifest lookup

```ts
interface ActionConfirmCardProps {
  directive: InvokeActionDirective;          // invocationId, actionId, params, requireConfirm:true
  status: ConfirmStatus;
  onApprove: (editedParams: Record<string, unknown>) => void;  // → controller.approveActionCard(invocationId, …)
  onDismiss: () => void;                                        // → controller.dismissActionCard(invocationId)
}
```

At render, look up the entry: `const entry = getActionManifest().find(e => e.id === directive.actionId);`
- entry present → title/description/scalars/schema from `entry` (AC-7).
- entry absent but the action is still registered (race on the manifest snapshot) → degrade to directive data, `actionId` as title, no badge (E-9).
- action not registered at all (page unmounted) → render the **unavailable state**: "This action is no longer available on this page.", Dismiss-only, Approve hidden (E-6/AC-7). Detect via `getActionManifest()` miss; the authoritative check still happens in `runRegisteredAction` at Approve time (E-6).

### 4.2 Field model derived from `paramsJsonSchema` (AC-9, E-1, E-2)

A pure helper, **unit-testable in isolation** (internal — not §3):

```ts
// components/chat/action-confirm-fields.ts  (pure, no React)
export type ConfirmField =
  | { key: string; kind: "string"; label: string; value: string; required: boolean }
  | { key: string; kind: "number"; label: string; value: string; required: boolean }
  | { key: string; kind: "boolean"; label: string; value: boolean; required: boolean }
  | { key: string; kind: "enum"; label: string; value: string; options: string[]; required: boolean }
  | { key: string; kind: "complex"; label: string; rawJson: string; required: boolean }; // nested/array → read-only + Edit-as-JSON

/** Build the editable field list from the entry's paramsJsonSchema + the directive params. */
export function buildConfirmFields(
  paramsJsonSchema: unknown,
  params: Record<string, unknown>,
): ConfirmField[];

/** Re-assemble an editedParams object from the (possibly edited) field values.
 *  Throws a typed error if a "complex" field's rawJson is not valid JSON (E-1). */
export function collectEditedParams(fields: ConfirmField[]): Record<string, unknown>;
```

Mapping rules (mirrors CLE-03/CLE-04's JSON-Schema subset — `z.toJSONSchema` of a plain `z.object`, CLE-04 §2.4):
- `type:"string"` → `string` field (inline `<input>`; long/`maxLength`-large or `format` body-ish → `<textarea>`, E-2, mirrors `email-composer-panel.tsx:434-449`).
- `type:"number"|"integer"` → `number` field (inline numeric `<input>`; value kept as string for editing, coerced on collect).
- `type:"boolean"` → `boolean` field (a small toggle/checkbox).
- `enum: [...]` → `enum` field (`<select>` of the members; pre-selected from the param).
- `type:"array"` or `type:"object"` (nested) → `complex` field: **read-only** compact JSON preview + an "Edit as JSON" `<textarea>` fallback (AC-9/E-1). `rawJson = JSON.stringify(params[key] ?? defaultForSchema, null, 0)`.
- `required` comes from the schema's `required` array; a cleared required scalar fails re-validation at Approve (AC-5), surfaced inline.

`collectEditedParams`: scalars coerce by kind (number string → `Number`, boolean → `boolean`, enum/string → as-is); `complex` fields `JSON.parse(rawJson)` — a parse failure throws `{ field: key, message }` which the card catches to block Approve and show an inline error (E-1). The result object is exactly what flows to `runRegisteredAction` (AC-2), which re-validates against the **live Zod schema** (AC-5) — so this builder is permissive by design: the authoritative gate is downstream (defense in depth, mirrors CLE-04 §5's two-gate posture).

Reuse: the inline-edit interaction (click value → input → blur/Enter commits) is lifted from `action-card.tsx:170-233` (`editingKey`, `handleFieldChange`); the card keeps a `Record<key, fieldValue>` edit-state seeded from `buildConfirmFields`, identical in spirit to `ActionCard`'s `editedFields` (`:67-73`). We do not invent a new editing idiom.

### 4.3 The action bar

Mirror `ActionCard`'s bar (`:236-276`) **minus the dead `<select>`** (removed, §6): Dismiss (left/secondary) + Approve (accent). Approve label is contextual: outbound → "Send", money → "Confirm & pay" is avoided (no over-promising) in favour of "Confirm", destructive → "Confirm", default → "Run". Approve shows a spinner + disabled while `status === "running"` (AC-8); on `failed`, the primary becomes **Retry** (re-calls `onApprove` with the current edited params, E-3). On `done`/`dismissed` the bar is replaced by a terminal label ("Done" / "Failed" / "Dismissed"), same as `ActionCard`'s approved/dismissed header treatment (`:120-136`).

---

## 5. Badge logic (AC-6)

A pure helper (internal — not §3), unit-testable, driven by the manifest entry's scalars:

```ts
// components/chat/action-confirm-fields.ts (or a sibling) — pure
export interface RiskBadge { label: string; tone: "danger" | "warn" | "neutral"; }

export function riskBadgesFor(entry: {
  mutating: boolean; outbound: boolean; reversible: boolean; cost: "free" | "credits" | "money";
}): RiskBadge[] {
  const out: RiskBadge[] = [];
  if (entry.outbound) out.push({ label: "Sends externally", tone: "warn" });
  if (entry.cost === "money") out.push({ label: "Costs money", tone: "danger" });
  else if (entry.cost === "credits") out.push({ label: "Uses credits", tone: "warn" });
  if (entry.mutating && !entry.reversible) out.push({ label: "Permanent", tone: "danger" });
  // Plain reversible free mutation → a single neutral, non-alarming label.
  if (out.length === 0 && entry.mutating) out.push({ label: "Updates a record", tone: "neutral" });
  return out;
}
```

Rendering: badges sit in the card header (right of the title), each a small pill using existing tokens — `danger` → error tokens (`var(--color-error)` family, as in `email-composer-panel.tsx:452-460`), `warn` → accent-soft, `neutral` → muted. **No emoji** in any label (brand rule). The badge set is derived purely from manifest scalars, so it cannot drift from what `decideAction` saw server-side (same scalars feed both, CLE-04 §2.1). E-8: a `requireConfirm:true` read-only action yields `[]` badges but still gates — the badge reflects risk, the gate reflects the server decision.

---

## 6. The "Ask every time / Auto-run" selector — resolution (AC-10)

**Decision: REMOVE it (recommended resolution (b)).** Delete the `<select defaultValue="ask">` block from `action-card.tsx:242-257`. Rationale:

1. **It is dead.** Its value is never read by any handler — `onApprove` ignores it (`action-card.tsx:267`), no state is wired to it. It is pure decoration today.
2. **It would become a fifth approval vocabulary.** The audit and README §1.4 explicitly target collapsing the **four** disconnected approval/autonomy vocabularies into one plane (`decideAction` + approval-mode, CLE-10/CLE-16). A client-only per-action "auto-run" toggle that the executor consults would be a new, parallel, client-local autonomy lever — exactly the anti-pattern this initiative is removing. The real "auto-run this class of action" lever is approval-mode → `decideAction` (which already returns `execute` for safe actions, so they never reach a card, AC-4).
3. **Least surface, no dead control ships.** Removing it is a few-line deletion; the create-card keeps its Approve/Dismiss. If a per-action preference is ever wanted, it belongs in the unified plane (CLE-16's "learned thresholds"), persisted server-side and consumed by `decideAction` — not bolted onto the card.

Consequence: `ActionCard`'s action bar loses the `<select>`; `ActionConfirmCard` never had one. A test asserts the selector is gone (no `defaultValue="ask"` in the tree). The README's "one control plane" principle is honoured (no client-side fork of autonomy).

> If Martin overrides toward (a) keep-and-wire: the minimal honest version is a per-action preference persisted via the existing settings surface and read by `decideAction` (server-side), NOT a client-only toggle — i.e. it collapses into CLE-10's scope. That is recorded as the documented alternative; v1 ships removal.

---

## 7. Consolidation plan for the duplicated card logic (AC-11)

Two layers of duplication exist; CLE-05 must not worsen them and single-sources the **new** path:

1. **Existing create-card duplication (pre-CLE-05):** `app/(dashboard)/chat/page.tsx:586-761` reimplements inline the exact controller already in `useChatActionCards`/`MessageActionCards` (`chat-action-cards.tsx`). The dock uses the shared one; the page uses its inline twin. This predates CLE-05.
   - **CLE-05 requirement:** do not add a second inline copy for page actions. The page-action confirm controller + renderer live **only** in `chat-action-cards.tsx`; the `/chat` page imports `useActionConfirmCards` + `<ActionConfirmCards>` (no inline page-action logic). (AC-11.)
   - **Bonus task (optional, low-risk, in `tasks.md`):** replace the page's inline create-card block (`:586-761`) with the shared `useChatActionCards`+`<MessageActionCards>` the dock already uses — deleting ~175 lines and making the two surfaces identical for create cards too. Gated behind its own commit + the create-card regression test (eval step 13) so it can be reverted independently if it perturbs the page layout. If it risks scope-creep at build time, it is dropped without failing CLE-05 (the headline scope is page-action cards).

2. **Directive ctx duplication:** both `chat-dock.tsx:129-137` and `chat/page.tsx:69-77` build a `runUiDirective` ctx. CLE-05 adds the **same** two ctx fields (`sendActionResult`, `enqueueConfirm`) in both — wired to the shared controller. This is inherent to two `useChat` instances (the dock and the full page each own one) and is not new duplication; both point at one controller implementation.

Net: one controller implementation for page-action confirm cards, consumed by both surfaces; the older create-card duplication is left no worse (and optionally fixed).

---

## 8. Data flow (directive → confirm gate → approve/dismiss → envelope → model)

```
        ┌──────────────── SERVER (CLE-04, out of scope) ───────────────┐
 model ─▶│ invokePageAction → decideAction → requireConfirm             │
        │ returns { ...invokeActionDirective(invocationId, id, params, requireConfirm) }
        └───────────────────────────────┬──────────────────────────────┘
                                         │ tool result carries _uiDirective (CLE-03 §3.1)
                                         ▼
        ┌──────────────────────────── CLIENT (CLE-05) ─────────────────────────────┐
        │ parseUiToolParts → parseUiDirective → { kind:"invokeAction", …, requireConfirm }
        │ useUiDirectives (once-only, keyed msgId:idx) → runUiDirective(d, ctx)        │
        │                                                                              │
        │  requireConfirm === false ──▶ runRegisteredAction(id, params)  (AC-4)         │
        │                              └▶ sendActionResult(encodeActionResult(invId,r)) │
        │                                                                              │
        │  requireConfirm === true  ──▶ ctx.enqueueConfirm(d)  (AC-1, NO run)            │
        │       controller stores PendingConfirm{ directive, status:"pending" } by invId│
        │       ActionConfirmCard renders: title/desc (manifest), badges (riskBadgesFor),│
        │                       schema-derived editable fields (buildConfirmFields)      │
        │                                                                              │
        │   user edits params … then:                                                  │
        │     Approve ─▶ collectEditedParams() ─(JSON ok? E-1)▶ approveActionCard(invId,│
        │                   editedParams)                                              │
        │                 → status:"running" (single-flight, AC-8/E-4)                  │
        │                 → runRegisteredAction(id, editedParams)  ── re-validates (AC-5)│
        │                 → roundTrip: sendMessage("[[action-result]]{…}[[/action-result]]")
        │                 → status: ok?"done":"failed"  (failed → Retry, E-3)           │
        │     Dismiss  ─▶ dismissActionCard(invId)  (NO run)                            │
        │                 → roundTrip cancelled { ok:false, error:"cancelled" }  (AC-3) │
        └───────────────────────────────────┬──────────────────────────────────────────┘
                                             ▼
        next POST /api/chat carries the tagged envelope as a user turn
        → model (taught by CLE-04's <page_actions> block) reads invocationId+ok+summary → chains
```

The boundary: CLE-03 owns the codec + registry run; CLE-04 owns the directive emission + the prompt that reads the envelope; CLE-05 owns the gate (confirm vs run-now), the editable card, the badge, and the cancelled-envelope on dismiss.

---

## 9. Failure handling (every branch resolves to a card state and/or an envelope; nothing throws)

| Failure | Where caught | Outcome |
|---|---|---|
| Directive needs confirm | `runUiDirective` `requireConfirm` branch (§2) | `enqueueConfirm` — card mounts; no run, no envelope yet (AC-1). |
| Approve with invalid edited params | `runRegisteredAction` `safeParse` (CLE-03 §2.3) | `{ ok:false, error:"invalid_params" }` round-trips; card → `failed` with inline message; `run` not called (AC-5). |
| Complex-field JSON malformed | `collectEditedParams` `JSON.parse` throw, caught in the card (§4.2) | Approve blocked, inline "Invalid JSON in <field>"; no `runRegisteredAction` call (E-1). |
| Run returns `ok:false` (handler error, server 500 inside handler) | `approveActionCard` reads `result.ok` (§3) | Error envelope round-trips; card → `failed`; **Retry** re-runs same edited params (E-3); still single-flight. |
| Handler `run` throws | `runRegisteredAction` try/catch (CLE-03 §2.3 / E-7) | Converted to `{ok:false,error}`; same as above. `approveActionCard` needs no try/catch. |
| Double Approve / Dismiss | `approveActionCard`/`dismissActionCard` status guards (§3) | Second call no-ops; ≤1 run and ≤1 envelope per `invocationId` (AC-8/E-4). |
| Action unregistered at Approve (page unmounted) | `runRegisteredAction` unregistered branch (CLE-03 §2.3) | `{ok:false,error:"action_not_registered"}` round-trips; card → `failed`; model can fall back headless (E-6). |
| Manifest entry missing at render | `ActionConfirmCard` fallback (§4.1) | Degrades to directive data / unavailable state; no crash (E-9 / E-6). |
| Two confirm directives in one turn | controller keyed by `invocationId` (§3) | Two independent cards; each its own envelope (E-5). |
| Dismiss after a successful run | `dismissActionCard` guard rejects non-pending/failed (§3) | No-op; no second envelope (AC-8). |
| Approve while next turn streams | `approveActionCard` does not gate on `chat.status` | Envelope queued as next user turn via `sendMessage` (same as create-card mid-stream) (E-10). |

Every path either produces a card state, a single round-tripped envelope, or both — never an unhandled throw and never a silent run.

---

## 10. Security

- **No new runnable surface.** CLE-05 runs **only** what CLE-03's `runRegisteredAction` runs: an `actionId` resolved against the live module registry to a handler a mounted page registered itself. The confirm card cannot run anything the run-now path could not; it only *delays* and *edits*. No `eval`, no dynamic import, no DOM-by-vision (the README doctrine §3 rejected path is not introduced).
- **Client re-validation before run (the security-relevant gate).** Edited params are re-validated against the action's **live Zod schema** inside `runRegisteredAction` (CLE-03 §2.3 `safeParse`) **before** `run` — independent of CLE-04's server-side JSON-Schema check. A user (or a buggy edit) cannot push a malformed/oversized/typed-wrong param into a handler: `safeParse` rejects it and `run` never fires (AC-5). The card's `buildConfirmFields`/`collectEditedParams` is deliberately *permissive* (it may produce an object that fails validation); the authoritative rejection is the downstream live-Zod gate — defense in depth, not the card.
- **`requireConfirm` is server-authoritative.** The client never lowers the confirmation bar: a `true` always gates (E-8), and there is no client toggle that can turn a confirm into a silent run (the dead "Auto-run" selector is removed precisely so no such client lever exists, §6). The only way an action runs without a card is the server returning `requireConfirm:false` (i.e. `decideAction` → `execute`).
- **Cancelled is explicit, not silent.** Dismiss round-trips an explicit `error:"cancelled"` envelope (AC-3) so the model cannot mistake a user decline for an unexecuted-but-pending action and silently retry — closing a "ghost action" gap.
- **No new tenant/secret surface.** The card reads only the client manifest (descriptors: ids/titles/JSON Schemas/policy scalars) and the directive (ids/params). No DB, no tenant rows, no secrets. Tenant isolation unaffected.
- **Defensive rendering.** A missing manifest entry, an unregistered action, or a malformed complex-field edit all degrade to a safe card state (§9); none throw or run.

---

## 11. Test strategy

Pure helpers (`buildConfirmFields`, `collectEditedParams`, `riskBadgesFor`, the executor branch) are unit-tested with **vitest**; the controller + card lifecycle and the full confirm→approve/dismiss round-trip use **@testing-library/react** (already in the repo, the pattern CLE-03's `*.integration.test.tsx` uses). No live server, no Playwright (CLE-05 ships no real page — it drives CLE-03's `debug.ping` forced to `requireConfirm:true`, plus fixtures).

- **`use-ui-directives.confirm.test.ts(x)`** — the executor branch: `requireConfirm:true` → `enqueueConfirm` called, `runRegisteredAction` spy **NOT** called, `sendActionResult` spy **NOT** called (AC-1, the headline test). `requireConfirm:false` → run-now, envelope sent, `enqueueConfirm` **NOT** called (AC-4, the CLE-03 regression). 
- **`action-confirm-controller.test.tsx`** — `useActionConfirmCards`: enqueue is idempotent per `invocationId` (E-5); **approve runs edited params** — seed a directive with `params:{stage:"Negotiation"}`, approve with `{stage:"Won"}`, assert `runRegisteredAction` got `{stage:"Won"}` (AC-2, the second required named test); approve round-trips an `ok:true` envelope with matching `invocationId` (AC-2); dismiss round-trips `{ok:false,error:"cancelled"}` and never calls `runRegisteredAction` (AC-3); double-approve → exactly one `runRegisteredAction` call + one envelope (AC-8/E-4); run-fails → `failed` state, Retry re-runs same params, exactly two runs, final `ok:true` envelope (E-3); unregistered at approve → `action_not_registered` envelope (E-6).
- **`action-confirm-fields.test.ts`** — `buildConfirmFields` on `z.toJSONSchema(z.object({ stage: z.enum(["A","B"]), value: z.number().optional(), notify: z.boolean(), tags: z.array(z.string()), meta: z.object({x:z.number()}) }))`: assert `stage`→enum with options `[A,B]`; `value`→number not required; `notify`→boolean; `tags`→complex (read-only + raw); `meta`→complex; scalars pre-filled from params. `collectEditedParams`: scalars coerce by kind; a `complex` field with valid JSON parses back; a malformed JSON throws the typed field error (E-1). Very-large string → field flagged for textarea (E-2).
- **`action-confirm-badges.test.ts`** — `riskBadgesFor`: `outbound:true`→"Sends externally"; `cost:"money"`→"Costs money"; `cost:"credits"`→"Uses credits"; `mutating:true,reversible:false`→"Permanent"; `mutating:true,reversible:true,cost:"free"`→single "Updates a record" neutral; read-only → `[]`. Assert no emoji in any label (regex over the label strings).
- **`action-confirm-card.test.tsx`** — renders title/description/badges/fields from a fixture manifest entry (AC-7); edit a scalar then Approve → `onApprove` receives the edited object (AC-9); malformed complex JSON edit blocks Approve with an inline error and does not call `onApprove` (E-1); `running` disables Approve + shows spinner (AC-8); `failed` shows Retry (E-3); unregistered/absent entry → unavailable state with Dismiss-only, Approve hidden (E-6/AC-7); `requireConfirm:true` read-only action → no badge but card still gates (E-8).
- **Selector-removal guard** — assert `action-card.tsx` no longer contains the `<select>`/`defaultValue="ask"` block (AC-10); and `ActionCard` still approves/dismisses (create-card not regressed).
- **Consolidation guard** — assert `app/(dashboard)/chat/page.tsx` imports the shared confirm controller/renderer and contains **no** inline page-action approve handler; if the optional create-card consolidation task is taken, assert the inline create block is gone and `<MessageActionCards>` is used (AC-11). 
- **Regression** — the existing create/update + campaign cards and "Create all N" batch still render/approve (`chat-action-cards.tsx` + `action-card.tsx` behaviour preserved); `navigate`/`composeEmail` directives unchanged; `pnpm tsc --noEmit` 0 errors; `regression.sh` green; CLE-03/CLE-04 tests untouched and green.

Coverage target: 100% of the new branches in the executor `invokeAction` arm, the confirm controller (every status transition + guard), `buildConfirmFields`/`collectEditedParams`, and `riskBadgesFor`. No new runtime dependency (schema editing uses the manifest JSON Schema already on the wire; no `ajv`, no form library).
