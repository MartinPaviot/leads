# CLE-03 — `invokeAction` directive + Page Action Registry (PAR core) — Design

> Implements README §3.1, §3.2, §3.3, §3.5. Every type below matches the constitution **verbatim** (field names, optionality, ordering). Where I add anything, it is internal and clearly marked "internal — not in the §3 contract".

---

## 1. System fit (where each piece lands, with file:line)

The chat already has a clean, narrow command layer. CLE-03 widens it by **one** directive kind and adds a typed client registry the globally-mounted dock can read. Nothing in the two existing directive kinds changes.

| Concern | Today | After CLE-03 |
|---|---|---|
| Directive SSOT (pure, no React/server) | `lib/chat/ui-directives.ts:32-36` — 2-kind union; builders `navigateDirective` (`:43`), `composeEmailDirective` (`:48`); parser `parseUiDirective` (`:84-113`); guard `isSafeInternalPath` (`:70-77`); key `UI_DIRECTIVE_KEY` (`:20`). | + `invokeAction` kind in the union; + `invokeActionDirective(...)` builder; + an `invokeAction` branch in `parseUiDirective`. Same defensive posture (returns `null`, never throws). |
| Single client executor | `components/chat/use-ui-directives.ts:23-29` — `runUiDirective` 2-branch switch; `useUiDirectives` (`:41-60`) once-only, replay-safe, keyed `${last.id}:${idx}` (`:52`). | + an `invokeAction` branch in `runUiDirective` that looks up the registry, runs the action, and re-injects the result envelope via a new `sendActionResult` ctx fn. |
| Page Action Registry | does not exist (`lib/chat/page-actions/` absent). | **NEW** `lib/chat/page-actions/types.ts` (§3.2 types) + `lib/chat/page-actions/registry.ts` (§3.3 API: `useRegisterPageActions`, `getActionManifest`, `runRegisteredAction`). Module-level store + a React hook. |
| Transport body (manifest on the wire) | `components/chat/chat-dock.tsx:102-122` — `DefaultChatTransport` with `body: () =>` reading `surfaceRef.current` (`:110-119`); posts `contextType`/`contextId`/`threadId`. | + a `manifestRef` mirrored like `surfaceRef`; `body: () =>` also includes `pageActions: getActionManifest()` when non-empty. |
| Result round-trip | `components/chat/chat-action-cards.tsx:79-97` — approve → REST POST → `chat.sendMessage({ text: "[Approved: …]" })`. | The PAR result reuses the **same** `chat.sendMessage` re-injection, but with the frozen `[[action-result]]{json}[[/action-result]]` envelope (README §3.5 v1). |
| `/chat` full page | `app/(dashboard)/chat/page.tsx:46-51` — `DefaultChatTransport` with **no** `body` fn; dock hidden here (`deriveSurface` → `hidden:true`, `surface-from-path.ts:105-107`). | Unchanged. Sends no manifest → AC-7 off-web/no-manifest case is satisfied for free. |
| Tool-part parsing the executor depends on | `components/tool-call-panel.tsx:478-514` — `parseUiToolParts` reads `output` into `result` for settled parts. | Unchanged. The `invokeAction` directive rides on a tool result exactly like the existing kinds. |

The server tools that **emit** `invokeActionDirective(...)` (`invokePageAction`) and the server-side **read** of `pageActions` from the body are **CLE-04**. CLE-03 stops at: the builder exists, the parser accepts it, the dock puts the manifest on the wire, and the client can dispatch + round-trip.

---

## 2. Exact TypeScript (contract-verbatim)

### 2.1 `lib/chat/ui-directives.ts` — extend the union, add a builder, extend the parser

Add to the union (README §3.1 verbatim; the two existing arms are untouched):

