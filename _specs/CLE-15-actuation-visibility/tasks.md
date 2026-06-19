# CLE-15 — Actuation visibility — Tasks

> Branch: `feat/CLE-15-actuation-visibility`. Merge to main only on Phase-6 PASS. Commit trailer `Co-Authored-By: Rippletide <admin@rippletide.com>`.
> Depends on CLE-04 (and transitively CLE-03/CLE-05) being merged: the files this feature extends — `lib/chat/page-actions/registry.ts`, `lib/chat/tools/page-actions.ts`, the `invokeAction` arm of `components/chat/use-ui-directives.ts`, the `<page_actions>` prompt block — are created by those features. Each task lists the file it touches, a verify step, and the test to write. Run from `C:\Users\marti\leads\app\apps\web`. Type-check/test commands: `pnpm tsc --noEmit` and `pnpm vitest run <file>` (write tests, then run `tsc` — per the repo lesson that tests can break the build).

---

### Task 0 — Open the contract amendment FIRST (gate before any code)

- **Action:** Create `_specs/CLE-15-actuation-visibility/spec-issues.md` proposing the additive optional field `highlight?: HighlightAnchor` on the `navigate` arm of `UiDirective` (design.md §3, §10). Amend `_specs/chat-live-executor/README.md` §3.1 to show the enriched `navigate` arm:
  `| { kind: "navigate"; path: string; label?: string; highlight?: HighlightAnchor }`
  and add a one-line note that the field is optional, defensively parsed, backward-compatible.
- **File:** `_specs/CLE-15-actuation-visibility/spec-issues.md` (new), `_specs/chat-live-executor/README.md` (§3.1).
- **Verify:** README §3.1 shows the `highlight?` field; spec-issues.md states the rationale + that it reuses `navigate` (no new kind).
- **Test:** none (doc gate). This task MUST land before Task 2 (the contract code change) per `README.md:6`.

---

### Task 1 — `HighlightAnchor` type + the highlight registry (sibling to the action store)

- **Action:** In the CLE-03 registry module, add: `HighlightAnchor` and `EntityLocator` types (design.md §2.1); a module-level `locators` Map; `useRegisterEntityLocator(scope, locate)` (mount/clear with owner-symbol, design.md §2.2); `locateEntity(anchor)` (scope→default, try/catch → null, design.md §2.2); `highlightEntity(anchors)` + `applyPulse` (cap, scrollIntoView block:"nearest", reduced-motion class choice, self-clearing with `isConnected` guard, design.md §2.3); internal `prefersReducedMotion()` and a `cssEscape` helper. Re-export `HighlightAnchor` as a pure type from `lib/chat/ui-directives.ts` (so the pure SSOT and the server builder share it without importing the `"use client"` module).
- **File:** `app/apps/web/src/lib/chat/page-actions/registry.ts` (extend); `app/apps/web/src/lib/chat/ui-directives.ts` (re-export the type only).
- **Verify:** `pnpm tsc --noEmit` clean; `highlightEntity` is exported; the action `store` and its three functions (CLE-03) are untouched.
- **Test (required — "highlight no-ops when the target is absent"):** `highlight-registry.test.tsx` — register a fixture locator for `acc_1`; `highlightEntity({entityId:"acc_1"})` adds then (fake-timer) removes the class; **`highlightEntity({entityId:"nope_404"})` with no locator applies nothing, returns without throwing, and does NOT call `console.error`** (AC-8); a throwing locator → no-op (AC-8); reduced-motion mocked true → `--static` class, no animated class (AC-6); cap 30→25 `locateEntity` calls (E-5); detached node during the window → cleanup skipped, no throw (E-7); unmount clears only this owner's locator (E-6).

---

### Task 2 — `navigate.highlight` directive field (builder + defensive parser)

- **Action:** Add the optional `highlight?: HighlightAnchor` to the `navigate` arm of `UiDirective`; extend `navigateDirective(path, label?, highlight?)`; add `parseHighlightAnchor` (pure, defensive: non-empty `entityId` required, optional string `scope`/`field`, boolean `focus`; drops malformed, never throws) and `normalizeAnchor` (strip unknown keys); call `parseHighlightAnchor` in the `navigate` arm of `parseUiDirective`, keeping the `navigate` even when the highlight is dropped (design.md §3.1).
- **File:** `app/apps/web/src/lib/chat/ui-directives.ts`.
- **Verify:** `tsc` clean; `composeEmail` + `invokeAction` arms and `isSafeInternalPath` unchanged; a `navigate` with no highlight serializes/parses exactly as before.
- **Test:** `ui-directives.highlight.test.ts` — builder shape with/without highlight; parser accepts a good highlight, **drops** malformed (`123`, `{entityId:""}`, missing) while keeping `navigate` (E-11); regression: no-highlight `navigate` byte-identical to today; `composeEmail`/`invokeAction` unchanged; fully malformed result → `null` (AC-12).

---

