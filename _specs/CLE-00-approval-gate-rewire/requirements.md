# CLE-00 — Approval-gate rewire (requirements)

> Initiative: Chat Live Executor (CLE). Constitution: `_specs/chat-live-executor/README.md`.
> Audit: `_research/chat-task-executor-audit-2026-06-16.md` §6.1, §1.3.
> Phase 0 (M0). Depends on: none. Completeness target: 10/10.

This feature repairs the **dead-wired chat approval gate**. It is a correctness fix,
not a new abstraction. The unified decision function `decideAction` (§3.5bis of the
README) is **CLE-10**, explicitly out of scope here (see §4 Out of scope).

---

## 0. Bug verification (DONE FIRST — this is requirement R0)

R0 is a *verification* requirement: before any code changes, the implementer MUST
re-confirm the bug against the live code and record the exact value flow. The
verification below was performed on 2026-06-16 against the current branch and the
bug **reproduces exactly as the audit describes**.

### 0.1 The current value flow (file:line — verbatim)

1. `app/apps/web/src/app/api/chat/route.ts:457` — `agentApprovalMode` is one of the
   destructured results of a `Promise.all([...])`.
2. `app/apps/web/src/app/api/chat/route.ts:554-556` — the producing async closure is:
   ```ts
   (async () => {
     return tenantSettings.agentApprovalMode || "auto";
   })(),
   ```
   This returns the **RAW stored value** (v2 enum) with **no coercion**, falling back
   to the legacy literal `"auto"` when unset.
3. `app/apps/web/src/app/api/chat/route.ts:608` — the raw value is injected into the
   tool context: `agentApprovalMode,` inside `const toolCtx: ToolContext = { ... }`.
4. `app/apps/web/src/app/api/chat/route.ts:665` — the same raw value is passed to
   `buildChatSystemPrompt({ ..., agentApprovalMode, ... })`.
5. `app/apps/web/src/lib/chat/tools/create.ts:29` destructures it
   (`const { ..., agentApprovalMode, ... } = ctx;`) and branches on the **legacy v1
   literal** at:
   - `create.ts:58` (description) and `create.ts:63` (execute) — `createContact`
   - `create.ts:96` and `create.ts:101` — `createAccount`
   - `create.ts:128` and `create.ts:133` — `createDeal`
   Every branch is `agentApprovalMode === "ask"`.
6. `app/apps/web/src/lib/prompts/chat-system-prompt.ts:352` — the system prompt
   appends its `<approval_mode>` block only when `agentApprovalMode === "ask"`.

### 0.2 The v2 enum (SSOT)

`app/apps/web/src/lib/guardrails/approval-mode.ts:23-26`:
```ts
export type ApprovalModeV2 = "review-each" | "batch-daily" | "auto-high-confidence";
```
Legacy values still admitted on disk (`approval-mode.ts:29`):
`"auto" | "ask" | "manual" | "off"`.

`readApprovalMode(settings)` (`approval-mode.ts:39-63`) is the coercion SSOT:
- `"review-each" | "batch-daily" | "auto-high-confidence"` → identity
- `"auto"` → `"auto-high-confidence"`
- `"ask" | "manual" | "off"` → `"review-each"`
- `undefined | null | unknown` → `"review-each"` (safest default)

### 0.3 The stored default

`app/apps/web/src/lib/config/tenant-settings.ts:455`:
```ts
agentApprovalMode: "review-each",
```
The field type (`tenant-settings.ts:190-197`) admits both v2 and legacy values.

### 0.4 Why the proposal branch is dead (the precondition, stated explicitly)

The `=== "ask"` branch fires **only** when the stored value is literally `"ask"`.
But:
- Fresh tenants default to `"review-each"` (`tenant-settings.ts:455`).
- The settings writer maps legacy input through a legacy map and never writes `"ask"`
  for v2-aware callers (`app/apps/web/src/lib/chat/tools/update.ts:900-901`).
- When the field is unset, `route.ts:555` substitutes `"auto"`, not `"ask"`.

So in every realistic state the value reaching `create.ts` is `"review-each"`,
`"batch-daily"`, `"auto-high-confidence"`, or `"auto"` — **never `"ask"`**. The
proposal-card branch is therefore unreachable, and `createContact` / `createAccount`
/ `createDeal` **mutate the database immediately, with no approval card**, regardless
of the tenant's configured mode. The audit's claim in §6.1 holds verbatim.

**Conclusion: the bug reproduces exactly.** No upstream coercion exists between the
store and the tool/prompt branch.

---

## 1. User story

**As** a founder who has set the chat to a non-autonomous approval mode (the default
`review-each`, or `batch-daily`),
**I want** the chat's create/update tools to surface a reviewable proposal (or queue
the action) instead of silently writing to my CRM,
**so that** "zero silent actions" (the WS-1 success criterion that drove the
`review-each` default) is actually honored and I keep control of what the agent writes.