```ts
export type UiDirective =
  /** Navigate the SPA to an internal path (same-origin only). */
  | { kind: "navigate"; path: string; label?: string }
  /** Open the email composer pre-filled with a draft (does not send). */
  | { kind: "composeEmail"; draft: ComposeEmailDraft }
  /** Run a registered Page Action on the live page (CLE-03). */
  | {
      kind: "invokeAction";
      invocationId: string; // uuid — correlates request ↔ result
      actionId: string;     // e.g. "opportunities.moveStage"
      params: Record<string, unknown>;
      requireConfirm: boolean; // computed server-side via decideAction (§3.5 / CLE-10)
    };
```

Builder (mirrors `navigateDirective`/`composeEmailDirective` shape — spreads under `UI_DIRECTIVE_KEY`). The server caller (CLE-04) generates the `invocationId` with `crypto.randomUUID()` (a global, used elsewhere e.g. `tools/create.ts:769`); the builder accepts it so the id is decided once at the emit site and threaded through to the result:

```ts
/** `{ _uiDirective: { kind: "invokeAction", ... } }` — spread into a tool result. */
export function invokeActionDirective(
  invocationId: string,
  actionId: string,
  params: Record<string, unknown>,
  requireConfirm: boolean,
) {
  return {
    [UI_DIRECTIVE_KEY]: { kind: "invokeAction", invocationId, actionId, params, requireConfirm },
  } as const;
}
```

Parser branch (added inside `parseUiDirective`, before the final `return null`). Same defensiveness as the existing arms — validate every field, return `null` on any miss, never throw. Reuses the existing `isRecord` (`:56`) and `asNonEmptyString` (`:60`) helpers:

```ts
if (raw.kind === "invokeAction") {
  const invocationId = asNonEmptyString(raw.invocationId);
  const actionId = asNonEmptyString(raw.actionId);
  if (!invocationId || !actionId) return null;
  if (!isRecord(raw.params)) return null;          // params must be a plain object
  if (typeof raw.requireConfirm !== "boolean") return null;
  return {
    kind: "invokeAction",
    invocationId,
    actionId,
    params: raw.params as Record<string, unknown>,
    requireConfirm: raw.requireConfirm,
  };
}
```

> Note on safety posture: unlike `navigate` there is no path to sanitize, but the analogous guarantee is the **registry gate** — the only `actionId`s that can ever run are those a mounted page registered (see §6). The parser stays purely structural and defensive.

### 2.2 `lib/chat/page-actions/types.ts` — `PageAction`, `PageActionResult`, manifest entry (README §3.2 + §3.3 verbatim)

```ts
import type { z } from "zod";

export interface PageAction<P = unknown> {
  id: string;                         // namespaced by page: "<surface>.<verb>"
  title: string;                      // human label (FR/EN per UI locale)
  description: string;                // for the LLM — when/why to use it
  params: z.ZodType<P>;               // validated CLIENT-side (run) AND SERVER-side (manifest)
  run: (params: P) => Promise<PageActionResult>; // reuses the page's EXISTING handler
  mutating: boolean;                  // does it change persistent state?
  outbound?: boolean;                 // triggers an external send (mail, call, invite)?
  reversible?: boolean;               // is a programmatic undo possible?
  cost?: "free" | "credits" | "money";
  confirm: "never" | "risky" | "always"; // default confirmation policy (cf. §3.5)
  surfaces?: string[];                // optional: restrict to certain surfaces
}

export interface PageActionResult {
  ok: boolean;
  summary: string;                    // 1 sentence, re-injected to the LLM
  data?: unknown;                     // optional structured payload
  error?: string;
  undo?: (() => Promise<void>) | UndoDescriptor;  // if reversible — README §3.2 as amended by §3.8 (CLE-11)
}
// UndoDescriptor (README §3.2 / §3.8, ratified for CLE-11):
//   | { kind: "reinvoke"; actionId: string; params: Record<string, unknown> }
//   | { kind: "server"; snapshot: unknown }
// CLE-03 ships this full union in types.ts so CLE-11 is a pure consumer (additive;
// the CLE-03 smoke action sets no undo, so this is type surface only).

// README §3.3 — manifest entry: serialized PageAction WITHOUT the fns.
export interface PageActionManifestEntry {
  id: string; title: string; description: string;
  paramsJsonSchema: object;           // zod → JSON Schema (deterministic)
  mutating: boolean; outbound: boolean; reversible: boolean;
  cost: "free" | "credits" | "money"; confirm: "never" | "risky" | "always";
}
export type PageActionManifest = PageActionManifestEntry[];
```

