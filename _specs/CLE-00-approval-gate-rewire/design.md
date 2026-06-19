# CLE-00 — Approval-gate rewire (design)

> Constitution: `_specs/chat-live-executor/README.md`. This design respects the frozen
> contracts there. It does **not** redefine any contract. The unified `decideAction`
> (README §3.5bis) is CLE-10; here we keep a minimal, forward-compatible local mapper
> that CLE-10 will absorb.

---

## 1. System fit (file:line)

The chat request pipeline (audit §1.1, `route.ts:602-638`) builds tools, resolves
capabilities, routes, and assembles the system prompt. The approval mode is read once
per request and threaded into both the tool context and the prompt:

- Read site: `app/apps/web/src/app/api/chat/route.ts:457` (destructure) +
  `route.ts:554-556` (producer returning the RAW value).
- Tool consumer: `app/apps/web/src/lib/chat/tools/create.ts:29` (destructure) and the
  `=== "ask"` branches at `create.ts:58,63 / 96,101 / 128,133`.
- Prompt consumer: `app/apps/web/src/lib/prompts/chat-system-prompt.ts:352`.
- SSOT to adopt: `app/apps/web/src/lib/guardrails/approval-mode.ts:39-63`
  (`readApprovalMode`) + the v2 enum `ApprovalModeV2` (`approval-mode.ts:23-26`).
- Stored default: `app/apps/web/src/lib/config/tenant-settings.ts:455` (`review-each`).

The fix lives entirely inside this read→consume path. No schema, no migration, no API
contract change, no new tool.

---

## 2. The exact mode-read change in route.ts

**Today** (`route.ts:554-556`):
```ts
(async () => {
  return tenantSettings.agentApprovalMode || "auto";
})(),
```
This is the single defect: it emits a RAW, possibly-legacy value that downstream code
mis-tests.

**Change**: coerce at the read site via the SSOT, so everything downstream receives a
canonical `ApprovalModeV2`.
```ts
(async () => {
  // SSOT coercion — collapses legacy ("ask"/"auto"/"manual"/"off") and v2 values to
  // the canonical v2 enum. Was: `tenantSettings.agentApprovalMode || "auto"`, which
  // leaked a raw value that create tools mis-tested as `=== "ask"` (CLE-00 bug).
  return readApprovalMode(tenantSettings);
})(),
```
- Import: add `readApprovalMode` (and, if convenient, `type ApprovalModeV2`) from
  `@/lib/guardrails/approval-mode` at the top of `route.ts`.
- The destructured `agentApprovalMode` at `route.ts:457` is now typed/known to be a
  `ApprovalModeV2` string. It continues to flow unchanged into `toolCtx`
  (`route.ts:608`) and `buildChatSystemPrompt` (`route.ts:665`). **No other route
  change is required** — the value is now correct at the source.

Note: `ToolContext.agentApprovalMode` is typed `string` (`lib/chat/tools/context.ts:11`).
We MAY tighten it to `ApprovalModeV2` for safety (optional, see §3); if tightened, every
producer already passes a coerced value so it stays green.

---

## 3. How create/update tools + system prompt consume the v2 enum

We introduce **one small pure helper** that maps a v2 mode to a coarse disposition.
This is intentionally minimal and is the seam CLE-10 will replace with `decideAction`.

**New helper** — colocated with the SSOT so CLE-10 finds it:
`app/apps/web/src/lib/guardrails/approval-mode.ts` (append):
```ts
/**
 * CLE-00 minimal disposition mapper. Maps the effective v2 mode to a coarse
 * decision for the chat *create* tools, which carry no per-call confidence today.
 *
 * FORWARD-COMPAT: this is a thin stand-in. CLE-10 replaces all call sites with
 * `decideAction(...)` (README §3.5bis), which folds in metadata (mutating/outbound/
 * reversible/cost), role, and a real confidence signal. Keep the shape narrow so the
 * swap is mechanical.
 *
 * @param mode   effective mode (already through readApprovalMode)
 * @param confidence optional 0-1 signal; absent → treated as below-threshold (safe)
 */
export function chatCreateDisposition(
  mode: ApprovalModeV2,
  confidence?: number | null,
): "proposal" | "execute" {
  switch (mode) {
    case "review-each":
      return "proposal";
    case "batch-daily":
      // No chat-side daily queue store exists pre-CLE-10. Degrade to the review
      // card — NEVER silent execute. (requirements EC-6 / AC-5.)
      return "proposal";
    case "auto-high-confidence":
      // Create is treated as auto-executable under explicit autonomy. When a
      // confidence is supplied and is below the create bar, fall back to a card.
      if (confidence == null) return "execute";
      return confidence >= HIGH_CONFIDENCE_THRESHOLDS["contact-create"]
        ? "execute"
        : "proposal";
    default: {
      // Unknown/unreachable (readApprovalMode already defaults). Safest = proposal.
      const _exhaustive: never = mode;
      void _exhaustive;
      return "proposal";
    }
  }
}
```
Rationale for `confidence == null → "execute"` under `auto-high-confidence`: it
preserves the **current** UX for tenants who set `"auto"` (which coerces to
`auto-high-confidence`) — they get immediate creates, exactly as today. The borderline
fall-back is wired for when CLE-16 supplies real confidence. This choice is documented
in requirements §2.1 and is the one place a reviewer should sanity-check the product
intent.

