# CLE-15 — Actuation visibility — Design

> Implements README §1 doctrine "sous les yeux de l'utilisateur" and §3.6 off-web degradation. Builds on the three keystone designs:
> - `_specs/CLE-03-action-directive-and-registry/design.md` — the `UiDirective` union (§2.1), the `runUiDirective` executor (§2.4), the registry module `lib/chat/page-actions/registry.ts` (§2.3), the result envelope codec (§2.4), the dock wiring (§2.5).
> - `_specs/CLE-04-page-action-tools/design.md` — `listPageActions`/`invokePageAction` and their **no-manifest** guards (§2.3), the `<page_actions>` prompt block (§2.9).
> - `_specs/CLE-05-action-confirmation-ux/design.md` — the confirm controller that round-trips results (§3).
>
> **Build-state note (anchoring honesty).** At spec time, CLE-03/04/05 are *designed but not yet coded*: `lib/chat/page-actions/registry.ts`, `lib/chat/tools/page-actions.ts`, and the `invokeAction` arm of `use-ui-directives.ts` **do not exist on disk yet** (verified: those paths are absent; `components/chat/use-ui-directives.ts:23-29` is still the 2-branch executor, `chat-dock.tsx:110-119` still posts only `contextType`/`contextId`/`threadId`, `lib/chat/ui-directives.ts:32-36` is still the 2-kind union). CLE-15 `depends_on: ["CLE-04"]`, so by the time CLE-15 is built those modules exist per their specs. Citations below are therefore split: **"design.md §x"** where the symbol is introduced by a dependency (the line where CLE-15 hooks in), and **"file:line"** where the code exists today (the surfaces CLE-15 extends that are already real). Anything internal is marked "internal — not in §3".

---

## 1. System fit (where each piece lands)

CLE-15 adds **one** module-level capability (a highlight registry, co-located with the action registry CLE-03 added), **one optional** directive field (`navigate.highlight`), **one** opt-in input on a small set of read tools, **one** CSS keyframe + reduced-motion fallback, and **prompt** strengthening. It introduces no new server endpoint, no DB, no new dependency.

| Concern | Today / after CLE-04 | After CLE-15 |
|---|---|---|
| Directive SSOT (pure) | `lib/chat/ui-directives.ts:32-36` — union; `navigateDirective` builder (`:43`); `parseUiDirective` (`:84`) with `isSafeInternalPath` (`:70`) and `asNonEmptyString` (`:60`). CLE-04 adds the `invokeAction` arm (CLE-03 design §2.1). | + an **optional** `highlight?: HighlightAnchor` on the `navigate` arm only; `navigateDirective(path, label?, highlight?)` gains a third optional arg; `parseUiDirective` gains a defensive `highlight` validator that drops a malformed value but keeps the `navigate` (E-11). **Additive, backward-compatible** (§3). |
| Client executor | `components/chat/use-ui-directives.ts:23-29` (2-branch; CLE-04→3-branch via CLE-03 design §2.4). `useUiDirectives` (`:41-60`) defers until settled (`:45`), once-only keyed `${last.id}:${idx}` (`:52`). | The `navigate` arm, after `ctx.navigate(path)`, schedules a **post-navigation highlight** when `d.highlight` is set (§5). The `invokeAction`/result path triggers a highlight when the result carries highlight ids (§6). New `ctx.highlight(anchor)` fn threaded through (§7). |
| Action registry module | (CLE-03) `lib/chat/page-actions/registry.ts` — `useRegisterPageActions`, `getActionManifest`, `runRegisteredAction` + module `store` (CLE-03 design §2.3). | **+ a sibling highlight registry in the same file**: `useRegisterEntityLocator(...)`, `highlightEntity(anchor)`, `locateEntity(entityId)`. One module so a page registers actions *and* a locator through one import (AC-13). A second module-level `Map` (locators), independent of the action `store`. |
| Result round-trip | (CLE-03) `encodeActionResult`/`ACTION_RESULT_*` (CLE-03 design §2.4); (CLE-05) the confirm controller calls `runRegisteredAction` then `sendActionResult` (CLE-05 design §3). | After a **successful** `runRegisteredAction`, the client reads `result.data.highlight` (optional) and calls `highlightEntity(...)` — in **both** the run-now arm (CLE-03 design §2.4) and the confirm-approve path (CLE-05 design §3). One read point factored into a helper (§6). |
| Dock wiring | `components/chat/chat-dock.tsx:129-137` — `onDirective` builds the executor ctx (`navigate`, `openComposer`; CLE-03 adds `sendActionResult`). `useUiDirectives(chat, onDirective)` (`:137`). | `onDirective` ctx gains `highlight: (a) => highlightEntity(a)`. The `/chat` page builds the same ctx (CLE-03 design §2.5 note) — it has no mounted locators, so highlights there are silent no-ops (AC-8), which is correct. |
| Server read tools that can narrate-actuate | `lib/chat/tools/navigation.ts:66-206` — `openRecord`/`openListView` already emit `navigate` on explicit "go there" intent (`:119`, `:144`). Other read tools (scoring/enrich/search summaries) return text only. | A **small, named set** of read tools gains an optional `reveal` input + emits `navigate(+highlight)` when set (§4.3). `openRecord`/`openListView` optionally gain a `highlight` on their existing `navigate` so landing on a record can pulse it (§4.4). Default behaviour unchanged (AC-3). |
| Off-web tools | (CLE-04) `lib/chat/tools/page-actions.ts` — `listPageActions` returns `{ actions: [], note }` when no manifest (CLE-04 design §2.3 `:210-218`); `invokePageAction` returns `{ error }` (`:263-270`). | **Unchanged in behaviour**; CLE-15 adds a focused regression that proves the no-manifest path end to end (AC-9/AC-11) and **strengthens the prompt** so the model *explains* it (§9). The note strings may be tightened to match the prompt wording. |
| System prompt | (CLE-04) `lib/prompts/chat-system-prompt.ts` `<command_layer>` (file `:179-191`) + the new `<page_actions>` block (CLE-04 design §2.9 `:512-525`). | + a **narrate-actuate** rule in `<command_layer>`/`<page_actions>` (when to attach a reveal directive vs answer in place — §4.1) and a **strengthened off-web** rule (explain cleanly, never fake — §9). No mode gating; always present. |
| Global CSS | `app/apps/web/src/app/globals.css` — keyframes (`:354`, `:395`, `:455`); **no global `prefers-reduced-motion` block exists** (verified — reduced-motion is handled per-component via framer-motion `useReducedMotion()`, e.g. `_components/accounts-demo.tsx:13,39`). | + one `@keyframes cle-highlight-pulse`, a `.cle-entity-highlight` class, a `.cle-entity-highlight--static` reduced-motion variant, and a scoped `@media (prefers-reduced-motion: reduce)` rule that swaps animated → static (§5.3). Self-contained; affects nothing else. |