### Task 3 — Read result for a PAR highlight (`maybeHighlightFromResult`) + wire the run-now arm

- **Action:** In `use-ui-directives.ts` add `maybeHighlightFromResult(result, highlight)` (early-return on `!result.ok`; read `result.data.highlight`; `coerceAnchors` validates single/array, drops malformed; call `highlight` only if anchors exist — design.md §6) and `coerceAnchors`. Call it in the `invokeAction` run-now arm right after `sendActionResult(...)` (design.md §6).
- **File:** `app/apps/web/src/components/chat/use-ui-directives.ts`.
- **Verify:** `tsc` clean; the existing run-now round-trip (CLE-03) is unchanged except the one added call; a result without `data.highlight` triggers no highlight.
- **Test:** `maybe-highlight-from-result.test.ts` — `ok:false`→no call; `ok:true`+single/array highlight→called with validated anchors; no `data.highlight`→no call; malformed→dropped, no throw.

---

### Task 4 — Thread the `highlight` ctx fn through the executor + both surfaces

- **Action:** Add `highlight: (a, opts?) => void` to `runUiDirective`'s ctx; in the `navigate` arm call `ctx.highlight(d.highlight, { afterNavigation: true })` when set (design.md §5.1). In `chat-dock.tsx` supply `highlight` with the bounded `afterNavigation` poll (≤12×100ms, then silent no-op) and the immediate path for PAR (design.md §5.2). In the `/chat` page's `onDirective`, supply the same `highlight` (no mounted locators there → silent no-ops). Have CLE-05's confirm controller import `highlightEntity` directly and call `maybeHighlightFromResult` after its approve run resolves (design.md §6, §7).
- **File:** `app/apps/web/src/components/chat/use-ui-directives.ts`, `app/apps/web/src/components/chat/chat-dock.tsx`, `app/apps/web/src/app/(dashboard)/chat/page.tsx`, `app/apps/web/src/components/chat/chat-action-cards.tsx`.
- **Verify:** `tsc` clean; both `onDirective` ctxs satisfy the new signature; navigation still works when no highlight is present; the confirm-approve path still round-trips (CLE-05 behaviour preserved).
- **Test:** `use-ui-directives.highlight.test.tsx` — `navigate` arm calls `navigate` then `highlight({afterNavigation:true})` when highlight set, only `navigate` when not (AC-1/AC-5); run-now `invokeAction` arm calls `maybeHighlightFromResult` after success (AC-4); dock poll resolves once the locator appears and gives up silently after budget (E-3).

---

### Task 5 — The highlight CSS (one keyframe + reduced-motion fallback)

- **Action:** Add to `globals.css`: `@keyframes cle-highlight-pulse` (outline ring + soft background, not color-only), `.cle-entity-highlight` (1.6s, 1 iteration), `.cle-entity-highlight--static` (instant outline+tint, no animation), and a scoped `@media (prefers-reduced-motion: reduce)` rule neutralizing the animated class (design.md §5.3). Use `color-mix` (already `@supports`-gated in this file) with an outline fallback.
- **File:** `app/apps/web/src/app/globals.css`.
- **Verify:** the classes exist; visually (dev) a fixture node pulses then clears; nothing else in the file changed; no global selector regressions.
- **Test:** `highlight-a11y.test.ts(x)` — assert the emphasis sets outline/box-shadow (not only a color/hue); assert the reduced-motion `--static` class carries no `animation` (AC-6/AC-11).

---

### Task 6 — Narrate-actuate: opt-in `reveal` on the named read tool(s) + `openRecord`/`openListView` highlight

- **Action:** Add an optional `highlight` arg to the `navigate` that `openRecord`/`openListView` already emit (`navigation.ts:116-120,143-147`): `openRecord` → `{ entityId: id, scope: pluralOf(entityType) }`; `openListView` → optional first-match highlight (design.md §4.4). Add an optional `reveal` input (+ the id to reveal) to ONE concrete read tool that returns a result about a specific record/list (the scoring/enrich summary read path, design.md §4.3); when `reveal` is set, spread `navigateDirective(path, label, { entityId })` alongside the existing complete text payload. Tools NOT in the set are untouched (AC-3). Keep all paths existence/tenant-checked exactly like `openRecord` (`navigation.ts:81-114`).
- **File:** `app/apps/web/src/lib/chat/tools/navigation.ts` + the one chosen read tool's file (confirm against the live inventory at build time).
- **Verify:** `tsc` clean; `openRecord`/`openListView` default output unchanged except the additive highlight on their navigate; the read tool with `reveal` unset returns its prior text-only output.
- **Test:** `narrate-actuate.tool.test.ts` — `reveal:true` → result has a `navigate`(+`highlight`) directive AND a complete text payload; `reveal` unset → same text, no directive (AC-2/AC-3/AC-11); no directive for a non-existent/foreign record (E-9). `navigation.test.ts` (existing, if present) stays green.

---

