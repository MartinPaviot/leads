# CLE-10 — Unified approval plane (`decideAction`) — Design

> Constitution: `_specs/chat-live-executor/README.md`. Implements the **real body** of
> `decideAction` (README §3.5bis — signature frozen, reproduced verbatim §2.1) and collapses the four
> approval/autonomy vocabularies (audit §1.3) into one authority. Reconciles CLE-00's
> `chatCreateDisposition` (the "seam CLE-10 will absorb", CLE-00 design §3) and CLE-04's `decideAction`
> **stub** (CLE-04 design §2.1 — same file, body replaced, **signature untouched** so
> `invokePageAction`'s import site never changes). No frozen contract is redefined.

---

## 1. System fit (file:line) — the four vocabularies and where each lives today

| # | Vocabulary | SSOT today | Read by | CLE-10 disposition |
|---|---|---|---|---|
| A | Chat proposal cards | `lib/chat/tools/create.ts:58,63,96,101,128,133` (`agentApprovalMode === "ask"`) + CLE-00's planned `chatCreateDisposition` (`approval-mode.ts`, **not yet present in this tree**) | `create.ts`, `chat-action-cards.tsx`, `chat-system-prompt.ts:352` | **Rewired** to call `decideAction` (§5.1). `chatCreateDisposition`, if present, is reduced to a one-line adapter over `decideAction`; if absent, the `=== "ask"` branches are replaced directly. |
| B | `enforceAgentApprovalMode` (the real v2 SSOT) | `lib/guardrails/approval-mode.ts:142-179` | **9 call sites**: `inngest/agent-reactor.ts:186`, `inngest/autonomous-pipeline.ts` (re-implements its own map `:242-247`), `lib/emails/email-intelligence-actions.ts` (×5: `:334,428,550,688,791,875`), `lib/deal-progression/engine.ts:431`, `inngest/reply-handler.ts`, `lib/deals/deal-autofill.ts` | **Re-implemented as a thin delegation to `decideAction`** (§6). Signature preserved → all 9 sites compile and behave equivalently. One core. |
| C | `capture-approvals` (ingestion) | `lib/capture/approval.ts:29-55` (`captureApprovalMode = auto\|review\|hybrid`) | email sync / meeting / call capture paths | **Out of scope** (§8) — governs *recording an interaction*, not *taking an action*. Stays separate. |
| D | `autonomyConfig.level` (decorative 4th vocab) | `db/schema/campaign.ts:96-128` (`level` col) + `app/api/settings/autonomy/route.ts` | only campaign-engine: `lib/campaign-engine/execution-gate.ts:31`, `autonomy-defaults.ts`, the autonomy route | **Wired**: `level` becomes the user-facing control; `agentApprovalMode` is **derived** from it (§4). Toggling the UI now changes what `decideAction` returns (req AC-14). |

Supporting facts read from the live tree (anchors for the edits):
- `ApprovalModeV2 = "review-each" | "batch-daily" | "auto-high-confidence"` — `approval-mode.ts:23-26`.
- `readApprovalMode(settings)` coerces legacy → v2, default `"review-each"` — `approval-mode.ts:39-63`.
- `HIGH_CONFIDENCE_THRESHOLDS` (per `GuardedAction`) — `approval-mode.ts:88-98`; F005 learned override at `:164`.
- `enforceAgentApprovalMode(input): ApprovalDecision` — `approval-mode.ts:142-179`.
- `GuardedAction` union (7 members) — `approval-mode.ts:70-77`.
- `authCtx.role: string` (default `"member"`) — `auth-utils.ts:13,71`.
- `ToolContext { …, agentApprovalMode: string }` — `lib/chat/tools/context.ts:6-12`.
- `autonomyConfig` row shape — `db/schema/campaign.ts:96-128`; `AutonomyLevel` — `campaign-engine/types.ts:118`.
- `getTrustScore(tenantId): TrustScoreState` (`overall` 0–100, default 50) — `campaign-engine/trust-score.ts:69-98`.
- `tenant_settings.agentApprovalMode` (v2 union, default `"review-each"`) — `tenant-settings.ts:190-193,455`.
- `decide-action.ts` — **does not yet exist in this tree**; CLE-04 specifies the stub. CLE-10 is therefore
  *replace-or-create*: if CLE-04 shipped the stub, replace its body; if not, create the file with the
  §2.1 contents. Either way the **signature** is the frozen §3.5bis one.

CLE-10 touches: `decide-action.ts` (body), `approval-mode.ts` (delegation + level→mode derivation),
`create.ts` + the create-style `update.ts` branch (call `decideAction`), `agent-reactor.ts` +
`autonomous-pipeline.ts` (route through the core), `settings/autonomy/route.ts` (persist derived mode).
It does **not** touch `page-actions.ts` (CLE-04), `capture/approval.ts` (C), `execution-gate.ts` (D's
downstream send policy), or any schema (no migration — `agentApprovalMode` and `level` columns exist).

---

## 2. The frozen contract + the real body

### 2.1 `lib/guardrails/decide-action.ts` — signature (README §3.5bis, verbatim) + real body

The interface block below is the **frozen contract** (README §3.5bis). It is byte-compatible with the
CLE-04 stub's `DecideActionInput`/`DecideActionResult` (CLE-04 design §2.1) so the `invokePageAction`
import site is unchanged. Only the **body** is new.

```ts
/**
 * decideAction — THE single decision authority for the Chat Live Executor
 * (README §3.5bis). One function decides whether an action — headless OR a page
 * action OR a background-loop action — executes directly, shows a confirm card,
 * queues into the daily review, or is refused.
 *
 * CLE-10: this is the REAL body. It branches on approvalMode (the ApprovalModeV2
 * SSOT via readApprovalMode), the action class derived from metadata, the role,
 * and confidence (honouring F005 learnedThresholds). It is consumed IDENTICALLY by:
 *   (a) chat create/update tools (absorbs CLE-00's chatCreateDisposition),
 *   (b) invokePageAction (CLE-04 — import site unchanged),
 *   (c) the background loops, via enforceAgentApprovalMode which now DELEGATES here.
 *
 * The SIGNATURE (DecideActionInput / DecideActionResult / the function shape) is the
 * frozen §3.5bis contract and MUST NOT change. CLE-16 will feed it richer confidence
 * and trained thresholds; it will not change the signature.
 *
 * Fail-safe doctrine: every defaulting path resolves toward MORE control
 * (confirm/refuse), never toward a silent execute (CLE-00 "zero silent actions").
 */

import type { ApprovalModeV2 } from "@/lib/guardrails/approval-mode";
import { HIGH_CONFIDENCE_THRESHOLDS, type GuardedAction } from "@/lib/guardrails/approval-mode";

export type ActionDisposition = "execute" | "confirm" | "queue" | "refuse";

export interface DecideActionInput {
  action: {
    mutating: boolean;
    outbound?: boolean;
    reversible?: boolean;
    cost?: "free" | "credits" | "money";
    confirm: "never" | "risky" | "always";
  };
  approvalMode: ApprovalModeV2; // SSOT via readApprovalMode()
  role: "admin" | "member" | "viewer";
  confidence?: number;
}

export interface DecideActionResult {
  disposition: ActionDisposition;
  reason: string;
}

/**
 * Optional extension input (NOT part of §3.5bis — additive, all optional, so the
 * frozen call shape `decideAction({ action, approvalMode, role, confidence })` is a
 * valid subset). Lets background callers pass the F005 learned thresholds and an
 * action key for threshold lookup. Page actions / chat creates do not pass these.
 */
export interface DecideActionExtra {
  /** Action key for confidence-threshold lookup (F005). Defaults via class→key map. */
  actionKey?: GuardedAction;
  /** F005 learned per-action thresholds; override HIGH_CONFIDENCE_THRESHOLDS when present. */
  learnedThresholds?: Record<string, number>;
}

export function decideAction(
  input: DecideActionInput,
  extra?: DecideActionExtra,
): DecideActionResult {
  const { approvalMode, role } = input;

  // ── Defensive normalization (fail-safe: unknown scalar → safest) — req AC-21 ──
  const mutating = typeof input.action.mutating === "boolean" ? input.action.mutating : true;
  const outbound = input.action.outbound === true;
  const reversible = input.action.reversible === true;
  const cost =
    input.action.cost === "free" || input.action.cost === "credits" || input.action.cost === "money"
      ? input.action.cost
      : "free";
  const confirmPolicy =
    input.action.confirm === "never" || input.action.confirm === "risky" || input.action.confirm === "always"
      ? input.action.confirm
      : "always"; // unknown → safest

  // ── 0. ROLE FLOOR (evaluated before mode) — req AC-1 / AC-2 ──
  // Viewers may only drive pure-read actions. Any write/outbound/paid → refuse,
  // regardless of approvalMode. (Minimal viewer gate; full matrix is CLE-12.)
  if (role === "viewer") {
    if (mutating || outbound || cost === "money") {
      return {
        disposition: "refuse",
        reason: "role:viewer — read-only; mutating/outbound/paid actions require a member or admin",
      };
    }
    return { disposition: "execute", reason: "role:viewer — read-only action, execute" };
  }

  // ── 1. PAID always confirms, regardless of mode — req AC-3 ──
  // Spending real money is never silent and never batched.
  if (cost === "money") {
    return { disposition: "confirm", reason: "cost:money — always confirm a paid action" };
  }

  // ── 2. PURE READ executes in every mode — req AC-5 ──
  if (!mutating && !outbound) {
    return { disposition: "execute", reason: "read-only action — execute" };
  }

  // From here: member/admin, non-paid, and (mutating || outbound).
  // Classify for the mode matrix.
  const destructive = mutating && !reversible && !outbound;

  // ── 3. review-each: every write/outbound is carded — req AC-4 ──
  if (approvalMode === "review-each") {
    return { disposition: "confirm", reason: "mode:review-each — every action requires approval" };
  }

  // ── 4. batch-daily — req AC-6 / AC-7 / AC-8 ──
  if (approvalMode === "batch-daily") {
    if (destructive) {
      // Irreversible change is never silently batched.
      return { disposition: "confirm", reason: "mode:batch-daily — irreversible change requires confirm" };
    }
    // outbound (non-paid) and reversible mutation → daily review lane.
    return {
      disposition: "queue",
      reason: outbound
        ? "mode:batch-daily — outbound queued into the daily review"
        : "mode:batch-daily — reversible change queued into the daily review",
    };
  }

  // ── 5. auto-high-confidence — req AC-9 / AC-10 / AC-11 / AC-13 ──
  // Autonomy auto-runs only REVERSIBLE, NON-OUTBOUND, NON-DESTRUCTIVE work, and only
  // above the action's confidence threshold. Outbound + destructive always confirm.
  if (approvalMode === "auto-high-confidence") {
    if (outbound || destructive) {
      return {
        disposition: "confirm",
        reason: outbound
          ? "mode:auto-high-confidence — outbound always confirmed (under the user's eyes)"
          : "mode:auto-high-confidence — irreversible change always confirmed",
      };
    }
    // reversible mutation. The action's own policy can RAISE the bar — req AC-13 / AC-12.
    if (confirmPolicy === "always" || confirmPolicy === "risky") {
      return { disposition: "confirm", reason: `mode:auto-high-confidence — action confirm:${confirmPolicy}` };
    }
    // confirm:"never" reversible → gate on confidence (F005-aware) — req AC-9 / AC-10.
    const key = extra?.actionKey;
    const threshold =
      (key && extra?.learnedThresholds?.[key]) ??
      (key ? HIGH_CONFIDENCE_THRESHOLDS[key] : 0.8); // no key → moderate default bar
    const confidenceValue = input.confidence ?? 0;
    if (confidenceValue >= threshold) {
      return {
        disposition: "execute",
        reason: `mode:auto-high-confidence — confidence ${confidenceValue.toFixed(2)} >= ${threshold}`,
      };
    }
    return {
      disposition: "confirm",
      reason: `mode:auto-high-confidence — confidence ${confidenceValue.toFixed(2)} < ${threshold}; fall back to review`,
    };
  }

  // ── 6. Unknown mode (unreachable: readApprovalMode coerces) → safest — req AC-21 ──
  return { disposition: "confirm", reason: "unknown approval mode — defaulting to confirm" };
}
```

> Notes on the `extra` param: README §3.5bis freezes the *first* argument's shape. Adding a second,
> fully-optional `extra` argument keeps every existing/contracted call (`decideAction({ action,
> approvalMode, role, confidence })`) valid — `invokePageAction` (CLE-04) calls it with one argument and
> compiles unchanged (AC-18). Only the background delegation (§6) passes `extra` to forward
> F005 thresholds. If a reviewer prefers zero signature surface beyond §3.5bis, the fallback (recorded,
> no contract change) is to fold `learnedThresholds` lookup into `enforceAgentApprovalMode` *before* it
> calls `decideAction` and pass an already-resolved boolean — but the optional `extra` is cleaner and
> keeps the threshold logic in one place. **Chosen: optional `extra`.**

### 2.2 `GuardedAction` ↔ action-metadata bridge (used by §6 delegation)

`enforceAgentApprovalMode` speaks `GuardedAction` (7 named verbs); `decideAction` speaks metadata.
A pure mapping table (added to `approval-mode.ts`, §6) translates each `GuardedAction` to
`{ action metadata, actionKey }` so the delegation is lossless:

| `GuardedAction` | `mutating` | `outbound` | `reversible` | `cost` | `confirm` | class |
|---|---|---|---|---|---|---|
| `email-send` | true | true | false | free | risky | outbound |
| `email-reply` | true | true | false | free | risky | outbound |
| `contact-create` | true | false | true | free | never | reversible-mutation |
| `contact-update` | true | false | true | free | never | reversible-mutation |
| `deal-stage-change` | true | false | true | free | risky | reversible-mutation |
| `task-create` | true | false | true | free | never | reversible-mutation |
| `sequence-enrollment` | true | true | false | free | always | outbound (irreversible-ish) |

`actionKey` = the same `GuardedAction` member, so the F005 threshold lookup in §2.1 reproduces the
exact thresholds `enforceAgentApprovalMode` uses today (`approval-mode.ts:88-98`), including the
`sequence-enrollment: 1.1` "never auto" guard (it is `outbound` so it always `confirm`s anyway — both
paths agree).

---

## 3. The FULL decision matrix (normative)

`role ∈ {member, admin}` unless the row says `viewer`. "thr" = `confidence ≥ threshold(actionKey)`
with F005 override; "¬thr" = below or absent.

| approvalMode | read | reversible-mutation (`confirm:never`) | reversible-mutation (`confirm:risky/always`) | destructive | outbound (non-paid) | paid (`cost:money`) |
|---|---|---|---|---|---|---|
| **any, role=viewer** | execute | refuse | refuse | refuse | refuse | refuse |
| **review-each** | execute | confirm | confirm | confirm | confirm | confirm |
| **batch-daily** | execute | queue | queue | confirm | queue | confirm |
| **auto-high-confidence** | execute | execute if thr, else confirm | confirm | confirm | confirm | confirm |

Reading the matrix:
- **Column order = precedence in the body**: viewer floor → paid → read → mode×class. `paid` and the
  viewer floor short-circuit before the mode is consulted (a paid action confirms even in
  `auto-high-confidence`; a viewer refuses even in `auto-high-confidence`).
- **`confirm` policy only raises the bar**: in `auto-high-confidence`, a `confirm:"always"` reversible
  action is `confirm` (not `execute`) even at confidence 1 (AC-13); in `review-each`/`batch-daily` the
  mode floor already dominates so the policy is moot.
- **`queue` only appears under `batch-daily`** (the only mode with a "later, in a batch" semantics).
  Chat/page-action callers downgrade `queue → confirm` (EC-6); background callers honour it.
- Every cell is a test case in `decide-action.test.ts` (tasks T13): 4 modes × 6 classes + the viewer
  row + the confidence split = the enumerated grid, plus AC-21 malformed-scalar arms.

---

## 4. Reconciling `autonomyConfig.level` with `agentApprovalMode` — the level↔mode mapping + single read path

### 4.1 The decision: **level is the user-facing control; mode is derived**

Two candidate directions:

- **(α) level authoritative, mode derived** (chosen). The autonomy UI already exposes the four levels,
  the trust-gate already lives on the level (`autonomy/route.ts:40-48`), and `suggestedLevel` is what
  the trust engine emits (`trust-score.ts:110-112`). The level is the human-meaningful dial. We derive
  the `ApprovalModeV2` from it and keep `tenant_settings.agentApprovalMode` as a **cache** of the
  derivation so every existing reader of `agentApprovalMode` (the SSOT `readApprovalMode`) keeps working
  with zero new reads.
- **(β) mode authoritative, level cosmetic.** Rejected: it would leave the level decorative (the exact
  bug the audit flags, G3/§1.3 D) and strand the trust-gate and `suggestedLevel`.

**Chosen: (α).** Justification: it makes the *visible* control load-bearing (req AC-14), reuses the
existing trust gate, and requires **no migration of the read path** — `readApprovalMode` stays the SSOT;
we only ensure the value it reads is kept in sync with the level.

### 4.2 Derivation (pure helper, added to `approval-mode.ts`)

```ts
import type { AutonomyLevel } from "@/lib/campaign-engine/types";

/**
 * Map the user-facing autonomy level to the canonical ApprovalModeV2 the control
 * plane runs on. trustScore gates the strategic relaxation (req AC-16); the route
 * already refuses to SET strategic below 80 (autonomy/route.ts:40-48), so this is a
 * belt-and-braces floor that also covers a level written before the gate existed.
 *
 *   copilot   → review-each            (every action carded)
 *   guided    → review-each            (cards now; batch is a future opt-in, EC-3)
 *   autonomous→ auto-high-confidence   (auto-run safe high-confidence work)
 *   strategic → auto-high-confidence   (+ relaxed thresholds, only if trust >= 80)
 */
export function deriveApprovalModeFromLevel(
  level: AutonomyLevel,
  trustOverall: number,
): { mode: ApprovalModeV2; relaxThresholds: boolean } {
  switch (level) {
    case "autonomous":
      return { mode: "auto-high-confidence", relaxThresholds: false };
    case "strategic":
      return { mode: "auto-high-confidence", relaxThresholds: trustOverall >= 80 };
    case "guided":
    case "copilot":
    default:
      return { mode: "review-each", relaxThresholds: false };
  }
}
```

> `guided → review-each` (not `batch-daily`) deliberately: the audit and CLE-00 establish "zero silent
> actions" as the safe default, and there is no chat-side batch store pre-CLE-11 (EC-6). Promoting
> `guided → batch-daily` is a one-line change deferred to CLE-16 when the batch lane is universal. This
> is the single product-intent line a reviewer should sanity-check; it is conservative by design.

### 4.3 Single read path: `resolveEffectiveMode`

`readApprovalMode(settings)` remains the SSOT for the *stored* mode. We add **one** resolver that
prefers the level-derived mode when an `autonomy_config` row exists, falling back to the stored mode
(EC-4 legacy tenants):

```ts
/**
 * The ONE function the control plane calls to get the effective approval mode +
 * whether to relax F005 thresholds. Level (if a row exists) is authoritative; else
 * the stored agentApprovalMode (readApprovalMode) is used. (req AC-15.)
 */
export function resolveEffectiveMode(args: {
  settings: Pick<TenantSettings, "agentApprovalMode">;
  level?: AutonomyLevel | null;     // autonomy_config.level, or null if no row
  trustOverall?: number;            // trust-score overall, default 50
}): { mode: ApprovalModeV2; relaxThresholds: boolean } {
  if (args.level) {
    return deriveApprovalModeFromLevel(args.level, args.trustOverall ?? 50);
  }
  return { mode: readApprovalMode(args.settings), relaxThresholds: false };
}
```

- **Write side (the sync).** `PUT /api/settings/autonomy` (`autonomy/route.ts:30-91`), after computing
  `merged.level`, also recomputes and persists the derived mode into tenant settings:
  ```ts
  const { mode } = deriveApprovalModeFromLevel(merged.level as AutonomyLevel, trustScore.overall);
  await updateTenantSettings(authCtx.tenantId, { agentApprovalMode: mode }); // keep the SSOT cache in sync
  ```
  Now a level change writes the derived mode (req AC-14), so even a consumer that only reads
  `readApprovalMode(settings)` (e.g. a background loop that does not load the autonomy row) sees the new
  posture. `resolveEffectiveMode` + the write-side sync are belt-and-braces: the resolver prefers the
  row when present (instant), the write keeps the cache correct for row-less reads.
- **Read side (consumers).** Chat (`route.ts`) and the background loops obtain the mode via
  `resolveEffectiveMode` when they have (or cheaply load) the level; otherwise `readApprovalMode`
  (unchanged) still returns the synced cache. No consumer reads `autonomy_config.level` to *make* a
  decision — they read it only to *derive the mode* through this one helper (req AC-15).

### 4.4 Migration

- **No schema migration** (both columns exist: `tenant_settings.agentApprovalMode`,
  `autonomy_config.level`).
- **Data backfill (one-shot script, `scripts/cle10-backfill-approval-mode.ts`).** For every
  `autonomy_config` row, compute `deriveApprovalModeFromLevel(level, trustOverall)` and write the mode
  into that tenant's settings. Idempotent (re-running yields the same value). Tenants with no
  `autonomy_config` row are skipped (EC-4 — their stored mode is already authoritative). Pilae
  (`47dca783`): if it has a row at `copilot`/default, the derived mode is `review-each` = its current
  value ⇒ no change (EC-5). The script logs every (tenant, oldMode, newMode) for review.
- **`execution-gate.ts` untouched** (§8): the campaign-engine's per-action `PermissionValue` policy
  (`types.ts:120-142`) still reads the same `autonomy_config` row. CLE-10 unifies only the
  *approval-mode* axis; the send-policy axis is the campaign-engine's and is downstream of the level. A
  comment is added at `execution-gate.ts:31` pointing to this boundary so a future reader does not
  mistake the two axes for the same thing.

---

## 5. Rewires — chat create/update (vocabulary A)

### 5.1 `create.ts` — call `decideAction` (absorbing CLE-00)

**Before** (this tree, `create.ts:28-29,58-71` — pre-CLE-00 form):
```ts
const { tenantId, userId, agentApprovalMode, authCtx } = ctx;
// …
description: agentApprovalMode === "ask" ? "Propose creating…" : "Create…",
execute: async (input) => {
  if (agentApprovalMode === "ask") { return { proposal: true, … }; }
  const [created] = await db.insert(contacts)…
}
```

**After** — one disposition computed per tool from the single authority. Contact create is a
`reversible-mutation` (`mutating:true, reversible:true, outbound:false, cost:free, confirm:never`), so
the matrix (§3) reproduces CLE-00's behaviour exactly:
- `review-each` ⇒ `confirm` ⇒ proposal card (CLE-00 `"proposal"`).
- `auto-high-confidence` + no confidence ⇒ confidence `0 < threshold` ⇒ `confirm`… **except** CLE-00's
  documented choice was `null → execute` to preserve the legacy `"auto"` UX. To keep that exact
  behaviour, chat creates pass `confidence: 1` (a create the user explicitly asked for is high-trust),
  OR — cleaner and what we choose — they treat `execute|<auto>` as immediate. See the adapter below.

```ts
import { decideAction } from "@/lib/guardrails/decide-action";
import { readApprovalMode, type ApprovalModeV2 } from "@/lib/guardrails/approval-mode";
// …
const { tenantId, userId, authCtx } = ctx;
const role = (authCtx.role ?? "member") as "admin" | "member" | "viewer";
const approvalMode = readApprovalMode(ctx.settings); // SSOT (route already synced from level, §4.3)

// Create is a reversible mutation the user explicitly requested → confidence 1 so
// auto-high-confidence executes immediately (preserves the legacy "auto" create UX,
// CLE-00 design §3 rationale). decideAction maps confirm|queue → card, execute → write,
// refuse → no write.
const createDecision = decideAction({
  action: { mutating: true, reversible: true, outbound: false, cost: "free", confirm: "never" },
  approvalMode, role, confidence: 1,
});
const proposeFirst = createDecision.disposition !== "execute"; // confirm|queue → card; refuse handled below
```

Each tool's body:
```ts
description: proposeFirst ? "Propose creating a new contact…" : "Create a new contact…",
execute: async (input) => {
  if (createDecision.disposition === "refuse") {
    return { error: `Cannot create: ${createDecision.reason}.` }; // viewer floor — req AC-1
  }
  if (proposeFirst) {
    return { proposal: true, action: "createContact", entityType: "contact",
             entityName: …, fields: input }; // UNCHANGED card shape — chat-action-cards.tsx keeps working
  }
  const [created] = await db.insert(contacts).values({ tenantId, ...input }).returning();
  await logToolCall({ … }); // unchanged
  return { created: { … } };
}
```

> The proposal object shape (`{ proposal:true, action, entityType, entityName, fields }`) is **unchanged**
> — `chat-action-cards.tsx` and its REST-POST approve path keep working verbatim (CLE-00 design §3). We
> only changed *who computes* the gate (now `decideAction`) and added the explicit `refuse` arm (viewers).
> Repeat for `createAccount` (account create = same reversible-mutation metadata) and `createDeal`.

**If CLE-00 already merged `chatCreateDisposition`** into `approval-mode.ts`: reduce it to a one-line
adapter so there is still one core, and leave its call sites untouched:
```ts
export function chatCreateDisposition(mode: ApprovalModeV2, confidence?: number | null): "proposal" | "execute" {
  const d = decideAction(
    { action: { mutating: true, reversible: true, outbound: false, cost: "free", confirm: "never" },
      approvalMode: mode, role: "member", confidence: confidence ?? 1 });
  return d.disposition === "execute" ? "execute" : "proposal"; // confirm|queue|refuse → card (creates never refuse for member)
}
```
This keeps CLE-00's `create.ts`/prompt call sites green while making `decideAction` the real brain
(belt-and-braces; the direct rewire above is preferred when starting from the pre-CLE-00 tree).

### 5.2 `update.ts`

`update.ts` has **no** create-style proposal branch today (CLE-00 design §3 verified its only
approval-mode code is the `updateWorkspace` settings writer, which legacy-maps on write and is
unrelated). So **no functional change** unless CLE-00/this work adds a create-like proposal to update;
if one is added, it calls `decideAction` the same way (noted; covered by the grep guard, tasks T18).

### 5.3 System prompt

`chat-system-prompt.ts:352` shows the `<approval_mode>` card-flow block when review is required. Per
CLE-00 design §3, the route passes a precomputed `approvalRequiresReview` boolean. CLE-10 keeps that
boolean but computes it from the core: `approvalRequiresReview = createDecision.disposition !== "execute"`
(the exact expression `create.ts` uses), so prompt and tool can never drift (CLE-00's root-cause fix,
preserved).

---

## 6. Rewires — background loops + the one-core delegation (vocabulary B)

### 6.1 `enforceAgentApprovalMode` delegates to `decideAction` (the keystone)

Re-implement the body of `enforceAgentApprovalMode` (`approval-mode.ts:142-179`) to **map → call
`decideAction` → map back**, preserving its signature and its `ApprovalDecision` output so all **9**
call sites stay green (req AC-19/AC-20):

```ts
const GUARDED_ACTION_METADATA: Record<GuardedAction, DecideActionInput["action"]> = {
  "email-send":          { mutating: true, outbound: true,  reversible: false, cost: "free", confirm: "risky"  },
  "email-reply":         { mutating: true, outbound: true,  reversible: false, cost: "free", confirm: "risky"  },
  "contact-create":      { mutating: true, outbound: false, reversible: true,  cost: "free", confirm: "never"  },
  "contact-update":      { mutating: true, outbound: false, reversible: true,  cost: "free", confirm: "never"  },
  "deal-stage-change":   { mutating: true, outbound: false, reversible: true,  cost: "free", confirm: "risky"  },
  "task-create":         { mutating: true, outbound: false, reversible: true,  cost: "free", confirm: "never"  },
  "sequence-enrollment": { mutating: true, outbound: true,  reversible: false, cost: "free", confirm: "always" },
};

export function enforceAgentApprovalMode(input: ApprovalDecisionInput): ApprovalDecision {
  const { mode, action, confidence, learnedThresholds } = input;
  const decision = decideAction(
    { action: GUARDED_ACTION_METADATA[action], approvalMode: mode, role: "member", confidence: confidence ?? undefined },
    { actionKey: action, learnedThresholds },
  );
  // Map the 4-way disposition back to the legacy ApprovalDecision the 9 callers expect.
  switch (decision.disposition) {
    case "execute":
      return { allowed: true, queueAs: null, reason: decision.reason };
    case "queue":
      return { allowed: false, queueAs: "pending-daily-batch", reason: decision.reason };
    case "confirm":
    case "refuse": // background has no viewer; refuse won't occur, but fail safe to per-item review
    default:
      return { allowed: false, queueAs: "pending-per-item", reason: decision.reason };
  }
}
```

Behaviour parity check (tasks T16) — for the previous body vs the new one, across
`mode × action × confidence`:
- `review-each` → previously always `{allowed:false, pending-per-item}`. New: `confirm` → same. ✓
- `batch-daily` → previously always `{allowed:false, pending-daily-batch}`. New: reversible/outbound →
  `queue` → `pending-daily-batch`; `email-*`/`sequence-enrollment` are outbound → `queue` →
  `pending-daily-batch` ✓ (previously also daily-batch). ✓
- `auto-high-confidence` → previously `allowed` iff `confidence ≥ threshold`. New: outbound actions
  (`email-send/reply`, `sequence-enrollment`) → `confirm` → `pending-per-item`. **This is a behaviour
  change for outbound under auto-high-confidence**: previously an `email-send` at `confidence ≥ 0.85`
  was `allowed:true` (silent send). The unified plane makes outbound **always confirm** under autonomy
  (req AC-11) — *intentional and safer* (the audit's whole thesis: never silently fire external sends).
  Non-outbound reversible actions (`contact-*`, `task-create`, `deal-stage-change`) keep the exact
  threshold behaviour. ⚠ **This is the one deliberate divergence** (see §10 Contract tension), gated by
  the fact that prod has `OUTBOUND_TEST_MODE` history and **0 active sequences** (audit §1.3), so no
  live tenant is currently relying on silent auto-send. The existing tests
  (`approval-mode-learned.test.ts`) assert `email-send @0.9 → allowed:true`; **these tests are updated**
  to the new posture (tasks T16) with a comment citing AC-11 — this is a guarded, reviewed change, not
  silent drift.

> Decision recorded: if Martin wants to *preserve* silent auto-send for `email-send`/`email-reply` under
> `auto-high-confidence`, the one-line alternative is to classify those two as
> `reversible:true` in `GUARDED_ACTION_METADATA` so they gate on confidence like a reversible mutation
> (the "undo window" CLE-11 will make that literally true). Flagged in §10 for the checkpoint.

### 6.2 `agent-reactor.ts` — already routes through `enforceAgentApprovalMode`

`agent-reactor.ts:186` already calls `enforceAgentApprovalMode({ mode, action: guardedAction,
confidence })`. Because §6.1 makes that delegate to `decideAction`, the reactor now uses the **same
core** as chat with **zero edit** to the reactor (req AC-19). We additionally thread `learnedThresholds`
if/when available (optional; F005 wiring is CLE-16) — no change required now. We do change one thing for
the level→mode unification: the reactor reads the mode via `resolveEffectiveMode` instead of
`readApprovalMode` so a `strategic` tenant's relaxed thresholds reach the decision. Minimal diff at
`agent-reactor.ts:160-161`:
```ts
const settings = await getTenantSettings(data.tenantId);
const [autoRow] = await db.select({ level: autonomyConfig.level }).from(autonomyConfig)
  .where(eq(autonomyConfig.tenantId, data.tenantId)).limit(1);
const trust = await getTrustScore(data.tenantId);
const { mode } = resolveEffectiveMode({ settings: settings ?? { agentApprovalMode: "review-each" },
  level: autoRow?.level as AutonomyLevel | undefined, trustOverall: trust.overall });
```
(If loading the row per event is too costly, the §4.3 write-side sync already keeps
`settings.agentApprovalMode` current, so the reactor MAY keep `readApprovalMode(settings)` unchanged and
still be correct for the *mode*; the row read only adds the relaxed-threshold flag. Tasks mark this
optional — the cheaper path is acceptable.)

### 6.3 `autonomous-pipeline.ts` — delete the bespoke mapping (the divergence to kill)

`autonomous-pipeline.ts:242-247` re-implements its own `shouldExecute` ternary:
```ts
const shouldExecute =
  approvalMode === "auto-high-confidence" ? d.confidence >= 0.7
  : approvalMode === "batch-daily" ? d.confidence >= 0.9 && d.action !== "SEND_FOLLOWUP"
  : false;
```
This is exactly the divergence CLE-10 kills. **Replace** with a call through the core. The pipeline's
actions map to guarded actions: `SEND_FOLLOWUP/SCHEDULE_MEETING → email-send` (outbound),
`CREATE_TASK → task-create`, `RE_ENGAGE → email-send`, `HOLD → no action`.
```ts
import { enforceAgentApprovalMode } from "@/lib/guardrails/approval-mode";
const guarded =
  d.action === "CREATE_TASK" ? "task-create"
  : "email-send"; // SEND_FOLLOWUP / SCHEDULE_MEETING / RE_ENGAGE are all outbound sends
const gate = enforceAgentApprovalMode({ mode: approvalMode, action: guarded, confidence: d.confidence });
const shouldExecute = gate.allowed;
```
Now the pipeline executes/defers by the **same decision as chat and the reactor** (req AC-19). The
existing branch structure (`CREATE_TASK` insert / `emailDraft` send / else defer) is preserved; only the
`shouldExecute` source changes. The `approvalMode` it reads is upgraded to `resolveEffectiveMode` for
the same reason as §6.2 (it already calls `readApprovalMode` at `:98` — swap to the resolver, loading
the level row inside the per-tenant `step.run`).

> Note: under the new core, `SEND_FOLLOWUP` is outbound ⇒ `auto-high-confidence` returns `confirm` ⇒
> `allowed:false` ⇒ the pipeline defers it (creates the review task) instead of sending. This is the
> same intentional "no silent outbound" posture as §6.1 and is the safer behaviour; the previous code
> already excluded `SEND_FOLLOWUP` from batch-daily auto-exec, so this only tightens auto-high-confidence.

---

## 7. Data flow (after CLE-10)

```
                         autonomy_config.level   (user toggles in /settings/autonomy)
                                   │
                PUT /api/settings/autonomy:  deriveApprovalModeFromLevel(level, trust.overall)
                                   │                         │
                                   │            updateTenantSettings(agentApprovalMode = derived)   ← write-side sync (§4.3)
                                   ▼                         ▼
                       resolveEffectiveMode(settings, level, trust) ────► { mode: ApprovalModeV2, relaxThresholds }
                                   │                                          (single read path — AC-15)
        ┌──────────────────────────┼───────────────────────────────────────────────┐
        ▼                          ▼                                                 ▼
  chat create/update          invokePageAction (CLE-04)                    background loops
   create.ts (§5.1)            page-actions.ts — UNCHANGED                  agent-reactor (§6.2) / autonomous-pipeline (§6.3)
        │                          │                                                 │
        │                          │                                    enforceAgentApprovalMode  (§6.1 delegates)
        └───────────► decideAction(input, extra?) ◄──────────────────────────────────┘
                                   │   THE SINGLE AUTHORITY (§2.1)
              execute │ confirm │ queue │ refuse  + reason
                                   │
   chat: execute→write, confirm/queue→proposal card, refuse→explain (no write)   (EC-6: queue→confirm)
   page action: execute→requireConfirm:false, confirm/queue→requireConfirm:true, refuse→error
   background: execute→allowed:true (run), confirm/refuse→pending-per-item, queue→pending-daily-batch
```

One derivation, one read path, one authority, three caller-specific renderings of the same disposition.

---

## 8. Why capture-approvals (C) is out of scope

`lib/capture/approval.ts` answers **"should we record this observed interaction in the CRM now, or hold
it for a human to approve?"** (`recordCapturedActivity`, `:80-120`). That is an **ingestion / data-trust**
question (the Lightfield half of the mission — human approval of *auto-captured data*). `decideAction`
answers **"should the agent *take* this outbound/mutating action?"** (the action-trust question). They
have different inputs (`CaptureKind` + `sourceRef` + a proposed `activities` row vs action metadata +
role + confidence), different stores (`capture_approvals` vs none/`agent_actions`), different UIs, and
different defaults (`captureApprovalMode` default `auto` vs `agentApprovalMode` default `review-each`).
Merging them would force one knob to mean two things. The audit (§1.3) explicitly lists capture-approvals
as a *correctly-scoped* separate system. CLE-10 leaves it byte-for-byte untouched; the evaluation proves
its tests are unchanged (req eval step 9).

---

## 9. Failure handling

| Failure | Where caught | Outcome |
|---|---|---|
| Unknown stored `agentApprovalMode` | `readApprovalMode` (`approval-mode.ts:58-62`) | coerced to `review-each` before `decideAction`; matrix still safe (EC-1). |
| Unknown `approvalMode` reaches `decideAction` | §2.1 arm 6 | `confirm` (never execute) — AC-21. |
| Malformed `mutating`/`confirm`/`cost` scalar | §2.1 defensive normalization | `mutating→true`, `confirm→"always"`, `cost→"free"` ⇒ a mutating action confirms — AC-21. |
| `confidence` absent under auto-high-confidence | §2.1 (`?? 0`) | below threshold ⇒ `confirm` (EC-2). |
| No `autonomy_config` row | `resolveEffectiveMode` else-branch | falls back to `readApprovalMode(settings)` — no behaviour change (EC-4). |
| `getTrustScore` no row | `trust-score.ts:76-89` returns `overall:50` | strategic relaxation never granted to trustless tenant (EC-7). |
| `decideAction → queue` on a chat/page surface (no batch store) | caller maps `queue→confirm` (§5/§EC-6) | a card, never silent. |
| `decideAction → refuse` in a background loop (no viewer) | §6.1 maps refuse→`pending-per-item` | defers to approval lane; cannot occur (role hard-coded member) but fail-safe. |
| Level/mode drift | `resolveEffectiveMode` prefers level; PUT re-syncs cache | converges to level-derived (EC-3/EC-8). |

**Fail-safe direction throughout**: every defaulting path resolves to `confirm` or `refuse` — never a
silent `execute`. This is the load-bearing security property (req AC-21, CLE-00 "zero silent actions").

---

## 10. Security + contract tension

**Security.**
- `decideAction` is pure (no DB, no IO, no PII — only an enum, metadata scalars, a role, a number). Safe
  to call anywhere, trivially testable, no tenant surface.
- The **viewer floor** (§2.1 arm 0) is the minimal role gate: a viewer can never drive a write/outbound/
  paid action through any surface, even in `auto-high-confidence`. (The full role × action matrix is
  CLE-12; CLE-10 ships the floor.)
- The **paid floor** (§2.1 arm 1) guarantees money is never spent silently or batched, regardless of
  mode (req AC-3) — protects the Twilio-number-purchase / paid-send class.
- The level→mode **write-side sync** means a downgrade (e.g. strategic→copilot) immediately tightens the
  cached `agentApprovalMode` that row-less background readers see; no stale autonomy persists.
- The **strategic relaxation** is gated twice: the route refuses to set `strategic` below trust 80
  (`autonomy/route.ts:40-48`), and `deriveApprovalModeFromLevel` independently refuses to relax below 80
  (§4.2). A forged/stale level cannot unlock relaxed thresholds without trust.

**Contract tensions (flag at checkpoint).**
1. **`decideAction` second argument.** README §3.5bis freezes the *first* argument only. CLE-10 adds an
   optional second `extra` param (F005 thresholds + actionKey). This is additive and keeps every frozen
   call shape valid (AC-18 holds), but it is technically *beyond* the literal §3.5bis surface. If the
   constitution should forbid any extra arg, the fallback (resolve thresholds before calling, §2.1 note)
   keeps the signature at exactly §3.5bis. **Recommend amending README §3.5bis to note the optional
   `extra`** (the cleaner home for threshold logic) — a README amendment per its own change rule (§6).
2. **Outbound under `auto-high-confidence` now confirms (was silent-send).** §6.1 changes
   `enforceAgentApprovalMode` so `email-send`/`email-reply`/`sequence-enrollment` always `confirm` under
   autonomy instead of auto-dispatching at high confidence. This *tightens* behaviour (the audit's
   thesis) and updates `approval-mode-learned.test.ts`. It is the only intentional behaviour change. The
   one-line opt-out (classify those actions `reversible:true`) is documented for Martin if he wants to
   keep silent auto-send pre-CLE-11/undo-window.
3. **`guided → review-each`** (not `batch-daily`). Conservative; the batch lane is universal only after
   CLE-11. Flag for product confirmation (§4.2 note).

---

## 11. Test strategy

- **`decide-action.test.ts` (the matrix test, tasks T13).** Enumerate **every cell** of §3:
  `for (mode of 3) for (class of 6) → assert disposition` + the viewer row (6 classes → refuse/execute)
  + the auto-high-confidence confidence split (thr/¬thr) + AC-13 (`confirm:"always"` at conf 1 →
  confirm) + AC-21 malformed-scalar arms (bad `mutating`/`confirm`/`cost` → confirm). Assert `reason`
  non-empty on every cell. **Compile-time signature parity**: a `satisfies` check that
  `DecideActionInput` equals README §3.5bis. Target: 100% branch coverage of `decide-action.ts`.
- **`approval-mode.delegation.test.ts` (parity, tasks T16).** Build the `(mode × GuardedAction ×
  confidence-grid)` cartesian product; assert the new delegating `enforceAgentApprovalMode` returns the
  same `{allowed, queueAs}` as the documented matrix; explicitly assert the **one intended divergence**
  (outbound under auto-high-confidence → `pending-per-item`) with a comment citing AC-11. Update the two
  affected assertions in `approval-mode-learned.test.ts`.
- **Existing suites green.** `guardrails-approval-mode.test.ts` (review-each/batch-daily/threshold) must
  pass unchanged for non-outbound actions; the outbound rows get the documented update.
- **`chat-create-approval-gate.test.ts` (or extend CLE-00's, tasks T14).** With `review-each`:
  `createContact.execute` → `proposal:true`, no insert (spy). With `auto-high-confidence`: → `created`,
  insert called once. With a **viewer** ctx: → `{ error }` (refuse), no insert. Locks AC-1/AC-4/AC-9 at
  the chat surface and the CLE-00 regression.
- **`invokePageAction` stability (tasks T15).** `page-actions.tools.test.ts` (CLE-04) re-run unchanged;
  a `git diff --stat page-actions.ts` assertion (in `regression.sh`) that the file is untouched (AC-18).
- **Level→mode (tasks T17).** Unit-test `deriveApprovalModeFromLevel` (4 levels × trust 79/80) and
  `resolveEffectiveMode` (row present → derived; row absent → `readApprovalMode`). Integration-ish:
  stub the autonomy `PUT`, assert it writes the derived `agentApprovalMode` (AC-14/AC-15/AC-16).
- **Background (tasks T16/T17).** Unit-test the autonomous-pipeline guarded-action mapping and that
  `shouldExecute === enforceAgentApprovalMode(...).allowed`; grep-assert the bespoke ternary
  (`:242-247`) is gone.
- **Out-of-scope proof.** A test (or `regression.sh` grep) asserting `lib/capture/approval.ts` is
  unmodified and its suite passes.
- **Coverage / hygiene.** 100% of new branches; `tsc --noEmit` 0 errors; no new runtime dependency;
  `regression.sh` green; grep guard that no `agentApprovalMode === "ask"` remains in `lib/chat/tools/**`
  or `lib/prompts/**` (req, finishing CLE-00) and that no caller re-implements an approval-mode ternary
  outside `decide-action.ts` / `approval-mode.ts`.