CLE-15 stops at: the highlight registry + CSS exist and both paths call them; the `navigate` directive can carry an optional highlight; a named set of read tools can narrate-actuate behind an explicit `reveal` flag; the prompt teaches *when* to reveal and *how* to degrade off-web; a fixture locator proves the loop. **Wiring real pages is CLE-06..09/CLE-14.**

---

## 2. The highlight mechanism (registry hook + locator + CSS)

The decisive constraint, grounded in real DOM: the **same entity renders in different DOM nodes depending on view** — a deal is a table `<tr key={deal.id}>` (`opportunities/page.tsx:1231`) in table mode but a board `<div key={deal.id} draggable>` (`:1397`) in board mode; and **no `data-entity-id` attribute exists anywhere in the dashboard today** (verified — a global attribute scan returns nothing). A DOM-attribute scan (`document.querySelector('[data-entity-id=…]')`) would therefore be both *missing* and *ambiguous*. So the mechanism is a **registry of locators**: each page registers a function that, given an entity id, returns the *currently mounted* element for it (the page knows whether it is in board or table mode). This mirrors exactly how CLE-03's action registry already works (a page registers handlers; the dock looks them up) — one consistent pattern, reused (AC-13).

### 2.1 Types (internal — not in §3)

```ts
// lib/chat/page-actions/registry.ts (extends the CLE-03 module)

/** What a directive / result names so the client can find an element to pulse. */
export interface HighlightAnchor {
  entityId: string;            // the row/card/field key, e.g. a deal id (opportunities/page.tsx:1231 key)
  scope?: string;              // optional: a surface hint, e.g. "opportunities" — disambiguates if two pages register overlapping ids
  field?: string;              // optional: a sub-element key (e.g. "stage", "owner") for field-level pulse
  focus?: boolean;             // optional: page opts in to move focus (default false — AC-7 never steals focus)
}

/** A page-supplied function: resolve an entity id to its live element, or null. */
export type EntityLocator = (anchor: HighlightAnchor) => HTMLElement | null;
```

`HighlightAnchor` is the shape carried by the directive field (§3) and by `PageActionResult.data.highlight` (§6). It is intentionally minimal and all-optional-but-`entityId`.

### 2.2 The registry (sibling to the action store, same file)

```ts
/** Module-level locator store. Pages register on mount, clear on unmount. */
interface LocatorRegistration { locate: EntityLocator; owner: symbol; }
const locators = new Map<string, LocatorRegistration>(); // keyed by scope ("__default__" when none)

const DEFAULT_SCOPE = "__default__";

/** Hook: a page registers HOW to locate its entities. Mirrors useRegisterPageActions (CLE-03 §2.3). */
export function useRegisterEntityLocator(scope: string, locate: EntityLocator): void {
  useEffect(() => {
    const owner = Symbol("entity-locator-owner");
    locators.set(scope || DEFAULT_SCOPE, { locate, owner });
    return () => {
      const cur = locators.get(scope || DEFAULT_SCOPE);
      if (cur && cur.owner === owner) locators.delete(scope || DEFAULT_SCOPE); // E-6: only clear our own
    };
  }, [scope, locate]); // a page passes a stable `locate` (useCallback) — re-register only if it changes
}

/** Resolve an element for an anchor, trying the scoped locator then the default. Never throws. */
export function locateEntity(anchor: HighlightAnchor): HTMLElement | null {
  try {
    if (anchor.scope) {
      const scoped = locators.get(anchor.scope);
      const el = scoped?.locate(anchor) ?? null;
      if (el) return el;
    }
    const def = locators.get(DEFAULT_SCOPE);
    return def?.locate(anchor) ?? null; // E-2/E-3: no locator / not found → null
  } catch {
    return null; // a buggy page locator must never crash the highlight (AC-8)
  }
}
```