> Optionality is normalized in the manifest: the contract's `PageActionManifestEntry` makes `outbound`/`reversible`/`cost` **required**, while `PageAction` leaves them optional. The serializer (§4) fills defaults: `outbound ?? false`, `reversible ?? false`, `cost ?? "free"`. This matches README §3.3 (manifest entry has them non-optional) without changing `PageAction` (§3.2, where they are optional).

### 2.3 `lib/chat/page-actions/registry.ts` — the registry API (README §3.3 verbatim signatures)

Internal store (module-level `Map`, keyed by id; not part of the §3 contract):

```ts
"use client";
import { useEffect } from "react";
import { z } from "zod";
import type { PageAction, PageActionManifest, PageActionManifestEntry, PageActionResult } from "./types";

/** Soft size budget for the serialized manifest (internal guard-rail, not a §3 contract). */
const MANIFEST_BYTE_BUDGET = 16 * 1024;

/** Internal registration record: the action + the owner token that registered it (for collision warnings). */
interface Registration { action: PageAction; owner: symbol; }

/** Module-level store. The dock (globally mounted) reads it; pages mutate it on mount/unmount. */
const store = new Map<string, Registration>();

/** Cache: a Zod schema serialized to JSON Schema once (determinism + perf). */
const schemaCache = new WeakMap<z.ZodType, object>();

function toJsonSchema(schema: z.ZodType): object {
  const cached = schemaCache.get(schema);
  if (cached) return cached;
  // Zod 4 native serializer — deterministic, JSON-Schema draft 2020-12. No extra dependency.
  const json = z.toJSONSchema(schema) as object;
  schemaCache.set(schema, json);
  return json;
}

function toManifestEntry(a: PageAction): PageActionManifestEntry {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    paramsJsonSchema: toJsonSchema(a.params),
    mutating: a.mutating,
    outbound: a.outbound ?? false,
    reversible: a.reversible ?? false,
    cost: a.cost ?? "free",
    confirm: a.confirm,
  };
}
```

The three contract functions (signatures verbatim from §3.3):

```ts
/** Hook posted by each page; registers on mount, clears on unmount. */
export function useRegisterPageActions(actions: PageAction[]): void {
  useEffect(() => {
    const owner = Symbol("page-action-owner");
    for (const a of actions) {
      const existing = store.get(a.id);
      if (existing && existing.owner !== owner) {
        // E-2: collision between distinct owners — last-writer-wins, but warn in dev.
        console.warn(`[page-actions] action id collision: "${a.id}" re-registered by a different owner`);
      }
      store.set(a.id, { action: a, owner }); // E-1: idempotent per id (Map replace, no dup)
    }
    return () => {
      // Unmount cleanup: only remove ids THIS effect owns, so an interleaved
      // remount (HMR / route swap) that already re-registered an id is not clobbered.
      for (const a of actions) {
        const cur = store.get(a.id);
        if (cur && cur.owner === owner) store.delete(a.id);
      }
    };
    // Re-run only when the set of action ids changes — a stable page passes a
    // stable list; we key on ids to avoid re-registering on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions.map((a) => a.id).join("|")]);
}

/** Read by the ChatDock at send time (like surfaceRef). Serializable, no fns. */
export function getActionManifest(): PageActionManifest {
  const manifest = Array.from(store.values()).map((r) => toManifestEntry(r.action));
  // E-4: soft size budget — warn (do not truncate) so an over-declaring page is caught.
  const bytes = JSON.stringify(manifest).length;
  if (bytes > MANIFEST_BYTE_BUDGET) {
    console.warn(`[page-actions] manifest is ${bytes} bytes (budget ${MANIFEST_BYTE_BUDGET}); trim action descriptions/schemas.`);
  }
  return manifest;
}

/** Validate params client-side against the registered schema, then run. Never throws. */
export async function runRegisteredAction(actionId: string, params: unknown): Promise<PageActionResult> {
  const reg = store.get(actionId);
  if (!reg) {
    // AC-3: unregistered id → graceful error result.
    return { ok: false, summary: `No action "${actionId}" is available on this page.`, error: "action_not_registered" };
  }
  const parsed = reg.action.params.safeParse(params);
  if (!parsed.success) {
    // AC-4: bad params → error result BEFORE run; run is never called.
    const issue = parsed.error.issues[0];
    const where = issue?.path?.join(".") || "params";
    return {
      ok: false,
      summary: `Invalid parameters for "${actionId}": ${issue?.message ?? "validation failed"}${where ? ` (${where})` : ""}.`,
      error: "invalid_params",
    };
  }
  try {
    return await reg.action.run(parsed.data);
  } catch (err) {
    // E-7: run threw → convert to an error result; no unhandled rejection.
    return {
      ok: false,
      summary: `Action "${actionId}" failed to run.`,
      error: err instanceof Error ? err.message : "run_threw",
    };
  }
}
```