Secondary: **as** a founder on `auto-high-confidence`, I want confident creates to
execute immediately and borderline ones to fall back to a review card, so autonomy
is real but bounded.

---

## 2. Acceptance criteria (EARS — GIVEN/WHEN/THEN)

The effective mode below is always the result of `readApprovalMode(tenantSettings)`
(the SSOT), never the raw stored value.

**AC-1 (review-each → proposal card)**
GIVEN a tenant whose effective approval mode is `review-each`
WHEN the user asks the chat to create a contact, account, or deal
THEN the corresponding create tool returns a `{ proposal: true, action, entityType,
entityName, fields }` object (no DB insert occurs)
AND the chat renders an editable proposal card (existing `chat-action-cards.tsx` path).

**AC-2 (review-each → no mutation)**
GIVEN the same tenant in `review-each`
WHEN the create tool runs
THEN no row is inserted into `contacts` / `companies` / `deals` and no `logToolCall`
create event is written, until the user approves the card.

**AC-3 (auto-high-confidence + confident → execute)**
GIVEN a tenant whose effective mode is `auto-high-confidence`
WHEN the user asks to create a record AND the action's confidence meets the
auto-execute bar for its category (see §2.1 confidence note)
THEN the create tool inserts the record immediately and returns the existing
`{ created: { ... } }` shape (current immediate-execute behavior preserved).

**AC-4 (auto-high-confidence + borderline → card)**
GIVEN a tenant whose effective mode is `auto-high-confidence`
WHEN the confidence for the create does NOT meet the bar
THEN the tool returns a proposal card (falls back to review) rather than executing.

**AC-5 (batch-daily → queue, not silent execute)**
GIVEN a tenant whose effective mode is `batch-daily`
WHEN the user asks to create a record
THEN the create tool does NOT insert immediately; it returns a proposal-shaped result
the user can act on now (v1 transport: same card path as `review-each`), and the
returned `summary`/copy makes clear the action awaits review.
(Rationale: there is no chat-side daily-batch queue store today; CLE-10/CLE-16 own the
real batch queue. For CLE-00, `batch-daily` MUST be non-silent — it degrades to the
review card rather than to immediate mutation. Documented limitation, not silent write.)

**AC-6 (system prompt matches the mode)**
GIVEN any tenant
WHEN the system prompt is built
THEN the `<approval_mode>` block (`chat-system-prompt.ts:352-363`) is included WHEN the
effective mode requires per-action review (`review-each`, `batch-daily`, and the
borderline path of `auto-high-confidence`) and omitted only for unconditional
auto-execute, so the model's described behavior matches the tool's actual behavior.

**AC-7 (viewer role interplay)**
GIVEN a `viewer` (read-only) user
WHEN the chat would otherwise create/update
THEN create/update tools are not offered (existing capability-resolver fail-closed
gating at `lib/agents/capability-resolver.ts`), so approval mode never even applies.
This spec MUST NOT change role gating; it only changes the approval branch for users
who already have write capability.

**AC-8 (admin/member interplay)**
GIVEN an `admin` or `member` (write-capable) user
WHEN approval mode is `review-each`/`batch-daily`
THEN the proposal/queue behavior of AC-1..AC-5 applies identically; the proposal card's
"Approve" → REST `POST` path (`chat-action-cards.tsx:67-76`) is unchanged and still
subject to its own route-level auth.

**AC-9 (idempotent upserts unaffected)**
GIVEN any mode
WHEN an `upsert*` tool runs (`upsertContact`, `upsertAccount`, `upsertDealByCompany`)
THEN behavior is unchanged — these are find-or-create idempotent tools that never had a
proposal branch and are explicitly out of scope for the gate (see §4).

### 2.1 Confidence note (for AC-3/AC-4)

The chat create tools today carry **no per-call confidence signal**. CLE-00 MUST NOT
invent an LLM confidence pipeline (that is CLE-16, "learned thresholds"). For
`auto-high-confidence` in this spec, the absence of a confidence signal is treated as
**below threshold → fall back to proposal card** (matches `enforceAgentApprovalMode`'s
`confidence ?? 0` safety rule at `approval-mode.ts:165`). When a future caller passes a
confidence, the local mapper (design §3) honors it. Net effect for today's wiring:
`auto-high-confidence` create tools **execute immediately** only if we deliberately
treat create as a high-confidence-by-default category; otherwise they card. The design
fixes this choice explicitly (see design §5 failure handling and §3 mapper) — default
chosen: **create executes immediately under `auto-high-confidence`** (preserves the
current "auto" UX for users who opted into autonomy), **review-each/batch-daily card**.

---

## 3. Edge cases

