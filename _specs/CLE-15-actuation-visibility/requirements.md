# CLE-15 — Actuation visibility: narrate+actuate, post-action highlight, off-web degradation — Requirements

> Constitution: `_specs/chat-live-executor/README.md`. CLE-15 is a Phase-3 feature (milestone M3), `depends_on: ["CLE-04-page-action-tools"]` (`_specs/chat-live-executor/feature_list.json:181-190`).
> This feature makes actuation **feel live** and **degrade cleanly**. It extends the README §1 doctrine "sous les yeux de l'utilisateur" (under the user's eyes) and §3.6 "Off-web (Slack/MCP): pas de manifest → les actions de page ne sont pas offertes ; headless seulement (dégradation propre)". It does **not** redefine any frozen contract; one **optional, additive** field on the `navigate` directive is proposed and flagged as a README §3.1 amendment (see design.md §3 and §10).

---

## 1. User story

**As** a founder driving the product through chat,
**when** I ask the assistant to do or show me something about a specific record or list,
**I want** the assistant to take me to it and briefly highlight what changed (not just tell me in prose),
**and when** I am off-web (Slack / an external MCP client) or on a page that declares no actions,
**I want** the assistant to say so plainly and still give me the headless answer (or a link),
**so that** "the chat acts under my eyes" is true on the web and "the chat is honest about what it can't do" is true everywhere.

This is three coordinated visibility behaviours:

1. **Narrate + actuate.** A *headless* tool (e.g. `scoreContacts`, `openListView`-adjacent reads, an enrich summary) that produces a result **about a specific record or list** may optionally emit a `navigate` (+ optional highlight) directive so the user lands on the result and sees it — **only** when the user is acting on / asking to *see* a specific thing. A pure question ("how many accounts are in France?") never yanks the screen. This **extends** the existing `<command_layer>` doctrine; it does not replace `openRecord`/`openListView` (which already navigate on explicit "go there" intent).
2. **Post-action highlight.** After a Page Action runs (CLE-03/CLE-05) **or** after a narrate-actuate navigate, the affected element on the page is briefly highlighted — the row that changed, the field updated, the card that moved. The mechanism is a lightweight client highlight registry + a CSS pulse keyed by an **entity id** that pages expose via a registered locator. It is non-blocking and respects `prefers-reduced-motion`.
3. **Off-web graceful degradation.** When there is no page manifest (Slack / MCP / no page mounted), `listPageActions` already returns empty and `invokePageAction` already refuses (CLE-04 `_specs/CLE-04-page-action-tools/design.md:210-218, 263-270`). CLE-15 makes the chat **explain** this cleanly and verifies the headless path stays self-sufficient end to end (prompt + tools).

---

## 2. EARS acceptance criteria

GIVEN/WHEN/THEN, testable. "PAR" = Page Action Registry (README §6). "Highlight registry" = the CLE-15 client store added in `lib/chat/page-actions/registry.ts`.

### Narrate + actuate

- **AC-1 (headless result about a record + intent to see → navigate).** GIVEN the user expresses intent to act on or see a **specific** record or list (e.g. "score the contacts at Acme and show me", "take my pipeline to the fintech ones"), WHEN a headless tool returns a result about that record/list, THEN the tool MAY attach a `navigate` directive (optionally with a `highlight` anchor) so the client navigates there, AND the human-readable summary still fully answers the request (the directive is additive, never the only payload).
- **AC-2 (pure question → no navigation).** GIVEN the user asks a **pure question** that does not ask to go to or see a place (e.g. "how many accounts in France?", "what's my win rate?"), WHEN a headless tool answers it, THEN it MUST NOT attach a `navigate` directive — the screen is not yanked. (The model decides via the prompt heuristic; the tool emits a directive only when the heuristic-driven `intent` flag is set — design.md §4.)
- **AC-3 (narrate-actuate is opt-in per tool, default off).** GIVEN any existing headless tool, WHEN CLE-15 ships, THEN tools that do **not** opt into narrate-actuate behave exactly as before (no directive) — the change is additive and scoped to the few read tools that benefit (design.md §4.3). No existing tool's default output changes.

### Post-action highlight

- **AC-4 (PAR action → affected element highlighted).** GIVEN a Page Action ran successfully and its `PageActionResult` names the affected entity id(s) (via the new optional `result.data.highlight` or the directive's highlight anchor), WHEN the result round-trips to the client, THEN the client calls the highlight registry to pulse the element for that entity id on the current page.
- **AC-5 (narrate-actuate navigate → target highlighted after arrival).** GIVEN a narrate-actuate `navigate` directive carries a `highlight` anchor, WHEN the client finishes navigating (the SPA route settles and the target page has registered its locator), THEN the target element is scrolled into view (if off-screen) and pulsed once.
- **AC-6 (reduced-motion respected).** GIVEN the user has `prefers-reduced-motion: reduce`, WHEN a highlight fires, THEN no motion/opacity animation plays; a static, instantly-applied-then-removed emphasis (a brief solid outline/background, no transition) is used instead, AND the element is still scrolled into view if off-screen.
- **AC-7 (highlight is non-blocking).** GIVEN any highlight, WHEN it fires, THEN it never blocks input, never steals focus by default (scroll is `block: "nearest"`, focus is not moved unless the page's locator explicitly opts in), and self-clears after a bounded duration (≈1.6 s) leaving the DOM exactly as it was (no residual class/inline style).
- **AC-8 (highlight target absent → no-op, never error).** GIVEN a highlight is requested for an entity id that no mounted page can locate (not on screen, not registered, virtualized-out, or page unmounted), WHEN the highlight fires, THEN it is a silent no-op (a `console.debug` at most) — it never throws, never logs an error, and never blocks the round-trip or the chat.

### Off-web graceful degradation

- **AC-9 (off-web → page actions suppressed).** GIVEN no page manifest is present (Slack / MCP / `/chat` page / no dock), WHEN the model calls `listPageActions`, THEN it returns `{ actions: [], note }` (CLE-04 `:210-218`), AND `invokePageAction` returns `{ error }` with no directive (CLE-04 `:263-270`) — no action is offered or attempted.
- **AC-10 (off-web → cleanly explained).** GIVEN the off-web condition, WHEN the assistant would otherwise act on a page, THEN the system prompt makes it explain plainly ("Page actions only work inside the web app — here's the result / a link") and **never** narrates a fake on-page action. CLE-15 strengthens the `<page_actions>` prompt block (CLE-04 `:512-525`) so the explanation is explicit and a headless link/answer is always offered.
- **AC-11 (headless path self-sufficient end to end).** GIVEN any off-web turn, WHEN the assistant answers, THEN the answer stands alone in text (a navigate directive that no client honours is harmless and ignored — `navigation.ts:7-12`, README §6). CLE-15 adds a regression that an off-web (no-manifest) `ToolContext` yields a refusal from `invokePageAction` and an empty `listPageActions`, and that a narrate-actuate tool's text payload is complete without the directive.

### Cross-cutting

- **AC-12 (no contract regression).** GIVEN CLE-03/CLE-04/CLE-05 are merged, WHEN CLE-15 ships, THEN the `invokeAction` directive shape, the result envelope (`[[action-result]]…[[/action-result]]`), `decideAction`, the manifest format, and the two existing directive kinds are unchanged. The only contract touch is the **optional additive** `highlight?` field on the `navigate` directive arm (design.md §3) — backward-compatible (absent ⇒ today's behaviour).
- **AC-13 (one highlight mechanism, reused).** GIVEN both the PAR path (AC-4) and the narrate-actuate path (AC-5) need to highlight, WHEN CLE-15 ships, THEN there is exactly **one** highlight registry + one CSS pulse, called by both paths (no fork) — the registry hook lives in the same module CLE-03 added (`lib/chat/page-actions/registry.ts`), so a page registers actions *and* a locator through one surface.

---

## 3. Edge cases (each maps to a failure-handling row in design.md §8 and a test)

| # | Edge case | Required behaviour |
|---|---|---|
| E-1 | **Target element not on screen** (scrolled out, below the fold) | Locator scrolls it into view (`scrollIntoView({ block: "nearest" })`) then pulses. Not an error. (AC-5/AC-7) |
| E-2 | **Virtualized list** — the row for the entity is not mounted (windowed out) | Locator returns "not found"; highlight is a no-op (AC-8). The page's locator MAY scroll the virtual list to the index if it knows it, but is not required to; absence is silent. |
| E-3 | **Entity not rendered at all** on the current page (wrong page, filtered out) | No registered locator resolves the id → silent no-op (AC-8). The assistant's prose still conveyed the outcome. |
| E-4 | **Navigation mid-stream** — a narrate-actuate navigate arrives while the assistant is still streaming | The existing `useUiDirectives` gate already defers directives until `chat.status !== "streaming"` (`use-ui-directives.ts:45`). The highlight that piggybacks on the navigate fires only after arrival (AC-5), so it is naturally deferred too. No partial-navigation. |
| E-5 | **Multiple highlights in one turn** (a bulk action touched 5 rows; or two directives) | The registry pulses each requested id independently; concurrent pulses do not clobber each other (each keyed by entity id, each self-clearing). A reasonable cap (≤ 25 ids per request, design.md §2.4) prevents a thousand-row bulk from strobing the page; over the cap → highlight the first N and no-op the rest, never error. |
| E-6 | **Highlight requested after the target page unmounts** (user navigated away before the round-trip landed) | The locator for that page is gone from the registry → no-op (AC-8). The fire-and-forget highlight call resolves harmlessly. |
| E-7 | **Highlight fires, then the element unmounts during the ≈1.6 s window** | The self-clear uses the element captured at fire time guarded by an `isConnected` check; if it detached, the cleanup is skipped (the node is gone) — no throw, no orphaned timer leak (timer is always cleared). |
| E-8 | **Same entity rendered in two DOM nodes** (a deal as a board card *and* conceptually as a table row across a view switch; `opportunities/page.tsx:1231` table `<tr>` vs `:1397` board `<div>`) | The page registers **one** locator per surface that resolves the id to **whichever** node is currently mounted for the active view. The registry asks the locator; the page owns the board-vs-table decision. No DOM-attribute scan (which would be ambiguous/fragile) is used. |
| E-9 | **Narrate-actuate emitted for a pure question by a mis-firing model** | Defence in depth: the tool only emits a directive when its `intent`/`reveal` input is explicitly set by the model (design.md §4.2); if the model sets it wrongly, the worst case is a benign navigation to a real, relevant page — never a crash, never a wrong-tenant page (paths are tenant-safe and existence-checked exactly as `openRecord` already does, `navigation.ts:81-114`). |
| E-10 | **Off-web client that *does* honour `navigate`** (a future rich non-dock surface) but has no PAR manifest | `navigate` (and its optional `highlight`) is harmless: the client navigates; if it has no highlight registry the `highlight` field is simply ignored (it's optional, parsed defensively). Page actions stay suppressed (AC-9). |
| E-11 | **Malformed `highlight` field on a `navigate` directive** (bad type, empty) | `parseUiDirective` validates it structurally and drops it (keeps the `navigate`), exactly as it already drops a bad `label` (`ui-directives.ts:91-92`). A malformed highlight never invalidates the navigation and never throws. |
| E-12 | **`prefers-reduced-motion` toggled between fire and clear** | The fire path reads the preference once at fire time; the matching clear path removes whatever it added (animated or static) — consistent within a single highlight. No mixed state. |

---

## 4. Out of scope

- **New page actions / new registrations.** Registering actions or locators on real pages (opportunities/accounts/contacts/call-mode/inbox/…) is **CLE-06..09 and CLE-14**. CLE-15 ships the *mechanism* (the highlight registry + CSS + the prompt + the directive field + the narrate-actuate tool wiring) and proves it with a **smoke/fixture locator**, not with production page wiring. (The README map: CLE-14 = "Sweep de parité", CLE-15 = "Visibilité de l'actionnement" — `README.md:150-151`.)
- **Computer-use / DOM-by-vision.** Rejected by README doctrine §3. The highlight is driven by a declarative registry keyed by entity id, never by screenshot+coordinate.
- **Audit/undo of highlighted actions.** That is CLE-11 (`tool_call_events` + undo). CLE-15 does not log highlights.
- **Confirmation UX, badges, editable params.** That is CLE-05. CLE-15 highlights *after* a successful run; it does not change the confirm card.
- **The result transport / envelope.** Frozen by CLE-03 §3.5. CLE-15 reads the existing envelope's `data` to find highlight ids; it does not change the envelope tags or shape.
- **Toast/notification surfaces.** A highlight is an in-place pulse, not a toast. Existing toasts (`components/ui/toast`) are untouched.
- **A general animation framework.** One scoped keyframe + one reduced-motion fallback; no new dependency, no design-system motion layer.

---

## 5. Evaluation steps (Phase 6, hostile QA — live where possible, fixtures where the real pages aren't wired yet)

CLE-15 ships no production page registration (that's CLE-14), so evaluation drives the mechanism through a **fixture page** (a tiny test route or a Testing-Library mount) that registers a locator for known ids, plus unit/integration tests for the pure logic and the prompt. Each step is pass/fail.

1. **Narrate-actuate fires only on intent.** Build the prompt; assert the new narrate-actuate guidance is present and tells the model to attach a reveal directive only when the user wants to *see/act on* a specific thing, never for a pure question (AC-1/AC-2). Unit-test the opt-in tool: with `reveal: true` it returns a `navigate` (+ `highlight`) directive **and** a complete text summary; with `reveal` unset it returns the same summary and **no** directive (AC-2/AC-3).
2. **Highlight on PAR success.** In an integration mount: register a fixture locator for id `acc_1`; round-trip an `[[action-result]]` envelope whose `data.highlight = { entityId: "acc_1" }`; assert the registry's locator was invoked for `acc_1` and the fixture node received (then lost) the pulse class within the window (AC-4/AC-7).
3. **Highlight on arrival after navigate.** Dispatch a `navigate` directive with `highlight: { entityId: "acc_1" }` through `runUiDirective`; after the (mocked) navigation resolves and the fixture page registers `acc_1`, assert the element is scrolled into view and pulsed once (AC-5).
4. **Reduced-motion.** With `matchMedia('(prefers-reduced-motion: reduce)')` forced true, fire a highlight; assert **no** animated class is applied — the static-emphasis class is used instead — and it still scrolls into view and self-clears (AC-6/E-12).
5. **Absent target = no-op.** Fire a highlight for `nope_404` with no registered locator; assert it returns without throwing, applies nothing, and does not log an error (AC-8/E-2/E-3/E-6). Fire for an id whose page just unmounted; same (E-6).
6. **Multiple + cap.** Request highlights for 30 ids; assert the first 25 (the cap) are attempted and the remainder are dropped silently, no throw, no strobe beyond the cap (E-5).
7. **Off-web suppression + explanation.** Build `ToolContext` with `pageActionManifest: undefined`; assert `listPageActions` → `{ actions: [], note }` and `invokePageAction("x.y", {})` → `{ error }`, **no** `_uiDirective` key (AC-9, the required off-web test). Build the prompt; assert the `<page_actions>` block explicitly instructs: when `listPageActions` is empty, say page actions only work in the web app and give the headless result/link, never fake an on-page action (AC-10).
8. **Headless self-sufficiency.** Assert a narrate-actuate tool's text payload fully answers the request with the directive **stripped** (so a Slack client that drops directives still gets the full answer) (AC-11).
9. **Malformed highlight tolerated.** Feed `parseUiDirective` a `navigate` with `highlight: 123` and with `highlight: { entityId: "" }`; assert the `navigate` survives with `highlight` dropped, never null/never throw (E-11).
10. **Regression.** CLE-03/04/05 tests untouched and green; `navigate`/`composeEmail`/`invokeAction` directives parse exactly as before; `parseUiDirective` still returns `null` on a fully malformed result; `decideAction` and the envelope are byte-unchanged (AC-12). `pnpm tsc --noEmit` 0 errors; `regression.sh` green.
11. **Accessibility.** Assert the pulse uses a non-color-only emphasis (outline + background, not hue alone) so it is perceivable without color vision; assert no emoji in any added UI/prompt string (brand rule); assert focus is not stolen (AC-7).
12. **Live smoke (when a real page from CLE-06+ is on main).** If at eval time at least one real page has registered a locator, do a Playwright pass: ask the dock to run a registered action on that page and confirm the changed row visibly pulses and self-clears; toggle OS reduced-motion and confirm the static fallback. (Recorded as a bonus live check; the fixture path is the authoritative gate since CLE-15 itself wires no production page.)