**create.ts consumption** — replace each `agentApprovalMode === "ask"` with a single
computed disposition. At the top of `buildCreateTools` (`create.ts:28-29`):
```ts
import { chatCreateDisposition } from "@/lib/guardrails/approval-mode";
// ...
const { tenantId, userId, agentApprovalMode, authCtx } = ctx;
const disposition = chatCreateDisposition(agentApprovalMode as ApprovalModeV2);
const proposeFirst = disposition === "proposal";
```
Then:
- `create.ts:58` / `96` / `128` (descriptions): `proposeFirst ? "Propose creating…" : "Create…"`.
- `create.ts:63` / `101` / `133` (execute guards): `if (proposeFirst) { return { proposal: true, … }; }`.

The proposal object shape (`{ proposal: true, action, entityType, entityName, fields }`)
is **unchanged** — the client card renderer (`chat-action-cards.tsx`) and its
`proposalAction → REST POST` mapping (`chat-action-cards.tsx:67-76`) keep working
verbatim. We are only flipping *when* the branch is taken.

**Casting note**: `ctx.agentApprovalMode` is typed `string` today
(`context.ts:11`). Two options, pick one in tasks:
- (a) cast `as ApprovalModeV2` at the call site (smallest diff), or
- (b) tighten `ToolContext.agentApprovalMode: ApprovalModeV2` and update the one
  producer (`route.ts:608`, already coerced). (b) is cleaner and is recommended; it
  also makes any *other* tool that reads the mode safe. Either keeps `tsc` at 0.

**update.ts**: verified it has **no** `=== "ask"` proposal branch — its only
approval-mode code is the *settings writer* for `updateWorkspace` (`update.ts:842-913`),
which already legacy-maps on write and is unrelated to a create-style proposal gate. So
**no functional change to `update.ts`** under CLE-00. (If a future create-like proposal
is added to update, it should call `chatCreateDisposition` too — noted for CLE-10.)

**system-prompt consumption** — `chat-system-prompt.ts:352`. The block must appear for
every mode that yields a card (so the model knows the card flow + the `[Approved: …]`
follow-up contract). Replace the `=== "ask"` test with a mode-aware predicate. To avoid
importing guardrail logic into the prompt module (keep it presentational), pass a
**precomputed boolean** from the route:

- In `chat-system-prompt.ts`: change the param `agentApprovalMode: string` to a
  semantic flag. Add `approvalRequiresReview: boolean` to `SystemPromptParams`
  (`chat-system-prompt.ts:8-18`) and branch `params.approvalRequiresReview ? <block> : ""`
  at line 352. Keep `agentApprovalMode` too only if other copy needs it (it does not —
  the block is the sole consumer), so it can be dropped from the interface. Minimal-diff
  alternative: keep the param name, change the test to
  `agentApprovalMode !== "auto-high-confidence"` — but that re-encodes enum logic in the
  prompt. **Recommended**: the boolean flag; compute it in the route as
  `chatCreateDisposition(agentApprovalMode) === "proposal"` and pass it.
- In `route.ts:665`: pass `approvalRequiresReview: chatCreateDisposition(agentApprovalMode) === "proposal"`.

This keeps the prompt block and the tool behavior driven by the **same** function, so
they can never drift again (the root cause of the original bug was two independent
literal tests).

---

## 4. Data flow (after the fix)

```
tenant_settings.agentApprovalMode (v2 or legacy literal on disk)
        │
        ▼
route.ts:554-556  readApprovalMode(tenantSettings)  ──►  ApprovalModeV2 (canonical)
        │                                                   │
        ├───────────────► toolCtx.agentApprovalMode (route.ts:608)
        │                         │
        │                         ▼
        │                 create.ts: chatCreateDisposition(mode)
        │                         │
        │              proposal ──┴── execute
        │              │                   │
        │   { proposal:true,...}     db.insert + logToolCall  → { created }
        │              │
        │              ▼
        │     chat-action-cards.tsx renders card → Approve → REST POST
        │              → re-injects "[Approved: …]" user msg (cards:94)
        │
        └───────────────► approvalRequiresReview (route.ts:665)
                                  │
                                  ▼
                          chat-system-prompt.ts:352  <approval_mode> block (or omitted)
```