- **EC-1 Legacy tenant storing `"ask"`** — `readApprovalMode("ask") → "review-each"`
  (`approval-mode.ts:53-56`). Such a tenant now correctly gets a proposal card. This is
  the one historical state where the old `=== "ask"` accidentally worked; the rewire
  preserves the same user-visible outcome (card) via the SSOT.
- **EC-2 Legacy tenant storing `"auto"`** — `readApprovalMode("auto") →
  "auto-high-confidence"`. Under the old code `"auto" !== "ask"` so it executed
  immediately; under the rewire it still executes immediately (per §2.1 default).
  No behavior regression for `"auto"` tenants.
- **EC-3 Missing setting (`undefined`/`null`)** — old code substituted `"auto"`
  (`route.ts:555`) → immediate execute. New code: `readApprovalMode(undefined) →
  "review-each"` → **proposal card**. This is a deliberate, safer change that matches
  the stored default (`tenant-settings.ts:455`) and the WS-1 intent. Call it out in the
  PR as an intentional behavior change for unconfigured tenants.
- **EC-4 Unknown/future stored value** — `readApprovalMode(default branch) →
  "review-each"` (`approval-mode.ts:60-61`) → safest (proposal). Covered by an existing
  test (`guardrails-approval-mode.test.ts:24-28`); add a tool-level assertion too.
- **EC-5 The synthetic `[Approved: …]` follow-up message** — after the user approves a
  card, `chat-action-cards.tsx:94` re-injects a user message beginning with
  `[Approved: …]`. The system-prompt `<approval_mode>` block (`chat-system-prompt.ts:
  358-362`) instructs the model to parse it and link related records. This path MUST
  keep working: the `<approval_mode>` block must still be present for the modes that
  produce cards (AC-6), otherwise the follow-up instruction disappears and chained
  creates (e.g. account → its contact) break.
- **EC-6 batch-daily with no queue store** — see AC-5: degrade to card, never silent
  insert.

---

## 4. Out of scope

- **`decideAction` unification (CLE-10).** This spec does **not** introduce the unified
  decision function from README §3.5bis. It only rewires the *existing* mode read and
  the *existing* `=== "ask"` branches to the v2 enum, plus a small local mapper that
  CLE-10 will absorb. No new shared abstraction, no change to `enforceAgentApprovalMode`'s
  signature, no touching the background loops.
- **The `auto`/`ask`/legacy literals on disk.** Not migrated here (WS-1 runner owns
  that). We only *read* via `readApprovalMode`.
- **`update*` tools that have no proposal branch today.** Scope is the create-tool
  proposal gate (`createContact`/`createAccount`/`createDeal`) + the system-prompt
  branch. `update.ts` is touched only if it currently branches on `=== "ask"` (it does
  not — verified, `update.ts` has no `=== "ask"` proposal branch); so no functional
  change to `update.ts` beyond the shared mapper import if reused. (Design §3 confirms.)
- **`upsert*` idempotent tools** (AC-9) — unchanged.
- **Page Action Registry, listPageActions/invokePageAction** — CLE-03/CLE-04.
- **Outbound send guardrails, signalAutoEnroll, enforceSendingIdentity** — CLE-13.
- **Confidence/learned thresholds pipeline** — CLE-16.

---

## 5. Evaluation steps (hostile QA — how to verify live)

Phase 6 is adversarial. Verify **behavior**, not just types.

1. **Unit (fast gate).** Run the new test file (`tasks.md` T6). Assert: create tool in
   `review-each` returns `{ proposal: true }` and performs **no** DB insert; in
   `auto-high-confidence` returns `{ created }`; unknown mode → proposal.
2. **Static.** `pnpm -C app/apps/web exec tsc --noEmit` → 0 errors. Grep the repo for
   any remaining `agentApprovalMode === "ask"` in tools/prompt — expect **0** results
   except in legacy-coercion tables.
3. **Live (Playwright, mint session as `martin.paviot@pilae.ch`, per
   `reference_callmode-local-verify`).** With the tenant's effective mode = `review-each`
   (the prod default), open the chat and ask: *"create a contact named Test Reviewer at
   Acme"*. EXPECT: an editable proposal card appears in the chat; query the DB
   (`SELECT count(*) FROM contacts WHERE first_name='Test'`) and confirm **no row** was
   inserted before clicking Approve. Click Approve → row appears, and the follow-up
   `[Approved: …]` message is handled (no error, related-record offer if applicable).
4. **Negative (auto path).** Temporarily set the tenant's mode to `auto-high-confidence`
   (via Settings or `update.ts`), ask to create a deal → EXPECT immediate `{ created }`
   and a row inserted with `logToolCall` event present (no card). Restore mode after.
5. **Regression.** `regression.sh` green; the new regression test (T6) is the one that
   would have caught the original dead-wiring.

A FAIL on step 3 (mutation with no card under `review-each`) means the bug is not fixed.
