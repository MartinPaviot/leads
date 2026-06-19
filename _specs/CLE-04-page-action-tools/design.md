# CLE-04 — Server tools `listPageActions` / `invokePageAction` + plumbing + routing heuristic — Design

> Implements README §3.4 (the two tools), §3.1 (the `invokeAction` directive emitted via CLE-03's builder), §3.5 (the envelope its directives round-trip through), §3.5bis (the `decideAction` stub — verbatim signature, conservative body), §3.6 (the two-tier routing heuristic in the prompt).
> Builds on `_specs/CLE-03-action-directive-and-registry/design.md`: imports `invokeActionDirective` (CLE-03 §2.1), the envelope codec constants `ACTION_RESULT_OPEN`/`ACTION_RESULT_CLOSE` (CLE-03 §2.4), and the manifest types `PageActionManifest`/`PageActionManifestEntry` (CLE-03 §2.2). CLE-03 already serializes the manifest into the POST body (`chat-dock.tsx` `body: () =>`, CLE-03 §2.5); CLE-04 reads it.
> Every type that touches a frozen contract matches the constitution **verbatim**. Anything internal is marked "internal — not in §3".

---

## 1. System fit (where each piece lands, with file:line)

The chat request pipeline already builds tools, resolves capabilities, routes, and assembles the prompt (audit §1.1, `route.ts:602-638`). CLE-03 widened the client command layer by one directive kind and put the page manifest on the wire. CLE-04 widens the **server** side by exactly two tools, threads the manifest into the tool context, and adds two prompt blocks. Nothing else changes.

| Concern | Today | After CLE-04 |
|---|---|---|
| Server tool registry | `lib/chat/tools/index.ts:29-55` — `buildAllChatTools(ctx)` spreads 23 group builders. Pattern for a directive-emitting tool: `lib/chat/tools/navigation.ts:66-206` (`openRecord`/`openListView`/`composeEmail` return `{ ...payload, ...navigateDirective(...) }`). | **NEW** `lib/chat/tools/page-actions.ts` exporting `buildPageActionTools(ctx)` with `listPageActions` (READ) + `invokePageAction` (emits a directive). Spread into `buildAllChatTools` (one import + one spread line). |
| Tool context shape | `lib/chat/tools/context.ts:6-12` — `ToolContext { tenantId, userId, authCtx, settings, agentApprovalMode }`. `makeTool` at `:15-26`. | + `pageActionManifest?: PageActionManifest` on `ToolContext`. The two tools read `ctx.pageActionManifest`. |
| Request body parse | `route.ts:401-418` — destructures `messages, contextType, contextId, surface, threadId` from `req.json()`. | + `pageActions` destructured, typed `PageActionManifest \| undefined`. |
| Tool context build | `route.ts:603-609` — `const toolCtx: ToolContext = { tenantId, userId, authCtx, settings, agentApprovalMode }`. | + `pageActionManifest: pageActions`. |
| Decision authority | None unified yet. CLE-00 added `chatCreateDisposition` (`approval-mode.ts`, the "seam CLE-10 will replace with decideAction"). Background uses `enforceAgentApprovalMode` (`approval-mode.ts:142`). | **NEW** `lib/guardrails/decide-action.ts` — `decideAction(...)` with the verbatim §3.5bis signature, conservative metadata+role body. CLE-10 replaces the body. `invokePageAction` is its first chat-side consumer. |
| Routing groups | `tool-router.ts:37-218` (`TOOL_GROUPS`) + `orchestrator.ts:56-141` (`TOOL_GROUP_MAP`). Navigation/command tools sit in group `"query"` (`tool-router.ts:67-70`). | + `listPageActions: "query"` and `invokePageAction: "action"` in **both** maps. (Rationale §6.) Survives CLE-01's drift-guard. |
| Capability gating | `capability-resolver.ts:164-213`. Viewer allowlist `VIEWER_ALLOWED_GROUPS` (`:127-132`) = `query/briefing/coaching/schema`. `isMutationTool` regex (`:220-224`). `DESTRUCTIVE_TOOLS`/`ADMIN_ONLY_TOOLS`/`PRO_TIER_TOOLS` name-sets. | Add `listPageActions` (group `query`) → viewer-allowed automatically. Add `invokePageAction` to a viewer allow path **as the gateway** (the tool is reachable; per-action refusal is `decideAction`'s job, AC-5/AC-8). Neither is admin-only, destructive-gated, or pro-gated. |
| System prompt | `chat-system-prompt.ts:179-191` `<command_layer>` (two-lever); `:352-363` `<approval_mode>` block (already CLE-00-aware). | + a `<page_actions>` block (the §3.6 heuristic + envelope-reading rules); `<command_layer>` gains a third bullet naming page actions. |

CLE-04 stops at: the two tools exist and are routed/gated, the manifest reaches them, `decideAction` computes `requireConfirm`, the directive is emitted via CLE-03's builder, and the prompt teaches routing + envelope reading. The **client** dispatch + run + round-trip is CLE-03 (already shipped on this branch's dependency).

---

## 2. Exact TypeScript

### 2.1 `lib/guardrails/decide-action.ts` — the stub (README §3.5bis signature verbatim, conservative body)

```ts
/**
 * decideAction — the single decision authority for the Chat Live Executor
 * (README §3.5bis). One function decides whether an action — headless OR a
 * page action — executes directly, shows a confirm card, queues, or is refused.
 *
 * STATUS: CONSERVATIVE STUB (CLE-04). The SIGNATURE below is the frozen contract
 * (README §3.5bis) and MUST NOT change. CLE-10 replaces the BODY with the unified
 * control plane: it will fold in `approvalMode` (review-each/batch-daily/
 * auto-high-confidence) and a real `confidence` signal, and it will absorb
 * CLE-00's `chatCreateDisposition` (approval-mode.ts) so create/update tools,
 * invokePageAction, and the background loops all route through this one function.
 *
 * Until then this stub gates on action METADATA + ROLE only (it accepts
 * `approvalMode`/`confidence` to fix the signature, but does not branch on them).
 * Every defaulting path resolves toward MORE confirmation, never less — the
 * "zero silent actions" posture CLE-00 established.
 *
 * Forward-compat note (see CLE-04 requirements §4): CLE-00 emits the coarser
 * "proposal" | "execute"; this fn emits the richer "execute" | "confirm" | "queue"
 * | "refuse". CLE-10 unifies both onto this output. Mapping: confirm/queue ≈
 * CLE-00 "proposal" (show a card); refuse is a hard stop that CLE-00 did not need
 * (role-gating happened earlier in capability-resolver) but page actions DO need,
 * because the page-action tools are reachable by viewers (the gate must live here).
 */

import type { ApprovalModeV2 } from "@/lib/guardrails/approval-mode";

export type ActionDisposition = "execute" | "confirm" | "queue" | "refuse";

export interface DecideActionInput {
  action: {
    mutating: boolean;
    outbound?: boolean;
    reversible?: boolean;
    cost?: "free" | "credits" | "money";
    confirm: "never" | "risky" | "always";
  };
  approvalMode: ApprovalModeV2; // SSOT via readApprovalMode() — accepted now, branched on in CLE-10
  role: "admin" | "member" | "viewer";
  confidence?: number; // accepted now, branched on in CLE-10/CLE-16
}

export interface DecideActionResult {
  disposition: ActionDisposition;
  reason: string;
}

// Signature matches README §3.5bis as amended by §3.8 (CLE-10/CLE-16): an OPTIONAL 2nd
// arg `extra` is part of the frozen signature. The CLE-04 stub accepts but ignores it
// (CLE-10 fills the body; CLE-16 passes `extra.learnedThresholds`), so the signature never
// changes downstream. Keeping it here makes CLE-04's "signature parity" eval step pass
// against the amended constitution.
export function decideAction(
  input: DecideActionInput,
  _extra?: { actionKey?: string; learnedThresholds?: Record<string, number> },
): DecideActionResult {
  const { action, role } = input;

  // Defensive normalization (CLE-04 requirements E-9): a conformant CLE-03
  // manifest is already typed, but a malformed scalar must fail SAFE.
  const mutating = typeof action.mutating === "boolean" ? action.mutating : true;
  const outbound = action.outbound === true;
  const reversible = action.reversible === true;
  const cost = action.cost ?? "free";
  const confirmPolicy =
    action.confirm === "never" || action.confirm === "risky" || action.confirm === "always"
      ? action.confirm
      : "always"; // unknown → safest

  // 1. Viewer may only drive pure-read actions. Any mutation/outbound → refuse.
  //    (The page-action TOOLS are reachable by viewers — the gate is HERE,
  //    not in capability-resolver. CLE-04 requirements AC-5 / AC-8.)
  if (role === "viewer" && (mutating || outbound)) {
    return {
      disposition: "refuse",
      reason: "role:viewer — read-only; mutating/outbound actions require a member or admin",
    };
  }

  // 2. Spending money is always confirmed, regardless of mode.
  if (outbound && cost === "money") {
    return { disposition: "confirm", reason: "outbound+cost:money — always confirm a paid send" };
  }

  // 3. Any external send is confirmed (under the user's eyes).
  if (outbound) {
    return { disposition: "confirm", reason: "outbound — confirm external send" };
  }

  // 4. Irreversible mutation is always confirmed.
  if (mutating && !reversible) {
    return { disposition: "confirm", reason: "mutating+!reversible — confirm irreversible change" };
  }

  // 5. Reversible mutation honours the action's own confirm policy.
  if (mutating && reversible) {
    if (confirmPolicy === "always" || confirmPolicy === "risky") {
      return { disposition: "confirm", reason: `mutating+reversible, confirm:${confirmPolicy}` };
    }
    return { disposition: "execute", reason: "mutating+reversible, confirm:never — safe to execute" };
  }

  // 6. Pure read (filters, view toggles): execute. Allowed even for viewers.
  return { disposition: "execute", reason: "read-only action — execute" };
}
```

> The stub never returns `queue` itself (no chat-side batch store exists pre-CLE-11); `queue` is in the union because CLE-10 will use it under `batch-daily`. `invokePageAction` (§2.3) handles `queue` defensively anyway (E-5).

### 2.2 `lib/chat/tools/context.ts` — extend `ToolContext`

```ts
import type { AuthContext } from "@/lib/auth/auth-utils";
import type { TenantSettings } from "@/lib/config/tenant-settings";
import type { PageActionManifest } from "@/lib/chat/page-actions/types"; // CLE-03 type
import { tool } from "ai";
import { z } from "zod";

export interface ToolContext {
  tenantId: string;
  userId: string;
  authCtx: AuthContext;
  settings: TenantSettings;
  agentApprovalMode: string;
  /**
   * CLE-04: the current page's action manifest, as posted in the request body
   * (`pageActions`, plumbed by CLE-03's dock). Absent off-web (Slack/MCP) or on
   * the /chat page (no dock). `listPageActions`/`invokePageAction` read it.
   */
  pageActionManifest?: PageActionManifest;
}
// makeTool unchanged (context.ts:15-26)
```

> Import is a `type` import → no runtime coupling, no cycle (the registry module is `"use client"`; the type file `lib/chat/page-actions/types.ts` is pure types per CLE-03 §2.2).

### 2.3 `lib/chat/tools/page-actions.ts` — the two tools (NEW)

```ts
/**
 * Page Action tools — the SERVER half of the Page Action Registry (README §3.4).
 *
 * The page (client) declares its native actions via CLE-03's useRegisterPageActions;
 * the dock serializes them into the POST body (`pageActions`); the route threads them
 * into ToolContext.pageActionManifest. These two tools let the model:
 *   - listPageActions()                : SEE what the current page can do (READ).
 *   - invokePageAction(actionId,params): emit an invokeAction DIRECTIVE for the client
 *                                        to run on the live page. NEVER mutates here.
 *
 * decideAction (CLE-04 stub; CLE-10 unifies) computes requireConfirm. The real run +
 * result round-trip is CLE-03's client dispatch (runRegisteredAction → [[action-result]]).
 */

import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { invokeActionDirective } from "@/lib/chat/ui-directives"; // CLE-03 §2.1 builder
import { decideAction } from "@/lib/guardrails/decide-action";
import { readApprovalMode } from "@/lib/guardrails/approval-mode";
import { jsonSchemaToZod } from "@/lib/chat/page-actions/manifest-validate"; // internal — see §2.4
import type { PageActionManifestEntry } from "@/lib/chat/page-actions/types";

/** Internal — hard cap so a runaway manifest can't blow the LLM context budget. */
const MANIFEST_HARD_ENTRY_CAP = 60;

function findEntry(
  manifest: PageActionManifestEntry[] | undefined,
  actionId: string,
): PageActionManifestEntry | undefined {
  return manifest?.find((e) => e.id === actionId);
}

export function buildPageActionTools(ctx: ToolContext) {
  const manifest = ctx.pageActionManifest;
  const role = (ctx.authCtx.role ?? "member") as "admin" | "member" | "viewer";
  const approvalMode = readApprovalMode(ctx.settings); // ApprovalModeV2 (SSOT)

  return {
    listPageActions: makeTool({
      description:
        "List the actions the CURRENT page can perform right now (filters, view toggles, " +
        "stage moves, bulk operations, etc.) — what you can do live on the page the user is " +
        "looking at. READ-only; it changes nothing. Call this before invokePageAction when " +
        "you intend to act on the current page. If it returns no actions, you are off-web " +
        "(Slack/MCP) or on a page that declares none — use a headless tool instead.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!manifest || manifest.length === 0) {
          return {
            actions: [],
            note:
              "No page is attached to this session (off-web, or this page declares no actions). " +
              "Use headless tools to act; page actions are unavailable here.",
          };
        }
        // E-3: over-budget manifest → trim schemas, keep ids/titles/descriptions.
        if (manifest.length > MANIFEST_HARD_ENTRY_CAP) {
          return {
            actions: manifest.slice(0, MANIFEST_HARD_ENTRY_CAP).map((e) => ({
              id: e.id, title: e.title, description: e.description,
              mutating: e.mutating, outbound: e.outbound, reversible: e.reversible,
              cost: e.cost, confirm: e.confirm,
            })),
            truncated: true,
            note:
              `This page declares ${manifest.length} actions (over the per-turn cap). Schemas were ` +
              "omitted. Call invokePageAction with the action id you want; its params will be validated.",
          };
        }
        return {
          actions: manifest.map((e) => ({
            id: e.id, title: e.title, description: e.description,
            paramsJsonSchema: e.paramsJsonSchema,
            mutating: e.mutating, outbound: e.outbound, reversible: e.reversible,
            cost: e.cost, confirm: e.confirm,
          })),
        };
      },
    }),

    invokePageAction: makeTool({
      description:
        "Invoke a named action on the CURRENT page (e.g. apply a filter, move a deal to a stage, " +
        "run a bulk operation) so the user SEES it happen live. Pass the action's `id` (from " +
        "listPageActions) and `params` matching its schema. This does NOT mutate data here — it " +
        "asks the page to run its own handler. If the action is mutating/outbound, it may require " +
        "the user's confirmation first (handled by the UI). Only ids the current page declared can " +
        "be invoked; anything else is refused.",
      inputSchema: z.object({
        actionId: z.string().describe("The page action id, e.g. 'opportunities.moveStage'."),
        params: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Parameters for the action, matching its paramsJsonSchema. Omit if none."),
      }),
      execute: async (input) => {
        const actionId = input.actionId;
        const params = (input.params ?? {}) as Record<string, unknown>; // E-7

        // AC-6 / E-6: no manifest (off-web) OR empty → refuse cleanly, no directive.
        if (!manifest || manifest.length === 0) {
          return {
            error:
              "No page is attached to this session, so there are no page actions to invoke. " +
              "Use a headless tool instead.",
          };
        }

        // AC-3 / E-1: unknown id → refuse + list what's available, no directive.
        const entry = findEntry(manifest, actionId);
        if (!entry) {
          return {
            error: `No action "${actionId}" is available on this page.`,
            availableActionIds: manifest.map((e) => e.id),
          };
        }

        // AC-4 / E-2: re-validate params SERVER-side against the manifest's JSON Schema.
        // (The client re-validates against the LIVE Zod schema before run — CLE-03 §2.3.)
        const schema = jsonSchemaToZod(entry.paramsJsonSchema);
        const parsed = schema.safeParse(params);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const where = issue?.path?.join(".") || "params";
          return {
            error: `Invalid parameters for "${actionId}": ${issue?.message ?? "validation failed"} (${where}).`,
          };
        }

        // AC-2 / AC-5 / AC-7: the single decision authority computes the disposition.
        const decision = decideAction({
          action: {
            mutating: entry.mutating,
            outbound: entry.outbound,
            reversible: entry.reversible,
            cost: entry.cost,
            confirm: entry.confirm,
          },
          approvalMode,
          role,
        });

        if (decision.disposition === "refuse") {
          return { error: `Cannot run "${actionId}": ${decision.reason}.` };
        }

        // execute → requireConfirm:false; confirm/queue → requireConfirm:true.
        const requireConfirm = decision.disposition !== "execute";
        const invocationId = crypto.randomUUID(); // decided once at the emit site (CLE-03 §2.1)

        return {
          invoked: {
            actionId,
            title: entry.title,
            requireConfirm,
            queued: decision.disposition === "queue", // E-5 note for the model
            reason: decision.reason,
          },
          ...invokeActionDirective(invocationId, actionId, parsed.data as Record<string, unknown>, requireConfirm),
        };
      },
    }),
  };
}
```

> `invokePageAction` returns a directive **only** on `execute`/`confirm`/`queue`. Refusal / unknown-id / bad-params return a plain `{ error }` object with **no** `_uiDirective` key — the client's `parseUiToolParts` (`tool-call-panel.tsx:478`) finds no directive and dispatches nothing (AC-3/AC-4/AC-5/AC-6 satisfied at the wire level).

### 2.4 `lib/chat/page-actions/manifest-validate.ts` — server-side JSON-Schema → Zod (NEW, internal)

The manifest carries `paramsJsonSchema` (JSON Schema, produced by CLE-03's `z.toJSONSchema`, CLE-03 §4) — **not** a Zod object (the `run`/Zod are stripped for serialization). To re-validate server-side (AC-4) we need to check params against that JSON Schema. Choice and rationale:

**Choice: a small, owned JSON-Schema validator that covers the subset CLE-06+ pages use (`z.object` of primitives / enums / arrays / optionals).** Justification (Layer-1/Layer-3 doctrine):
- The manifest schema is the *deterministic output of `z.toJSONSchema`* (draft 2020-12) for plain `z.object` param schemas — a known, narrow shape (CLE-03 §4 constrains pages to serializable `z.object`). We do **not** need a general JSON-Schema engine.
- **Why not `ajv`?** It is a heavy new runtime dependency for a tiny, known subset, and it validates JSON Schema but does not give us a Zod object. Adding it duplicates capability we can express in ~60 lines.
- **Why not round-trip back to Zod?** Zod 4 ships `z.toJSONSchema` but **not** a stable `fromJSONSchema`. So we cannot reconstruct the exact Zod object the page holds. We therefore validate structurally against the JSON Schema directly.

```ts
import { z } from "zod";

/**
 * Build a permissive Zod validator from the JSON Schema of a manifest entry.
 * Covers the subset z.toJSONSchema emits for plain z.object param schemas
 * (object with typed properties + `required` + enums + arrays + nested objects).
 * Unknown/unsupported constructs degrade to z.unknown() (accept) — server-side
 * validation is the FIRST of two gates; the client re-validates against the LIVE
 * Zod schema (CLE-03 §2.3), so a permissive server gate cannot let a bad call run.
 */
export function jsonSchemaToZod(schema: unknown): z.ZodType {
  if (!isObject(schema)) return z.unknown();
  const type = schema["type"];

  if (type === "object" || isObject(schema["properties"])) {
    const props = (schema["properties"] as Record<string, unknown>) ?? {};
    const required = new Set(Array.isArray(schema["required"]) ? (schema["required"] as string[]) : []);
    const shape: Record<string, z.ZodType> = {};
    for (const [key, propSchema] of Object.entries(props)) {
      let zt = jsonSchemaToZod(propSchema);
      if (!required.has(key)) zt = zt.optional();
      shape[key] = zt;
    }
    // additionalProperties:false in the emitted schema → strict; default passthrough
    // is fine here because the client gate is authoritative on shape.
    return z.object(shape);
  }

  if (Array.isArray(schema["enum"])) {
    return z.enum(schema["enum"] as [string, ...string[]]);
  }
  if (type === "array") {
    return z.array(jsonSchemaToZod(schema["items"]));
  }
  switch (type) {
    case "string": return z.string();
    case "number":
    case "integer": return z.number();
    case "boolean": return z.boolean();
    case "null": return z.null();
    default: return z.unknown();
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
```

> This is internal (not a §3 contract). Its only job is the AC-4 server gate. The authoritative shape check is the client's live-Zod `safeParse` (CLE-03 §2.3); E-2 documents the two-gate posture.

### 2.5 `lib/chat/tools/index.ts` — register the two tools

```ts
import { buildPageActionTools } from "./page-actions";
// ...
export function buildAllChatTools(ctx: ToolContext) {
  return {
    ...buildSchemaTools(ctx),
    // ... existing 23 builders unchanged ...
    ...buildKnowledgeTools(ctx),
    ...buildPageActionTools(ctx), // CLE-04: listPageActions + invokePageAction
  };
}
```

### 2.6 `route.ts` — body parse + thread into `ToolContext` (2 small edits)

**Body destructure** (extends `route.ts:401-418`):
```ts
import type { PageActionManifest } from "@/lib/chat/page-actions/types";
// ...
const {
  messages,
  contextType,
  contextId,
  surface: surfaceInput,
  threadId,
  pageActions, // CLE-04: the current page's action manifest (CLE-03 put it on the wire)
}: {
  messages: UIMessage[];
  contextType?: string;
  contextId?: string;
  surface?: SurfaceContext;
  threadId?: string;
  pageActions?: PageActionManifest; // CLE-03 §2.2 type; absent off-web / on /chat
} = await req.json();
```

**Tool context build** (extends `route.ts:603-609`):
```ts
const toolCtx: ToolContext = {
  tenantId,
  userId: authCtx.appUserId,
  authCtx,
  settings: tenantSettings,
  agentApprovalMode,
  pageActionManifest: pageActions, // CLE-04
};
```

No other route change. The manifest is untrusted input from the client — it carries only **descriptors** (ids, titles, JSON Schemas, policy scalars), never handlers or tenant rows, so it is safe to thread through (security §7).

### 2.7 `capability-resolver.ts` — let the two tools through (gateway, not per-tool gate)

No code edit is strictly required for `listPageActions` once it is grouped `"query"` (it becomes viewer-allowed automatically via `VIEWER_ALLOWED_GROUPS`, `:127-132`, and is not in any deny set). For `invokePageAction`, the explicit requirement (AC-8) is that the **tool stays reachable** (per-action gating is `decideAction`'s job). Two facts make this true already, but we make the viewer case explicit and tested:

- `invokePageAction` is **not** in `ADMIN_ONLY_TOOLS`, `DESTRUCTIVE_TOOLS`, or `PRO_TIER_TOOLS` → it passes those gates for member/admin.
- For **viewers**, the fail-closed allowlist (`isViewerAllowedTool`, `:149-153`) requires the tool's group ∈ `VIEWER_ALLOWED_GROUPS`. We place `invokePageAction` in group `"action"` (§2.8) which is **not** viewer-allowed — so by default a viewer would be denied the tool. That contradicts AC-8 (the tool must be reachable; refusal must come from `decideAction` so the *reason* is correct, not a blanket "no tools"). **Fix:** add `invokePageAction` to a dedicated viewer-allow exception, the mirror of the existing `VIEWER_DENIED_TOOLS` set:

```ts
/**
 * Tools that are reachable by viewers even though their group is not in
 * VIEWER_ALLOWED_GROUPS, because per-action gating happens downstream.
 * invokePageAction is the gateway to page actions; it refuses mutating/outbound
 * actions for viewers INSIDE the tool via decideAction (CLE-04 AC-5/AC-8), so a
 * viewer can still drive read-only page actions (applyFilter, toggleView).
 */
export const VIEWER_GATEWAY_TOOLS = new Set<string>([
  "invokePageAction",
]);

export function isViewerAllowedTool(name: string): boolean {
  if (VIEWER_DENIED_TOOLS.has(name)) return false;
  if (VIEWER_GATEWAY_TOOLS.has(name)) return true; // CLE-04 — gateway, gated per-action
  const group = getToolGroup(name);
  return !!group && VIEWER_ALLOWED_GROUPS.has(group);
}
```

> This is the minimal, surgical change. It keeps the "fail-closed for viewers" default for everything else and makes the page-action gateway the single, documented exception — exactly the model CLE-12 will generalize into the unified permission matrix.

### 2.8 `tool-router.ts` + `orchestrator.ts` — group the two tools (coordinates with CLE-01 drift-guard)

`tool-router.ts` `TOOL_GROUPS` (`:37-218`), near the navigation/command-layer block (`:67-77`):
```ts
  // page actions (page-actions.ts) — listPageActions discovers what the current
  // page can do (read, always-available like the command layer); invokePageAction
  // emits the directive (an "action" so the action-intent router includes it).
  listPageActions: "query",
  invokePageAction: "action",
```

`orchestrator.ts` `TOOL_GROUP_MAP` (`:56-141`, kept in sync per its own header comment `:51-54`):
```ts
  // page actions
  listPageActions: "query", invokePageAction: "action",
```

Group choices, justified:
- `listPageActions` → `"query"`: it is read-only and should be available on essentially every turn (like `openRecord`/`openListView`/`composeEmail`, all `"query"`, `:67-70`). `"query"` is in `ALWAYS_INCLUDED` (`tool-router.ts:405`) so the model can always discover page actions. Also makes it viewer-allowed (§2.7).
- `invokePageAction` → `"action"`: invocation is an action; the action-intent patterns (`tool-router.ts:319-337`: send/email/sequence/… plus the default set including `"action"`, `:402`) surface it when the user expresses intent to *do* something. The orchestrator's `outreach`/`deal`/`admin` specialists include `"action"` (`orchestrator.ts:46-48`), so on-page action intents route correctly.

**CLE-01 coordination:** CLE-01 adds a drift-guard test asserting every tool in `buildAllChatTools` belongs to a group in `TOOL_GROUPS`. Because CLE-04 adds the two tools to `buildAllChatTools` (§2.5) **and** to both group maps (here), that guard stays green. If CLE-04 lands before CLE-01, the two tools simply fail-open (unknown → included, `tool-router.ts:473`); once CLE-01 lands, they must be in the map — which they are. Either order is safe; the spec wires the map entries so there is never a window of orphaned tools.

### 2.9 `chat-system-prompt.ts` — the §3.6 heuristic, envelope-reading, and the third command-layer lever

Import the frozen envelope tags from CLE-03 so the prompt text references the exact strings the client emits (no drift between what the client writes and what the model is taught to read):
```ts
import { ACTION_RESULT_OPEN, ACTION_RESULT_CLOSE } from "@/components/chat/use-ui-directives"; // CLE-03 §2.4
```

> Note: these constants live in a `"use client"` module (`use-ui-directives.ts`). They are plain string consts (no React), so a server module may import them for their *value*. If a bundler boundary makes that awkward, the fallback (recorded here, no contract change) is to re-export the two constants from a tiny pure module `lib/chat/page-actions/result-tags.ts` that both `use-ui-directives.ts` and the prompt import. CLE-03 owns the canonical definition either way; CLE-04 must not redefine the literals.

**Extend `<command_layer>`** (`chat-system-prompt.ts:179-191`) — add a third bullet after the `composeEmail` bullet (`:184`):
```
- invokePageAction(actionId, params) — runs one of the CURRENT page's own actions live, so the user SEES it happen (apply a filter, move a deal to a stage, toggle a view, run a bulk op). First call listPageActions to see what this page offers; then invoke by id with matching params. Use this for the native flow of the page the user is on — NOT for mass/cross-entity/background work (those are headless tools). It does not mutate directly; mutating or outbound actions may pop a confirm card first.
```

**New `<page_actions>` block** (insert after `</command_layer>`, before `<multi_step_orchestration>` at `:193`). This is the §3.6 heuristic + the envelope contract:
```
<page_actions>
You can act LIVE on the page the user is looking at. Each rich page declares its own actions; listPageActions shows them, invokePageAction runs one.

Two-tier routing — choose the right hand for the job (README §3.6):
- The user is ON the surface AND wants its native flow ("filter this list to fintech", "move this deal to Won", "select all and enrich") → use a PAGE ACTION (listPageActions, then invokePageAction). They see it happen.
- Mass / multi-entity / off-page / background work ("enrich every account in France", "summarize my pipeline", "build a TAM") → use a HEADLESS tool. No page action needed.
- Mutating or outbound page actions are gated centrally. Never assume one executed: invokePageAction returns whether it ran or needs confirmation. If it needs confirmation, tell the user a card is up for them to approve — do not re-issue it.
- Off-web (Slack / external client) or a page that declares nothing: listPageActions returns an empty list. Do NOT pretend to act on the page — use a headless tool and keep your written answer self-sufficient.

Reading the result of a page action:
- After a page action runs on the client, its outcome comes back as a single message wrapped in ${ACTION_RESULT_OPEN} … ${ACTION_RESULT_CLOSE} containing JSON: { invocationId, ok, summary, data?, error? }.
- Match invocationId to the action you invoked. Treat `summary` as the human-readable outcome, `ok` as success/failure, `error` as the failure reason. If ok is false, explain briefly and offer a recovery (e.g. a headless alternative). Then continue the task. Do not echo the raw tags back to the user.
</page_actions>
```

The block is unconditional (unlike the mode-gated `<approval_mode>` block at `:352`) — page actions are always part of the model's repertoire; whether they are *available this turn* is signalled by `listPageActions` returning entries or an empty list.

---

## 3. Data flow (model → tools → directive → CLE-03 client → envelope → model)

```
            ┌──────────────────────────────── SERVER (CLE-04) ───────────────────────────────┐
 user msg ─▶│ POST /api/chat                                                                   │
 body.pageActions (CLE-03 wire) ─▶ route.ts:401-418 destructure `pageActions: PageActionManifest`│
            │                       route.ts:603-609 toolCtx.pageActionManifest = pageActions   │
            │                                                                                    │
            │ model calls listPageActions()  ──▶ returns ctx.pageActionManifest entries (READ)   │
            │                                    (empty + note if absent — AC-1/AC-6)            │
            │                                                                                    │
            │ model calls invokePageAction({actionId, params})                                  │
            │   • entry = manifest.find(id)        → none?  → { error, availableActionIds }  (AC-3)│
            │   • jsonSchemaToZod(entry).safeParse → fail?  → { error }                       (AC-4)│
            │   • decideAction({action:entry scalars, approvalMode, role})                        │
            │        → "refuse" → { error: reason }                                          (AC-5)│
            │        → "execute"/"confirm"/"queue" → requireConfirm = disposition!=="execute"     │
            │   • invocationId = crypto.randomUUID()                                              │
            │   • return { invoked, ...invokeActionDirective(invocationId, actionId, params, rc) } │
            └───────────────────────────────────────────┬────────────────────────────────────────┘
                                                         │ tool result carries _uiDirective (CLE-03 §3.1)
                                                         ▼
            ┌────────────────────────────── CLIENT (CLE-03, already shipped) ────────────────────┐
            │ parseUiToolParts (tool-call-panel.tsx:478) → parseUiDirective (ui-directives.ts)     │
            │   → { kind:"invokeAction", invocationId, actionId, params, requireConfirm }          │
            │ runUiDirective (use-ui-directives.ts) invokeAction arm:                              │
            │   • requireConfirm? → CLE-05 confirm card → on approve → runRegisteredAction          │
            │   • else            → runRegisteredAction(actionId, params) on the LIVE page          │
            │   → encodeActionResult(invocationId, result) → chat.sendMessage(                       │
            │        "[[action-result]]{invocationId,ok,summary,data?,error?}[[/action-result]]")    │
            └───────────────────────────────────────────┬────────────────────────────────────────┘
                                                         ▼
            next POST /api/chat carries the tagged envelope as a user turn
            → model (taught by CLE-04's <page_actions> block) reads invocationId+ok+summary → chains
```

The boundary is clean: CLE-04 owns everything from `route.ts` body-parse through emitting the directive; CLE-03 owns parse → run → round-trip; CLE-04 owns teaching the model to read what comes back.

---

## 4. Failure handling (every branch returns a result object; nothing throws)

| Failure | Where caught | Outcome |
|---|---|---|
| No manifest (off-web / `/chat`) | `listPageActions` / `invokePageAction` first guard (§2.3) | `listPageActions` → `{ actions: [], note }`; `invokePageAction` → `{ error }`. No directive. No throw. (AC-6) |
| Unknown `actionId` | `invokePageAction` `findEntry` miss (§2.3) | `{ error, availableActionIds }`, no directive. (AC-3 / E-1) |
| Params fail manifest schema | `invokePageAction` `safeParse` (§2.3) | `{ error: "Invalid parameters…" }`, no directive, `decideAction` not consulted. (AC-4) |
| Viewer + mutating/outbound | `decideAction` → `refuse` (§2.1) | `invokePageAction` → `{ error: reason }`, no directive. (AC-5) |
| `decideAction` → `queue` | `invokePageAction` maps `queue` → `requireConfirm:true` (§2.3) | Directive emitted + `invoked.queued: true`; model tells user it's up for review. Never silent-execute. (E-5) |
| Over-budget manifest | `listPageActions` hard cap (§2.3) | Trimmed (schema-omitted) view + note; no throw. (E-3) |
| `params` omitted | `invokePageAction` `?? {}` (§2.3) | Validated as `{}`; fails only if schema has required fields → AC-4 error. (E-7) |
| Malformed manifest scalar | `decideAction` defensive normalization (§2.1) | Treated as fail-safe (`mutating→true`, unknown `confirm→"always"`) → `confirm`. (E-9) |
| Manifest huge enough to threaten LLM budget | `allocateContextBudget` (`route.ts:676`) already trims tool defs/messages; `listPageActions` hard cap is the upstream guard | Existing budget manager + the cap keep the turn within budget. |
| Client-side run throws / schema drift | CLE-03's `runRegisteredAction` try/catch + live-Zod gate (CLE-03 §2.3) | `{ ok:false, error }` round-trips; the model reads it and recovers. CLE-04 emits the directive; the client owns run-time failure. (E-2) |

---

## 5. Security

- **No actionId outside the manifest can be invoked.** `invokePageAction` resolves `actionId` against `ctx.pageActionManifest` only; an unknown id returns an error (AC-3). The id is a key into a descriptor list, never a code reference — no `eval`, no dynamic import, no DOM-by-vision (the audit's rejected "computer-use" path, README doctrine §3, is not introduced). The directive carries the same `actionId`; the client (CLE-03 §7) likewise resolves it only against *its* mounted registry — double containment.
- **Params re-validated server-side** against the manifest entry's JSON Schema (`jsonSchemaToZod` + `safeParse`, §2.4) **before** any directive is emitted, *independently* of the client's live-Zod gate (CLE-03 §2.3). Defense in depth: an attacker-influenced model output with malformed params is rejected at the server gate; even if it weren't, the client gate rejects before `run`.
- **`decideAction` gates mutation/outbound.** Viewers cannot drive mutating/outbound actions (AC-5); irreversible and outbound (esp. paid) actions always require confirmation (§2.1). The page-action *tools* are reachable by all non-restricted roles (so the *reason* surfaced is correct), but the *capability to mutate* is gated centrally — the README §1.4 "one control plane" principle, partially realized here and unified in CLE-10/CLE-12.
- **Manifest is untrusted client input, but low-blast-radius.** It contains only descriptors (ids/titles/descriptions/JSON Schemas/policy scalars) — no handlers, no tenant rows, no secrets. Threading it through `ToolContext` adds no DB read and no tenant surface. A forged manifest can at most cause the model to *attempt* an `invokePageAction` whose `actionId` the **real** client registry does not contain → CLE-03 returns `action_not_registered` → no effect. The forged `confirm`/`mutating` scalars only ever make `decideAction` *more* restrictive in the fail-safe direction (E-9); a forger cannot use them to *lower* the confirmation bar below the action's true risk, because the client also runs only handlers it itself registered with their true policy (CLE-05 confirm UX reads `requireConfirm` from the directive, and CLE-11 will log the *actual* run).
- **Tenant / role.** `ctx.authCtx` (existing) carries the authenticated `role` and `tenantId`; `decideAction` reads `role`; `readApprovalMode(ctx.settings)` reads the tenant's mode. No new auth surface. Tenant isolation is unaffected (the tools read no DB).
- **Fail-safe direction throughout.** Every defaulting path (no manifest, unknown id, bad params, malformed scalar, unknown disposition) resolves toward *no action* or *confirmation*, never toward silent execution — consistent with CLE-00's "zero silent actions" and CLAUDE.md "boil lakes" completeness.

---

## 6. Test strategy

Pure logic is unit-tested with **vitest**; no live server, no Playwright (CLE-04 ships no real page — tests build `ToolContext` with a fixture manifest and invoke the tools' `execute` directly, the same pattern CLE-00's `chat-create-approval-gate.test.ts` uses).

- **`decide-action.test.ts`** — table-test the full §4 matrix: viewer+mutating→`refuse`; viewer+read→`execute`; outbound+money→`confirm`; outbound→`confirm`; mutating+!reversible→`confirm`; mutating+reversible+`confirm:"never"`→`execute`; +`"risky"`/`"always"`→`confirm`; pure-read→`execute`; malformed scalar→`confirm`. Assert the `reason` string is non-empty. **Signature-parity assertion**: a `satisfies`/compile-time check that `DecideActionInput` matches README §3.5bis (caught by `tsc`).
- **`page-actions.tools.test.ts`** — fixture manifest with entries `accounts.applyFilter` (`mutating:false, reversible:true, confirm:"never"`, schema `{ industry?: string, minScore?: number }`), `opportunities.moveStage` (`mutating:true, reversible:true, confirm:"risky"`, schema requires `dealId`,`stage`), `accounts.delete` (`mutating:true, reversible:false`), `sequences.launch` (`outbound:true, cost:"money"`).
  - `listPageActions` with manifest → returns all entries with scalars + schema; with `undefined` → empty + note (AC-1/AC-6).
  - `invokePageAction("accounts.applyFilter", {industry:"fintech"})` → result has `_uiDirective.kind==="invokeAction"`, `requireConfirm:false`, uuid `invocationId`; **no DB write** (assert no db import is called — the tool has none).
  - **`invokePageAction("nope.nope", {})` → `{ error, availableActionIds }`, NO `_uiDirective` key.** *(required test: refuse unknown actionId.)*
  - `invokePageAction("accounts.applyFilter", { minScore: "high" })` → `{ error }` mentioning `minScore`, no directive; spy on `decideAction` **not** called (AC-4).
  - **`requireConfirm` reflects `decideAction`:** `opportunities.moveStage`→ but it's reversible+risky → `requireConfirm:true`; `accounts.delete`→`true`; `sequences.launch`→`true`; `accounts.applyFilter`→`false`. *(required test: requireConfirm reflects decideAction.)*
  - Viewer ctx + `accounts.delete` → `{ error }` (refuse), no directive; viewer + `accounts.applyFilter` → directive, `requireConfirm:false` (AC-5).
  - Over-cap manifest (>60 entries) → `listPageActions` returns trimmed + `truncated:true` (E-3).
- **`manifest-validate.test.ts`** — `jsonSchemaToZod` on the JSON Schema `z.toJSONSchema(z.object({ a: z.string(), b: z.number().optional() }))` accepts `{a:"x"}`, rejects `{}` (missing `a`), accepts `{a:"x", b:2}`, rejects `{a:"x", b:"y"}`; enum schema accepts a valid member and rejects others; unknown construct → `z.unknown()` accepts anything.
- **Routing/gating (`page-actions.routing.test.ts`)** — assert `getToolGroup("listPageActions")==="query"` and `getToolGroup("invokePageAction")==="action"`; assert the orchestrator `TOOL_GROUP_MAP` agrees; assert `resolveCapabilities` keeps both for `member`/`admin`, keeps `listPageActions` (group query) and `invokePageAction` (VIEWER_GATEWAY_TOOLS) for `viewer`; assert `isViewerAllowedTool("invokePageAction")` is true. Confirm a `buildAllChatTools(ctx)` snapshot contains both names (the CLE-01 drift-guard will consume this).
- **Prompt addendum (`chat-system-prompt.test.ts` extension)** — build the prompt; assert it contains the §3.6 markers ("Two-tier routing", "invokePageAction", "Off-web"), the envelope tags (`ACTION_RESULT_OPEN`/`ACTION_RESULT_CLOSE` literal values), and that `<command_layer>` now mentions `invokePageAction`.
- **Route plumbing (`chat-route-pageactions.test.ts` or inspection)** — a focused test (or typed inspection) that the POST body type includes `pageActions?: PageActionManifest` and that it reaches `toolCtx.pageActionManifest`. If a full route test is heavy, assert via a thin extracted helper or a typed fixture that `buildPageActionTools` reads `ctx.pageActionManifest`.

Coverage target: 100% of the new branches in `decide-action.ts`, `page-actions.ts` (both tools, every guard), and `manifest-validate.ts`. `tsc --noEmit` 0 errors. No new runtime dependency (no `ajv`). `regression.sh` green. CLE-03's existing tests untouched and green.