Single coercion point (the read site) → single disposition function → consumed
identically by tool and prompt. No raw value escapes past `route.ts:556`.

---

## 5. Failure handling

- **Unknown / corrupt stored mode** → `readApprovalMode` already defaults to
  `"review-each"` (`approval-mode.ts:60-61`); `chatCreateDisposition` defaults its
  `switch` to `"proposal"`. **Safest disposition wins** — a misconfigured tenant gets a
  review card, never a silent write. (requirements EC-4.)
- **Missing confidence under `auto-high-confidence`** → treated per §3 (`null →
  execute` to preserve current `auto` UX; any supplied below-bar confidence → card).
  This is the only non-"safest" default and is deliberate + documented; flip the helper's
  `null` branch to `"proposal"` if product later wants creates always-reviewed.
- **`readApprovalMode` import cycle risk** → `approval-mode.ts` already imports only a
  `type` from `tenant-settings` (`approval-mode.ts:20`), and `create.ts` already imports
  from `tenant-settings`; adding the helper import introduces no runtime cycle.
- **Card REST path failure** (Approve → POST 4xx/5xx) → unchanged from today; out of
  scope. The gate only governs the tool's first response.

---

## 6. Security / tenant

- **No new trust surface.** Coercion is pure and tenant-agnostic; `tenantId` scoping on
  inserts (`create.ts` `db.insert(...).values({ tenantId, ... })`) is untouched.
- **Fail-safe direction.** Every defaulting path resolves toward *more* review, not
  less — consistent with the WS-1 "zero silent actions" criterion and CLAUDE.md
  "boil lakes" completeness.
- **Role gating preserved.** `viewer` write-blocking and admin-only tool hiding live in
  `capability-resolver.ts` and run *before* the tool executes; CLE-00 changes nothing
  there (requirements AC-7/AC-8). Approval mode is orthogonal to role and only matters
  for users who already hold write capability.
- **No PII in new code paths.** The mapper sees only an enum + optional number.

---

## 7. Test strategy

New file `app/apps/web/src/__tests__/chat-create-approval-gate.test.ts` (vitest), the
regression net that would have caught the dead-wiring:

1. **Mapper unit** — `chatCreateDisposition`:
   - `review-each → "proposal"`, `batch-daily → "proposal"`,
     `auto-high-confidence` (no confidence) `→ "execute"`,
     `auto-high-confidence` + low confidence `→ "proposal"`,
     `auto-high-confidence` + high confidence `→ "execute"`,
     unknown-cast `→ "proposal"`.
2. **Tool behavior (the regression assertion)** — build the create tools with a
   `ToolContext` whose `agentApprovalMode` is the coerced `"review-each"`; invoke
   `createContact.execute({...})`; assert the result has `proposal === true` and
   **no DB write happened**. Use the existing DB-mock pattern from the repo
   (`reference_ci-health-and-test-flakes` notes Proxy-fallback schema mocks); assert the
   insert spy was **not** called. Repeat for `createAccount`, `createDeal`.
3. **Tool behavior (auto path)** — same with `agentApprovalMode: "auto-high-confidence"`;
   assert result has `created` and the insert spy **was** called once.
4. **Coercion end-to-end** — assert `chatCreateDisposition(readApprovalMode({
   agentApprovalMode: "ask" })) === "proposal"` (legacy `"ask"` still cards) and
   `... "auto" ... === "execute"` (legacy `"auto"` still immediate) — locks EC-1/EC-2.
5. **Prompt flag** — assert that for `review-each`/`batch-daily` the route would pass
   `approvalRequiresReview: true` and for `auto-high-confidence` (no confidence)
   `false`, by testing `chatCreateDisposition(...) === "proposal"` directly (the exact
   expression the route uses), so prompt + tool can't drift.
6. **Grep guard (optional, cheap)** — a test or `regression.sh` line asserting no
   `agentApprovalMode === "ask"` remains in `lib/chat/tools/**` or `lib/prompts/**`.

Coverage target: 100% of the new branches (README §3.7). `tsc` 0 errors. Existing
`guardrails-approval-mode.test.ts` stays green (we don't touch `readApprovalMode` or
`enforceAgentApprovalMode` signatures).