### Task 7 — Prompt: narrate-actuate heuristic + strengthened off-web explanation

- **Action:** In `chat-system-prompt.ts`, extend the `<command_layer>`/`<page_actions>` text with: the narrate-actuate rule (reveal/navigate + highlight ONLY when the user wants to see/act on a specific thing; never for a pure question; answer must stand alone — design.md §4.1) and the strengthened off-web rule (when `listPageActions` is empty say page actions only work in the web app, then give the headless result or a link; never describe an on-page change as if it happened off-web; text answer is complete on its own — design.md §9.1). English, no emoji.
- **File:** `app/apps/web/src/lib/prompts/chat-system-prompt.ts`.
- **Verify:** `tsc` clean; the prompt builds; the existing `<page_actions>` block (CLE-04) is extended, not replaced.
- **Test:** `chat-system-prompt.cle15.test.ts` — built prompt contains the narrate-actuate markers (reveal-on-intent, never-on-pure-question) and the off-web explanation markers (web-app-only, give-link-or-headless-result, never-fake-on-page-action); assert no emoji in the added blocks (AC-10).

---

### Task 8 — Off-web end-to-end verification (the required off-web test)

- **Action:** Add `page-actions.offweb.test.ts` building a `ToolContext` with `pageActionManifest: undefined` and asserting the no-manifest behaviour end to end (design.md §9.2). Optionally tighten the CLE-04 `note` strings in `page-actions.ts` to match the prompt wording (behaviour unchanged) — only if it improves clarity; no logic change.
- **File:** `app/apps/web/src/lib/chat/tools/page-actions.ts` (test; optional note tweak only).
- **Verify:** `tsc` clean; `listPageActions`/`invokePageAction` logic is unchanged (CLE-04).
- **Test (required — "off-web (no manifest) refuses page actions gracefully"):** `page-actions.offweb.test.ts` — with `pageActionManifest: undefined`: `listPageActions.execute()` → `{ actions: [], note }`; **`invokePageAction.execute({ actionId:"x.y", params:{} })` → `{ error }` with NO `_uiDirective` key** (AC-9); a narrate-actuate read tool with `reveal` unset returns a complete text payload with no directive; with `reveal:true` in an off-web context still returns a complete text payload (the directive harmless/ignored) (AC-11/E-10).

---

### Task 9 — Fixture locator + integration proof of the full loop

- **Action:** Add a test-only fixture component that renders a few rows with `data-cle-entity={id}` and calls `useRegisterEntityLocator("fixture", locate)` (design.md §2.4). Use it to prove: (a) a PAR result with `data.highlight` pulses the right fixture row (AC-4); (b) a `navigate` directive with `highlight` pulses the target after the (mocked) navigation + registration settles (AC-5); (c) reduced-motion static path (AC-6); (d) absent id → no-op (AC-8).
- **File:** test fixture co-located under `components/chat/__fixtures__/` or inline in the test.
- **Verify:** integration tests pass with mocked `matchMedia`/`scrollIntoView`.
- **Test:** `highlight-integration.test.tsx` — the four scenarios above (AC-4/AC-5/AC-6/AC-8).

---

### Task 10 — Full regression + type-check + spec reconciliation

- **Action:** Run the whole suite + `tsc`; confirm CLE-03/04/05 tests untouched and green; confirm no new runtime dependency. Verify README §3.1 (Task 0) matches the shipped directive type. Append a sprint note to `_reports/harness-health.md`.
- **File:** —
- **Verify:** `pnpm tsc --noEmit` 0 errors; `pnpm vitest run` green; `regression.sh` green; `navigate`/`composeEmail`/`invokeAction` parse exactly as before; `decideAction` + envelope byte-unchanged (AC-12).
- **Test:** the existing regression suite + all CLE-15 tests above. No emoji anywhere added (grep the diff).

---

### Task 11 (bonus, non-blocking) — Live Playwright smoke if a real page is registered

- **Action:** If at eval time a CLE-06+ page has registered a locator on main, do a Playwright pass: open the dock, run a registered action, confirm the changed row visibly pulses and self-clears; toggle OS reduced-motion and confirm the static fallback (design.md eval step 12).
- **File:** —
- **Verify:** screenshot before/after the pulse; reduced-motion screenshot.
- **Test:** manual/Playwright; recorded in the sprint report. Non-blocking — the fixture path (Task 9) is the authoritative gate since CLE-15 wires no production page.

---

## Ordering rationale

0 (contract gate) → 1 (registry) → 2 (directive field) → 3 (PAR result read) → 4 (ctx threading, depends on 1+2+3) → 5 (CSS, parallel-safe after 1) → 6 (tool emitters, depends on 2) → 7 (prompt) → 8 (off-web required test) → 9 (fixture integration, depends on 1–5) → 10 (regression) → 11 (bonus live). The two required tests land in Task 1 ("highlight no-ops when target absent") and Task 8 ("off-web refuses page actions gracefully").