### 2.3 The fire path (`highlightEntity`) — non-blocking, self-clearing, reduced-motion-aware

```ts
const HIGHLIGHT_MS = 1600;                 // bounded window (AC-7)
const MAX_HIGHLIGHTS_PER_CALL = 25;        // E-5 cap — never strobe a 1000-row bulk

function prefersReducedMotion(): boolean {
  // SSR-safe; matchMedia absent in tests → treat as "no reduce" unless mocked.
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Pulse the element(s) for one or many anchors. Fire-and-forget; resolves harmlessly. */
export function highlightEntity(anchors: HighlightAnchor | HighlightAnchor[]): void {
  const list = (Array.isArray(anchors) ? anchors : [anchors]).slice(0, MAX_HIGHLIGHTS_PER_CALL); // E-5
  for (const anchor of list) {
    const el = locateEntity(anchor);
    if (!el) {                              // AC-8 / E-2 / E-3 / E-6 — silent no-op
      if (typeof console !== "undefined") console.debug?.("[highlight] no element for", anchor.entityId);
      continue;
    }
    applyPulse(el, anchor.focus === true);  // E-7 self-clears with an isConnected guard
  }
}

function applyPulse(el: HTMLElement, allowFocus: boolean): void {
  // 1. Bring into view if off-screen (E-1). block:"nearest" → no jarring jump, no focus steal (AC-7).
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  if (allowFocus && typeof el.focus === "function") el.focus({ preventScroll: true });

  // 2. Apply emphasis. Reduced-motion → static class (no transition); else animated pulse (AC-6/E-12).
  const cls = prefersReducedMotion() ? "cle-entity-highlight--static" : "cle-entity-highlight";
  el.classList.add(cls);

  // 3. Self-clear after the window, guarded so an unmounted node is left alone (E-7).
  window.setTimeout(() => {
    if (el.isConnected) el.classList.remove(cls); // node still there → restore exactly (no residue, AC-7)
    // detached → nothing to clean; the class went away with the node.
  }, HIGHLIGHT_MS);
}
```

> Why a class, not inline style: the class self-removes cleanly (no need to remember prior inline values); the reduced-motion variant is a different class so the JS picks one and the CSS owns the look. Why `block:"nearest"`: it scrolls the *minimum* needed (no scroll if already visible), so it never yanks the viewport for an on-screen element (AC-7).

### 2.4 Anchor strategy (how an id becomes an element) — the contract a registering page honours

A page (in CLE-06..09/CLE-14) registers a locator that maps an `entityId` to its live node. The **recommended** convention, which CLE-15 documents and the fixture demonstrates, is a `data-cle-entity` attribute the page sets on the row/card it already keys by id:

```tsx
// Example a real page (CLE-06) would adopt — NOT shipped by CLE-15:
<tr key={deal.id} data-cle-entity={deal.id} /* existing attrs */>…</tr>
// and register once:
const locate = useCallback<EntityLocator>(
  (a) => listRef.current?.querySelector<HTMLElement>(`[data-cle-entity="${cssEscape(a.entityId)}"]`) ?? null,
  [],
);
useRegisterEntityLocator("opportunities", locate);
```

This keeps the **lookup inside the page** (so board-vs-table, virtualization, and filtering are the page's concern — E-8/E-2) while the registry stays a thin id→element indirection. CLE-15 provides the `data-cle-entity` convention name + a `cssEscape` helper (internal) and the fixture; it does **not** add the attribute to real pages (that's CLE-14). The attribute is opt-in: a page with no locator simply yields silent no-ops.

> Alternative considered and rejected: a global `data-cle-entity` scan in `highlightEntity` with no registry. Rejected because (a) two pages could expose the same id ambiguously, (b) the same entity has two nodes across views (E-8), (c) it couples the mechanism to a DOM attribute the page might render differently (board card has no `<tr>`). The locator registry lets the page resolve *the right* node for *its current* state — strictly more correct, same call-site ergonomics.

---

## 3. The directive contract addition (`navigate.highlight`) — README §3.1 amendment

### 3.1 The change (additive, optional, backward-compatible)

```ts
// lib/chat/ui-directives.ts — the navigate arm only; composeEmail + invokeAction untouched.
export type UiDirective =
  | { kind: "navigate"; path: string; label?: string; highlight?: HighlightAnchor } // + highlight? (CLE-15)
  | { kind: "composeEmail"; draft: ComposeEmailDraft }
  | { kind: "invokeAction"; invocationId: string; actionId: string; params: Record<string, unknown>; requireConfirm: boolean };
```