> Internal-only (not in §3): the `Registration.owner` symbol, the `schemaCache`, `MANIFEST_BYTE_BUDGET`, and the three error string codes. The contract surface is exactly the three exported functions and the three types.

### 2.4 `components/chat/use-ui-directives.ts` — the dispatch branch + result envelope

The frozen envelope tags + (de)serializer (these strings are the **contract** CLE-04's prompt reads). Co-located here because the executor is their only producer; CLE-04 imports the constants for the prompt addendum:

```ts
import { runRegisteredAction } from "@/lib/chat/page-actions/registry";
import type { PageActionResult } from "@/lib/chat/page-actions/types";

/** Frozen transport tags for the v1 result round-trip (README §3.5). */
export const ACTION_RESULT_OPEN = "[[action-result]]";
export const ACTION_RESULT_CLOSE = "[[/action-result]]";

/** The frozen envelope (README §3.5). Only these keys cross back to the model. */
export interface ActionResultEnvelope {
  invocationId: string;
  ok: boolean;
  summary: string;
  data?: unknown;
  error?: string;
}

/** Serialize a result into the tagged transport string the model is taught to read. */
export function encodeActionResult(invocationId: string, r: PageActionResult): string {
  const env: ActionResultEnvelope = {
    invocationId, ok: r.ok, summary: r.summary,
    ...(r.data !== undefined ? { data: r.data } : {}),
    ...(r.error ? { error: r.error } : {}),
  };
  return `${ACTION_RESULT_OPEN}${JSON.stringify(env)}${ACTION_RESULT_CLOSE}`;
}
```

Extend the executor ctx + `runUiDirective`. `runUiDirective` becomes async for the `invokeAction` arm (the existing arms stay synchronous side-effects; the function returns a promise the caller may ignore — `useUiDirectives` does not await navigation today, and need not await the action either since the round-trip is fire-and-forget via `sendActionResult`):

```ts
export function runUiDirective(
  d: UiDirective,
  ctx: {
    navigate: (path: string) => void;
    openComposer: (draft: ComposeEmailDraft) => void;
    sendActionResult: (text: string) => void; // re-inject the tagged envelope (chat.sendMessage)
  },
): void {
  if (d.kind === "navigate") ctx.navigate(d.path);
  else if (d.kind === "composeEmail") ctx.openComposer(d.draft);
  else if (d.kind === "invokeAction") {
    // CLE-03: run the registered action, then round-trip the result envelope.
    // CLE-05 will branch on d.requireConfirm to render a confirm card first;
    // in CLE-03 the smoke action is confirm:"never", so we run directly.
    void runRegisteredAction(d.actionId, d.params).then((result) => {
      ctx.sendActionResult(encodeActionResult(d.invocationId, result));
    });
  }
}
```

`useUiDirectives` is unchanged in structure (still once-only, keyed `${last.id}:${idx}`); it just forwards the richer ctx. Because `runUiDirective` is fire-and-forget for the action arm, an unmount of the *page* does not cancel the in-flight `run` (E-3): the dock owns the promise.

### 2.5 `components/chat/chat-dock.tsx` — put the manifest on the wire

Mirror the `surfaceRef` pattern. Add a `manifestRef` so the stable transport closure reads the live manifest at send time, and extend the `body: () =>` fn:

```ts
import { getActionManifest } from "@/lib/chat/page-actions/registry";
// ...
// Live manifest for the transport body (the dock outlives any route; read at send time).
const manifestRef = useRef(getActionManifest());
useEffect(() => { manifestRef.current = getActionManifest(); }); // refresh each render (cheap; reflects mount/unmount)
```

In the transport `body: () =>` (extends `chat-dock.tsx:110-119`):

```ts
body: () => {
  const s = surfaceRef.current;
  const payload: Record<string, unknown> = {};
  if (s.contextType) { payload.contextType = s.contextType; payload.contextId = s.contextId; }
  if (threadIdRef.current) payload.threadId = threadIdRef.current;
  const manifest = manifestRef.current;
  if (manifest.length > 0) payload.pageActions = manifest; // CLE-03: page actions of the current page
  return payload;
},
```

And wire `sendActionResult` into the existing `onDirective` callback (extends `chat-dock.tsx:129-137`):

```ts
const onDirective = useCallback(
  (d: UiDirective) =>
    runUiDirective(d, {
      navigate: (p) => router.push(p),
      openComposer: (draft) => setEmailComposer(draft),
      sendActionResult: (text) => chat.sendMessage({ text }), // round-trip the envelope
    }),
  [router, chat],
);
```

> The `/chat` page (`chat/page.tsx`) also calls `runUiDirective`; it gets a `sendActionResult: (text) => chat.sendMessage({ text })` ctx too (one-line addition), so the type is satisfied. But its transport has **no** `body` fn → it sends no manifest (AC-7), and it has no mounted dock-style page actions, so in practice it dispatches none. Adding `sendActionResult` there keeps the shared executor's signature uniform.

---

## 3. Directive flow diagram (server emits → client dispatch → result envelope → model)

```
                         ┌─────────────────────────── SERVER (CLE-04, out of scope here) ───────────────────────────┐
  user message ─────────▶│ POST /api/chat                                                                            │
  + body.pageActions ───▶│   route.ts reads body.contextType/contextId (route.ts:401-418) + (CLE-04) body.pageActions│
  (CLE-03 plumbing) │    │   model calls invokePageAction(actionId, params)                                          │
                    │    │     → decideAction (CLE-10 stub) → requireConfirm                                          │
                    │    │     → returns { ...invokeActionDirective(crypto.randomUUID(), actionId, params, confirm) } │
                    │    └──────────────────────────────────────────┬──────────────────────────────────────────────┘
                    │                                                │ tool result carries _uiDirective
                    │                                                ▼
                    │             ┌──────────────────────────── CLIENT (CLE-03) ───────────────────────────┐
                    │             │ parseUiToolParts(message.parts)          (tool-call-panel.tsx:478)      │
                    │             │   → call.result  ──▶ parseUiDirective    (ui-directives.ts:84 + new arm)│
                    │             │      → { kind:"invokeAction", invocationId, actionId, params, confirm } │
                    │             │ useUiDirectives (once-only, keyed id:idx)  (use-ui-directives.ts:41-60) │
                    │             │   → runUiDirective(d, ctx)               (use-ui-directives.ts:23, arm)  │
                    │             │        → runRegisteredAction(actionId,params)   (registry.ts)           │
                    │             │             • not registered  → { ok:false, error:"action_not_registered" }
                    │             │             • bad params       → { ok:false, error:"invalid_params" }    │
                    │             │             • run throws        → { ok:false, error:<msg> }               │
                    │             │             • ok                → action.run(params) on the LIVE page     │
                    │             │        → encodeActionResult(invocationId, result)                        │
                    │             │        → ctx.sendActionResult("[[action-result]]{...}[[/action-result]]")│
                    │             └───────────────────────────────────┬──────────────────────────────────────┘
                    │                                                 │ chat.sendMessage({ text })
                    └─────────────────────────────────────────────────┘  (same path as approve-card, chat-action-cards.tsx:93)
                                                                      ▼
                                              next POST /api/chat carries the tagged envelope as a user turn
                                              → model (taught by CLE-04 prompt) reads invocationId+ok+summary → chains
```

Registration side-channel (independent of the request loop):

```
  page mounts → useRegisterPageActions([...])  → store.set(id, {action, owner})
  ChatDock render → manifestRef.current = getActionManifest()  (reads store, serializes via z.toJSONSchema)
  page unmounts → effect cleanup → store.delete(id) for ids this owner holds
```

---

## 4. Manifest serialization + JSON-Schema choice

**Choice: Zod 4's native `z.toJSONSchema(schema)`.** Justification:
- **Zero new dependency.** `zod@^4.4.3` is already a direct dependency (`apps/web/package.json`). Verified at design time: `z.toJSONSchema(z.object({ a: z.string(), b: z.number().optional() }))` returns `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"a":{"type":"string"},"b":{"type":"number"}},"required":["a"],"additionalProperties":false}`. Adding `zod-to-json-schema` would duplicate a capability Zod 4 ships natively (Layer 1 doctrine: don't reinvent / don't add redundant deps).
- **Determinism.** `z.toJSONSchema` is a pure function of the schema; same schema instance → identical output. We memoize per-schema in a `WeakMap` (`schemaCache`) so repeated `getActionManifest()` calls are both deterministic *and* cheap. This satisfies AC-1's byte-identical requirement.
- **Why not the AI SDK's internal serializer?** AI SDK v6 serializes Zod for its *own* tool definitions internally, but does not expose a stable public `toJsonSchema(zodSchema)` we should depend on for our manifest. Coupling our manifest format to an SDK-internal is fragile across SDK bumps; Zod's own exporter is the stable, owned seam.
- **Failure handling in serialization:** `z.toJSONSchema` can throw on schema constructs it cannot represent (e.g. transforms, certain refinements). For CLE-03 the smoke action uses a plain `z.object`, which is fully representable. For robustness, `toJsonSchema` is *not* wrapped in try/catch in CLE-03 (a non-serializable schema is a *page-author bug* that should surface loudly at the registering page during dev, not be silently swallowed into the manifest). CLE-06+ pages must use serializable `z.object` param schemas; this is documented as a registration constraint. (If a future page genuinely needs a non-representable schema, that is a `spec-issues.md` against this contract, not a silent fallback.)

**The manifest is fns-stripped by construction:** `toManifestEntry` reads only the contract scalar fields + the serialized schema; `run`, the raw Zod object, and `surfaces` never enter a manifest entry. `JSON.stringify(manifest)` therefore never sees a function (AC-1).

---

## 5. Transport decision (the §3.5 code-level call) — rationale

README §3.5 imposes **v1 = tagged message via the existing card mechanism (`chat.sendMessage`)** as the default and notes **v2 = AI SDK v6 `addToolResult`** as a future evolution, delegating the code decision to CLE-03.

**Decision: implement v1.** Three grounded reasons:

1. **v6 client-tool round-trip is unproven in this repo, and a poor fit for our emit model.** A codebase grep for `addToolResult` / `onToolCall` / `toolCallId` returns **zero** hits in `apps/web/src` (audit §1.2 independently confirms "zéro `addToolResult`/`onToolCall`/`onData`"). More importantly, our action is emitted as a **server tool result that carries a directive** (`invokePageAction` returns `{ ...invokeActionDirective(...) }`), *not* as an AI-SDK client-side `tool` with a `toolCallId` the client is expected to resolve. `addToolResult` is designed for the latter (the model calls a tool the *client* owns; the client resolves it by `toolCallId`). Re-architecting the emission into a client-tool to use `addToolResult` is a larger change that would also touch CLE-04's tool design — out of scope and risk-additive for the keystone.

2. **The `sendMessage` re-injection is already proven end to end.** `chat-action-cards.tsx:93-97` re-injects a synthetic `[Approved: …]` user turn after an approve, and the model reliably reads it and chains. CLE-03 reuses that exact path with a stricter, machine-parseable envelope. Highest completeness for least new surface.

3. **README compliance.** §3.5: "Transport v1 (défaut imposé)" and "en cas de blocage v6, le défaut v1 s'applique." v6 is at minimum *unproven here* and architecturally mismatched to directive-emission, so v1 is the contract-faithful choice.

**Frozen format (the contract dependents bind to):** one user-role message whose `text` is exactly
`[[action-result]]` + `JSON.stringify({ invocationId, ok, summary, data?, error? })` + `[[/action-result]]`.
Exported as `ACTION_RESULT_OPEN` / `ACTION_RESULT_CLOSE` / `encodeActionResult` / `ActionResultEnvelope` from `use-ui-directives.ts` so CLE-04 imports them for the system-prompt addendum (the prompt is taught to recognize the tags, extract the JSON, and treat `summary`/`ok`/`error` as the action outcome correlated by `invocationId`). **v2 (`addToolResult`) is recorded as a future evolution and not implemented.**

**README-contract tension:** none — this is the README's imposed default. No `spec-issues.md` opened.

---

## 6. Failure handling (every branch returns a result, nothing throws)

| Failure | Where caught | Outcome |
|---|---|---|
| Malformed `invokeAction` directive (bad/missing field) | `parseUiDirective` new arm (§2.1) | returns `null` → executor ignores it (parity with malformed `navigate`/`composeEmail`). No throw. |
| Unregistered `actionId` (never registered, or page unmounted) | `runRegisteredAction` (§2.3) | `{ ok:false, error:"action_not_registered" }` → envelope round-trips so the model can fall back to a headless tool (AC-3). |
| Params fail Zod | `runRegisteredAction` via `safeParse` | `{ ok:false, error:"invalid_params" }`, `run` **not** called (AC-4). |
| `run` throws | `runRegisteredAction` try/catch | `{ ok:false, error:<message> }`, no unhandled rejection (E-7). |
| Page unmounts mid-`run` | dock owns the fire-and-forget promise (§2.4) | promise settles, result still round-trips; subsequent invoke of that id → unregistered error (E-3). |
| Id collision between owners | `useRegisterPageActions` (§2.3) | last-writer-wins + `console.warn` (E-2); manifest has the id once. |
| HMR / StrictMode double-register | `Map` keyed by id (§2.3) | idempotent; manifest length 1 per id (E-1). |
| Oversized manifest | `getActionManifest` budget check | `console.warn` with byte size; not truncated (E-4). |
| Schema not JSON-Schema-representable | `z.toJSONSchema` (intentionally unguarded) | throws at the registering page in dev — a page-author bug surfaced loudly, not swallowed (§4). |
| Off-web / `/chat` page (no manifest) | dock omits `pageActions`; `/chat` transport has no `body` | body simply lacks the field; no dock to dispatch; nothing throws (AC-7). |

---

## 7. Security

- **Only registered ids are runnable.** The directive's `actionId` is *not* a code reference — it is a key into the module-level `store`. `runRegisteredAction` resolves it to a handler **only** if a currently-mounted page registered it. An attacker-influenced model output naming an arbitrary `actionId` resolves to the unregistered-id error, never to code. There is no `eval`, no dynamic import, no DOM-by-vision — the audit's explicitly-rejected "computer-use" path (README doctrine §3) is not introduced.
- **Params are re-validated client-side at the run boundary**, against the page's own Zod schema, *independently* of any server-side validation CLE-04 does against the manifest's JSON Schema. Defense in depth: even if a malformed directive reaches the client, `safeParse` rejects it before `run`.
- **No privilege escalation via the directive.** A page can only register actions for handlers it already owns and that a human can already trigger on that page — the registry grants the agent the *same* surface a user has, no more (parity by construction, not new capability). Role/permission gating of *which* actions are offered is CLE-12; CLE-03's registry is the mechanism, not the policy.
- **Same-origin / no-redirect posture preserved.** The `invokeAction` arm adds no navigation; the existing `isSafeInternalPath` guard on `navigate` is untouched. The result round-trip is an in-app `chat.sendMessage`, not a network redirect.
- **Defensive parsing unchanged.** `parseUiDirective` still returns `null` (never throws) on any malformed input across all three kinds — a hostile or buggy tool result cannot crash the client.
- **No new secrets / tenant surface.** The registry is pure client state (no DB, no tenant data). Tenant isolation is unaffected (the manifest carries action *descriptors*, not tenant rows).

---

## 8. Test strategy

Pure logic (`ui-directives.ts`, `registry.ts`, the envelope codec) is unit-tested with **vitest**; the register/unmount lifecycle and the full round-trip use **@testing-library/react** (already used in the repo) to mount a component that calls `useRegisterPageActions`. No live server, no Playwright (CLE-03 ships no real page; the smoke action runs in-memory).

- **`ui-directives.test.ts`** — `invokeActionDirective` shape; `parseUiDirective` accepts a well-formed `invokeAction` and rejects each malformed variant (missing `invocationId`/`actionId`, non-object `params`, non-boolean `requireConfirm`) returning `null`; **regression**: `navigate` + `composeEmail` still parse unchanged.
- **`registry.test.ts`** — register → `getActionManifest()` deep-equal + byte-identical across two calls; no `run`/Zod object in entries; `paramsJsonSchema` equals the expected JSON Schema; defaults applied (`outbound:false`, `reversible:false`, `cost:"free"`); `runRegisteredAction` for unregistered id, bad params (run spy not called), and a throwing `run`; double-register idempotency (E-1); collision warn (E-2, assert `console.warn` called); oversized manifest warn (E-4).
- **`action-result-envelope.test.ts`** — `encodeActionResult` produces `^\[\[action-result\]\]\{.*\}\[\[/action-result\]\]$`; round-trips through `JSON.parse(text.slice(open.length, -close.length))` to the exact envelope; omits `data`/`error` when absent; preserves `invocationId`.
- **`use-ui-directives.integration.test.tsx`** — full happy-path round-trip (register `debug.ping` → dispatch a built directive through `runUiDirective` with a `sendActionResult` spy → assert action ran + envelope captured with matching `invocationId` + `ok:true` + `pong:`); unregistered-id round-trip (`ok:false`, `error:"action_not_registered"`, executor did not throw).
- **`registry-lifecycle.integration.test.tsx`** — mount a component using `useRegisterPageActions([debugPing])`; assert manifest has it; unmount; assert manifest no longer has it AND `runRegisteredAction("debug.ping", …)` returns the unregistered error (AC-6 / unmount-cleanup).
- **Type-contract guard** — a `tsx`/`ts` compile-time assertion file (or an inline `satisfies`) that the emitted `UiDirective` `invokeAction` arm and `PageAction`/`PageActionManifestEntry` structurally match README §3 (caught by `tsc`).
- **Smoke action fixture** — `debugPingAction` lives in a test fixture (e.g. `lib/chat/page-actions/__fixtures__/debug-ping.ts` or co-located in the test) so it ships no real page surface; it is the single action CLE-03 registers to prove the loop (AC-9).

Coverage target: 100% of the new branches in `ui-directives.ts` (new arm), `registry.ts` (all three fns + every error path), and the envelope codec. `tsc --noEmit` 0 errors. `regression.sh` green.