`HighlightAnchor` is re-exported from `ui-directives.ts` as a pure type (the registry's runtime lives in the `"use client"` module; the *type* is pure and may live in or be re-exported from the pure SSOT so the server builder and the client parser share it without a client-import). Builder + parser:

```ts
export function navigateDirective(path: string, label?: string, highlight?: HighlightAnchor) {
  return {
    [UI_DIRECTIVE_KEY]: {
      kind: "navigate", path,
      ...(label ? { label } : {}),
      ...(highlight && asNonEmptyString(highlight.entityId) ? { highlight: normalizeAnchor(highlight) } : {}),
    },
  } as const;
}

// inside parseUiDirective, the navigate arm (ui-directives.ts:89-93) gains:
if (raw.kind === "navigate") {
  if (!isSafeInternalPath(raw.path)) return null;          // unchanged guard
  const label = asNonEmptyString(raw.label);
  const highlight = parseHighlightAnchor(raw.highlight);   // E-11: returns a clean anchor or undefined; never throws
  return { kind: "navigate", path: raw.path, ...(label ? { label } : {}), ...(highlight ? { highlight } : {}) };
}
```

`parseHighlightAnchor` (pure, defensive — mirrors the existing field-by-field validation): requires a non-empty string `entityId`; accepts optional string `scope`/`field`; accepts boolean `focus`; **drops the whole `highlight`** (returns `undefined`) if `entityId` is missing/empty, but **never** invalidates the `navigate` (E-11). `normalizeAnchor` strips unknown keys.

### 3.2 Why this is the minimal contract touch (and the flag)

- **Reuses the existing, proven `navigate` directive** rather than inventing a new `kind`. The narrate-actuate path *is* a navigation that also says "and pulse this when you land" — semantically a navigate with a target, not a new command. Adding a `kind: "highlight"` would create a second post-navigation-ordering problem (you'd need a navigate *then* a highlight directive correlated) for no benefit; one enriched navigate is atomic and ordered-by-construction.
- **The PAR result path does not need a directive at all** — it carries highlight ids in the existing `PageActionResult.data` (§6), which is already free-form `data?: unknown` (CLE-03 §3.2). So the *only* contract surface that changes is this one optional field.
- **Backward-compatible:** absent `highlight` ⇒ today's exact behaviour; an off-web client that honours `navigate` but not highlight ignores the field (E-10); a malformed field is dropped (E-11). No existing test changes meaning.

**README §3.1 amendment required — flagged.** README §3.1 freezes the directive union and says "On ajoute un kind. On NE touche pas aux deux existants" — CLE-15 does **not** add a kind, but it **does** add an optional field to the existing `navigate` arm, which §3.1 lists verbatim. Per the constitution ("Une spec ne peut PAS redéfinir un contrat ; si elle a besoin de le changer, elle ouvre un `spec-issues.md` et on amende ce README d'abord", `README.md:6`), this is a contract touch that must be ratified. **Action:** `_specs/CLE-15-actuation-visibility/spec-issues.md` is opened proposing the additive `highlight?: HighlightAnchor` on `navigate`, and README §3.1 is amended to show the enriched `navigate` arm **before** CLE-15 merges. Tension is low (purely additive, optional, defensively parsed) but the process is followed. See §10.

---

## 4. The narrate-actuate heuristic (prompt) + the opt-in tool wiring

### 4.1 The prompt rule (the heuristic that decides "narrate vs actuate-and-show")

Add to the `<command_layer>` / `<page_actions>` blocks (server side, `chat-system-prompt.ts`; the `<page_actions>` block is introduced by CLE-04 design §2.9). Prose, English, no emoji:

```
Showing the user a result (narrate + actuate):
- When the user asks to SEE or ACT ON a specific record or list ("show me Acme", "score the contacts at Acme and pull them up", "filter my pipeline to fintech and take me there"), prefer to take them to it: use openRecord / openListView, or a read tool's `reveal` option, so they land on the result instead of only reading about it. When you send them to a specific record you just changed or scored, you may ask to highlight it so their eye goes straight to it.
- When the user asks a PURE QUESTION that does not ask to go anywhere ("how many accounts in France?", "what's my win rate?", "which deal is biggest?"), answer in place. Do NOT navigate and do NOT highlight — never yank the screen for a question.
- A reveal/navigate is a courtesy, not a requirement: your written answer must stand on its own (the user may be on Slack, where navigation does nothing).
```

This is a *strengthening* of the existing command-layer doctrine (`openRecord` already says "Use ONLY when the user wants to GO somewhere … Do NOT call this just to summarize", `navigation.ts:72`). CLE-15 generalizes that discipline to the new `reveal` option and to highlighting.

### 4.2 The opt-in mechanism (defence in depth — AC-2/AC-3/E-9)

A read tool narrate-actuates **only** when the model sets an explicit input flag (`reveal: true` and, where relevant, the id to highlight). The tool never auto-navigates off its own data. So:
- A model that correctly answers a pure question simply does not pass `reveal` → no directive (AC-2).
- A model that mis-fires `reveal` on a question causes at worst a benign navigation to a real, tenant-checked, relevant page (paths are existence-checked exactly like `openRecord`, `navigation.ts:81-114`) — never a crash, never a wrong page (E-9).
- Tools not in the opted-in set never emit a directive (AC-3).

### 4.3 Which tools opt in (the small named set)

Narrate-actuate is valuable for read tools that *produce a result about a concrete record/list the user wants to see*. CLE-15 wires it on a deliberately small set (the rest stay text-only):

- **`openRecord` / `openListView`** (`navigation.ts:70-148`) — already navigate; CLE-15 adds an optional `highlight` so landing on a record can pulse it, and (for `openListView` after a filter) pulse the first match. The `navigate` they already emit gains the optional highlight arg (§4.4).
- **A scoring/enrich summary read tool** that returns a result about one record or a named list (e.g. the contact-scoring read path) — gains an optional `reveal` input; when set, it emits `navigateDirective(listOrRecordPath, label, { entityId })` alongside its text summary.

The exact final set is confirmed at build time against the then-current tool inventory (CLE-01 reconciled it); the spec fixes the *pattern* (opt-in `reveal`, emit a `navigate(+highlight)` next to a complete text summary) and one concrete example tool. Adding more later is a one-line `navigate(+highlight)` spread per tool, no contract change.

### 4.4 `openRecord`/`openListView` highlight (the one real wiring CLE-15 does)

```ts
// navigation.ts openRecord (extends :116-120) — pulse the record you just landed on:
const path = RECORD_ROUTES[entityType](id);
return { opened: { entityType, id, name, path }, ...navigateDirective(path, name ?? undefined, { entityId: id, scope: pluralOf(entityType) }) };
```

The detail page itself (e.g. `/accounts/:id`) registering a locator that resolves `id` to a header/hero element is **CLE-07/CLE-14**; until then this highlight is a silent no-op (AC-8) and the navigation works exactly as today. So even this wiring is safe to ship ahead of page registration.

---

## 5. Highlight on a narrate-actuate navigate (client) + the CSS

### 5.1 Executor arm (post-navigation highlight)

`runUiDirective` (`use-ui-directives.ts`; CLE-04 makes it 3-branch per CLE-03 §2.4). The `navigate` arm:

```ts
if (d.kind === "navigate") {
  ctx.navigate(d.path);                       // unchanged: router.push (chat-dock.tsx:132)
  if (d.highlight) ctx.highlight(d.highlight, { afterNavigation: true }); // CLE-15
}
```

### 5.2 Why "after navigation" needs a settle, and how (E-1/E-4)

`router.push` is async: the target page mounts and registers its locator on a later tick. So `ctx.highlight(anchor, { afterNavigation: true })` must **retry briefly** until the locator resolves (or give up silently). Implemented in the dock's `highlight` ctx (not in the pure registry, which stays a single-shot `highlightEntity`):

```ts
// chat-dock.tsx onDirective ctx — afterNavigation does a short bounded poll for the locator.
highlight: (anchor, opts) => {
  if (!opts?.afterNavigation) { highlightEntity(anchor); return; }   // immediate (PAR path, §6)
  let tries = 0;
  const tick = () => {
    if (locateEntity(anchor)) { highlightEntity(anchor); return; }   // resolved → pulse
    if (++tries >= 12) return;                                        // ~12 × 100ms = 1.2s budget, then silent no-op (AC-8/E-3)
    window.setTimeout(tick, 100);
  };
  tick();
}
```

This is naturally deferred past streaming because `useUiDirectives` only dispatches when settled (`use-ui-directives.ts:45`) — so the navigate (and thus the highlight) fires after the turn, never mid-stream (E-4). The bounded poll guarantees termination (no infinite wait if the page never registers — wrong page, E-3).

### 5.3 The CSS (one keyframe + reduced-motion fallback) — `globals.css`

```css
/* CLE-15 — post-action highlight pulse. Scoped, self-contained, no dependency.
   Emphasis is NOT color-only: a solid outline + a soft background tint, so it is
   perceivable without color vision (accessibility §11 / AC-11). */
@keyframes cle-highlight-pulse {
  0%   { box-shadow: 0 0 0 0 var(--color-accent); background-color: color-mix(in srgb, var(--color-accent) 16%, transparent); }
  60%  { box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 45%, transparent); background-color: color-mix(in srgb, var(--color-accent) 10%, transparent); }
  100% { box-shadow: 0 0 0 0 transparent; background-color: transparent; }
}
.cle-entity-highlight {
  animation: cle-highlight-pulse 1.6s ease-out 1;   /* matches HIGHLIGHT_MS; 1 iteration, then clears */
  border-radius: 6px;                                /* soft, matches table/card radii */
}
/* Static fallback: an instant solid emphasis with NO animation, removed by JS after the window. */
.cle-entity-highlight--static {
  outline: 2px solid var(--color-accent);
  outline-offset: -1px;
  background-color: color-mix(in srgb, var(--color-accent) 12%, transparent);
}
/* Belt-and-braces: even if JS adds the animated class, kill motion under reduce. */
@media (prefers-reduced-motion: reduce) {
  .cle-entity-highlight { animation: none; outline: 2px solid var(--color-accent); outline-offset: -1px; }
}
```

Two layers of reduced-motion safety: the **JS** picks `--static` when `matchMedia` says reduce (so motion never even starts, AC-6), and the **CSS** `@media` neutralizes the animated class if it is ever applied (defence in depth, and covers the JS-can't-detect edge). `color-mix` already gates behind `@supports` elsewhere in this file (`:426`); the highlight degrades to the plain outline if `color-mix` is unsupported.

---

## 6. Highlight on a PAR action result (client) — one factored read point

Both the run-now arm (CLE-03 §2.4) and the confirm-approve path (CLE-05 §3) call `runRegisteredAction` then round-trip via `sendActionResult`/`roundTrip`. CLE-15 adds **one** helper both call after a successful run, so there is a single read point (AC-13):

```ts
// use-ui-directives.ts (exported; pure aside from the highlight call)
export function maybeHighlightFromResult(result: PageActionResult, highlight: (a: HighlightAnchor | HighlightAnchor[]) => void): void {
  if (!result.ok) return;                                  // only highlight a success (a failure pulses nothing)
  const h = (result.data as { highlight?: unknown } | undefined)?.highlight;
  const anchors = coerceAnchors(h);                        // accepts HighlightAnchor | HighlightAnchor[] | undefined; validates each
  if (anchors.length) highlight(anchors);                  // immediate (we're already on the page the action ran on)
}
```

Wired in the run-now arm:
```ts
void runRegisteredAction(d.actionId, d.params).then((result) => {
  ctx.sendActionResult(encodeActionResult(d.invocationId, result));
  maybeHighlightFromResult(result, ctx.highlight);          // CLE-15
});
```
and identically in CLE-05's `approveActionCard` after the run resolves (one added line; CLE-05 design §3). A page's action `run` opts in by putting `{ highlight: { entityId } }` (or an array) in its returned `data` — e.g. `moveStage` returns `data: { highlight: { entityId: dealId, scope: "opportunities", field: "stage" } }`. Pages that return no `highlight` pulse nothing (AC-8). `coerceAnchors` validates each entry exactly like `parseHighlightAnchor` (drops malformed; never throws).

> Why `data`, not a second directive: the result already round-trips through the frozen envelope (CLE-03 §3.5) whose `data` is free-form. Reading highlight ids out of `data` needs **zero** contract change and keeps the highlight co-located with the action's own knowledge of what it touched (the handler knows the affected id; the model does not have to). The narrate-actuate path uses the directive field instead because there the *model* is choosing to navigate-and-show, and the navigate is the carrier.

---

## 7. Threading the `highlight` ctx fn

`runUiDirective`'s ctx gains one field; both call sites supply it.

```ts
// use-ui-directives.ts
export function runUiDirective(
  d: UiDirective,
  ctx: {
    navigate: (path: string) => void;
    openComposer: (draft: ComposeEmailDraft) => void;
    sendActionResult: (text: string) => void;                       // CLE-03
    enqueueConfirm: (d: InvokeActionDirective) => void;             // CLE-05
    highlight: (a: HighlightAnchor | HighlightAnchor[], opts?: { afterNavigation?: boolean }) => void; // CLE-15
  },
): void { /* navigate arm §5.1; invokeAction arm §6; composeEmail unchanged */ }
```

Dock (`chat-dock.tsx:129-137`) supplies `highlight` per §5.2; the `/chat` page (CLE-03 §2.5 note) supplies the same (no mounted locators there → silent no-ops, correct). The confirm controller (CLE-05) receives `ctx.highlight` so its approve path can call `maybeHighlightFromResult` (one added prop, or it imports `highlightEntity` directly since it is module-level — simplest: import `highlightEntity` directly in the controller, no prop threading; both are equivalent and the spec picks the direct import to avoid widening CLE-05's controller signature).

---

## 8. Failure handling (every path is a no-op-or-success; nothing throws, nothing blocks)

| Failure | Where caught | Outcome |
|---|---|---|
| Malformed `highlight` on a `navigate` directive | `parseHighlightAnchor` in `parseUiDirective` (§3.1) | `highlight` dropped, `navigate` kept; never null, never throws (E-11/AC-12). |
| Highlight target not on screen | `applyPulse` `scrollIntoView({block:"nearest"})` (§2.3) | Scrolled into view, then pulsed (E-1). |
| Virtualized row not mounted | `locateEntity` → page locator returns null (§2.2) | Silent no-op; `console.debug` at most (AC-8/E-2). |
| Entity not on this page at all | `locateEntity` → null (no locator resolves it) (§2.2) | Silent no-op (E-3). |
| Buggy page locator throws | `locateEntity` try/catch (§2.2) | Swallowed → null → no-op; the highlight never crashes the chat (AC-8). |
| Page unmounts before round-trip lands | locator removed on unmount (§2.2) → `locateEntity` null | Silent no-op (E-6). |
| Element detaches during the 1.6 s window | `applyPulse` cleanup `isConnected` guard (§2.3) | Cleanup skipped (node gone); timer always cleared (E-7). No residue on a still-mounted node. |
| Navigate target page never registers a locator | `afterNavigation` bounded poll gives up after ~1.2 s (§5.2) | Silent no-op; navigation still happened (E-3). |
| Bulk action names hundreds of ids | `MAX_HIGHLIGHTS_PER_CALL` cap (§2.3) | First 25 pulsed, rest dropped; no strobe, no throw (E-5). |
| `prefers-reduced-motion` flips between fire and clear | preference read once at fire; class chosen once; matching clear removes that class (§2.3) | Consistent within one highlight (E-12). |
| `matchMedia` absent (SSR / jsdom without mock) | `prefersReducedMotion()` guards `typeof window`/`typeof matchMedia` (§2.3) | Treated as "no reduce" (animated path); tests mock it explicitly (E-12). |
| Result `ok:false` | `maybeHighlightFromResult` early-returns (§6) | A failed action pulses nothing (a green flash on a failure would mislead). |
| Off-web: model tries `invokePageAction` | CLE-04 no-manifest guard (`page-actions.ts` design §2.3 `:263-270`) | `{ error }`, no directive; prompt makes the model explain (§9). Unchanged by CLE-15. |
| Off-web: a narrate-actuate `navigate` reaches a client that drops directives | the client simply ignores `_uiDirective` (`navigation.ts:7-12`, README §6) | Text answer stands alone (AC-11/E-10). |

The invariant: a highlight is **best-effort decoration**. It either decorates a real element briefly and cleans up, or it does nothing — it can never error, never block the round-trip, never steal focus, never leave residue.

---

## 9. Off-web graceful degradation end to end

CLE-04 already makes the *tools* behave off-web (empty list, refusal — `page-actions.ts` design §2.3). CLE-15's job is to make the *assistant* **explain** it and to **verify** the headless path is self-sufficient.

### 9.1 Prompt strengthening (`<page_actions>` block, extends CLE-04 design §2.9 `:520-521`)

The CLE-04 block already says "Off-web … listPageActions returns an empty list. Do NOT pretend to act on the page — use a headless tool and keep your written answer self-sufficient." CLE-15 sharpens it to an explicit, user-facing explanation rule:

```
When you are off the web app (Slack, an external client) or on a page that declares no actions, listPageActions returns no actions and invokePageAction is refused. In that case:
- Say plainly that on-page actions only work inside the web app, then DO the work headlessly and give the result, or give a link the user can open.
- Never describe an on-page change as if it happened ("I moved the deal on your board") when you are off-web — you did not touch a page. State the headless outcome instead ("I updated the deal; open it here: <link>").
- Your text answer must be complete on its own; a navigation link is a bonus, not the answer.
```

### 9.2 End-to-end verification (the required off-web test, AC-9/AC-11)

A focused test builds `ToolContext` with `pageActionManifest: undefined` (the off-web shape — CLE-04 design §2.2) and asserts:
- `listPageActions.execute()` → `{ actions: [], note }` (CLE-04 design §2.3 `:210-218`).
- `invokePageAction.execute({ actionId: "x.y", params: {} })` → `{ error }` with **no** `_uiDirective` key (CLE-04 design §2.3 `:263-270`) — the required "off-web refuses page actions gracefully" test.
- A narrate-actuate read tool invoked with `reveal` **unset** returns its full text payload and no directive (AC-2/AC-11); invoked with `reveal: true` *in an off-web context* still returns a complete text payload (the directive it attaches is simply ignored by a non-honouring client — AC-11/E-10).
- Prompt assertion: the `<page_actions>` block contains the §9.1 explanation rule (no-fake-on-page-action, give-link-or-headless-result).

No server code path *changes* for off-web — CLE-15 proves and explains the existing one. (The only optional code touch is tightening the CLE-04 `note` strings to match the prompt wording; behaviour identical.)

---

## 10. README / contract tension

- **One additive contract field, flagged.** The single contract touch is `navigate.highlight?: HighlightAnchor` (§3). README §3.1 lists the `navigate` arm verbatim and says only a new *kind* is added without touching the two existing arms; an added optional field to an existing arm is still a §3.1 touch. Per `README.md:6` this requires a `spec-issues.md` and a README amendment **before merge**. CLE-15 opens `_specs/CLE-15-actuation-visibility/spec-issues.md` proposing the additive field and the constitution is amended to show:
  `| { kind: "navigate"; path: string; label?: string; highlight?: HighlightAnchor }`
  Tension is **low**: optional, defensively parsed (E-11), backward-compatible (E-10), and it reuses the directive rather than adding a kind (so the union arity is unchanged).
- **No other contract moves.** The result envelope, `invokeAction`, `decideAction`, the manifest, and the off-web tool behaviour are all consumed unchanged (CLE-15 reads `PageActionResult.data` — already free-form, CLE-03 §3.2 — for the PAR highlight, needing **zero** envelope change). `parseUiDirective` keeps returning `null` on a fully malformed result and remains never-throwing across all three kinds.

---

## 11. Accessibility

- **Reduced-motion is first-class** (AC-6/E-12): the JS picks a static, transition-free emphasis under `prefers-reduced-motion: reduce`, and the CSS `@media` block neutralizes the animated class even if applied — two independent guards. This matches the repo's existing reduced-motion discipline (framer-motion `useReducedMotion()` in the marketing demos, `accounts-demo.tsx:39`), extended to the one CSS animation CLE-15 adds (the repo has **no** global reduced-motion block today, so CLE-15 adds the scoped one).
- **Not color-only** (AC-11): the emphasis is an outline + box-shadow ring + soft background, not a hue swap — perceivable without color vision and against any row background.
- **Never steals focus** (AC-7): `scrollIntoView({ block: "nearest" })` (minimal scroll, no focus move) and focus is moved **only** if the page's locator opts in via `anchor.focus === true`; default is no focus change, so keyboard/AT focus is never hijacked by a highlight.
- **Non-blocking + self-clearing** (AC-7): a highlight is a transient class that self-removes after ≈1.6 s; it never traps input, never overlays, never persists. It is announced by nothing (it is decoration, not status) — the assistant's text remains the source of truth for screen-reader users, satisfying "headless answer is self-sufficient" (AC-11) for AT as well.
- **No emoji** in any added string (prompt or UI), per the brand rule.

---

## 12. Test strategy

Pure logic (`parseHighlightAnchor`, `coerceAnchors`, the narrate-actuate tool emit, `decideAction`/envelope untouched) → **vitest**. The registry lifecycle + the fire path + the executor arms + the dock poll → **@testing-library/react** + jsdom (the pattern CLE-03/05 use; `matchMedia` and `scrollIntoView` are mocked, both absent in jsdom). No live server; no Playwright for the gate (CLE-15 ships no real page — the live Playwright check is the bonus eval step 12).

- **`ui-directives.highlight.test.ts`** — `navigateDirective(path,label,highlight)` shape; `parseUiDirective` accepts a `navigate` with a well-formed `highlight`, **drops** a malformed `highlight` (number, empty `entityId`, missing) while **keeping** the `navigate` (E-11); regression: a `navigate` with **no** highlight parses byte-identically to today; `composeEmail`/`invokeAction` arms unchanged; fully malformed result → `null` (AC-12).
- **`highlight-registry.test.tsx`** — `useRegisterEntityLocator` registers on mount / clears its own on unmount (owner-symbol, E-6); `locateEntity` tries scope then default; a throwing locator → `null` (AC-8); `highlightEntity` on a fixture node adds the class and removes it after the window (fake timers, AC-7); reduced-motion mocked true → the `--static` class is used, no animated class (AC-6); detached node during the window → cleanup skipped, no throw (E-7); cap: 30 anchors → 25 `locateEntity` calls (E-5); absent id → no-op, `console.error` **not** called (AC-8).
- **`maybe-highlight-from-result.test.ts`** — `ok:false` → no highlight call; `ok:true` with `data.highlight` (single + array) → highlight called with validated anchors; `data` without highlight → no call; malformed `data.highlight` → dropped, no throw (§6).
- **`use-ui-directives.highlight.test.tsx`** — the `navigate` arm calls `ctx.navigate` then `ctx.highlight(anchor,{afterNavigation:true})` when `highlight` set, and only `ctx.navigate` when not (AC-1/AC-5); the `invokeAction` run-now arm calls `maybeHighlightFromResult` after a successful round-trip (AC-4); the dock `afterNavigation` poll: resolves once the locator appears, gives up silently after the budget (E-3).
- **`page-actions.offweb.test.ts`** *(required)* — `ToolContext` with `pageActionManifest: undefined`: `listPageActions` → `{ actions: [], note }`; `invokePageAction("x.y",{})` → `{ error }`, **no** `_uiDirective` (AC-9). This is the "off-web refuses page actions gracefully" gate.
- **`narrate-actuate.tool.test.ts`** — the opted-in read tool: `reveal:true` → result has a `navigate` (+`highlight`) directive **and** a complete text payload; `reveal` unset → same text payload, **no** directive (AC-2/AC-3/AC-11). Path is existence/tenant-checked like `openRecord` (no directive to a non-existent/foreign record, E-9).
- **`chat-system-prompt.cle15.test.ts`** — built prompt contains the narrate-actuate rule (reveal-on-intent, never-on-pure-question) and the strengthened off-web explanation (never-fake-on-page-action, give-link-or-headless-result) (AC-10); no emoji in the added blocks.
- **`highlight-a11y.test.ts(x)`** — the emphasis is not color-only (assert the class/keyframe sets outline/box-shadow, not only a color); reduced-motion path verified (AC-6/AC-11); focus not moved unless `focus:true` (AC-7).
- **Regression** — CLE-03/04/05 suites untouched and green; `pnpm tsc --noEmit` 0 errors; `regression.sh` green; no new runtime dependency.

Coverage target: 100% of the new branches in `parseHighlightAnchor`/`coerceAnchors`, the highlight registry (`useRegisterEntityLocator`, `locateEntity`, `highlightEntity`, `applyPulse`), `maybeHighlightFromResult`, the executor `navigate`-highlight + `invokeAction`-highlight additions, and the dock poll. The off-web path is covered by the required test above.
