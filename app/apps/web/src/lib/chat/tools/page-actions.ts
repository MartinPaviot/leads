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
import { invokeActionDirective } from "@/lib/chat/ui-directives"; // CLE-03 builder
import { decideAction } from "@/lib/guardrails/decide-action";
import { readApprovalMode } from "@/lib/guardrails/approval-mode";
import { capabilityForPageAction, hasPermission } from "@/lib/auth/permissions";
import { jsonSchemaToZod } from "@/lib/chat/page-actions/manifest-validate";
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
        // Over-budget manifest → trim schemas, keep ids/titles/descriptions.
        if (manifest.length > MANIFEST_HARD_ENTRY_CAP) {
          return {
            actions: manifest.slice(0, MANIFEST_HARD_ENTRY_CAP).map((e) => ({
              id: e.id,
              title: e.title,
              description: e.description,
              mutating: e.mutating,
              outbound: e.outbound,
              reversible: e.reversible,
              cost: e.cost,
              confirm: e.confirm,
            })),
            truncated: true,
            note:
              `This page declares ${manifest.length} actions (over the per-turn cap). Schemas were ` +
              "omitted. Call invokePageAction with the action id you want; its params will be validated.",
          };
        }
        return {
          actions: manifest.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description,
            paramsJsonSchema: e.paramsJsonSchema,
            mutating: e.mutating,
            outbound: e.outbound,
            reversible: e.reversible,
            cost: e.cost,
            confirm: e.confirm,
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
        const params = (input.params ?? {}) as Record<string, unknown>;

        // No manifest (off-web) OR empty → refuse cleanly, no directive.
        if (!manifest || manifest.length === 0) {
          return {
            error:
              "No page is attached to this session, so there are no page actions to invoke. " +
              "Use a headless tool instead.",
          };
        }

        // Unknown id → refuse + list what's available, no directive.
        const entry = findEntry(manifest, actionId);
        if (!entry) {
          return {
            error: `No action "${actionId}" is available on this page.`,
            availableActionIds: manifest.map((e) => e.id),
          };
        }

        // Re-validate params SERVER-side against the manifest's JSON Schema.
        // (The client re-validates against the LIVE Zod schema before run — CLE-03.)
        const schema = jsonSchemaToZod(entry.paramsJsonSchema);
        const parsed = schema.safeParse(params);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const where = issue?.path?.join(".") || "params";
          return {
            error: `Invalid parameters for "${actionId}": ${issue?.message ?? "validation failed"} (${where}).`,
          };
        }

        // CLE-12 — STATIC permission gate, BEFORE the dynamic approval gate.
        // Permission first ("may this role do this kind of thing at all?"), then
        // approval ("does it need a card right now?"). A member invoking an
        // outbound:paid action is refused HERE even though decideAction alone
        // would only say "confirm"; a viewer + mutating action is refused by
        // both this gate and decideAction's viewer floor (defence in depth).
        // A pure-read action carries no capability -> passes -> decideAction
        // executes it (CLE-04 gateway behaviour preserved, incl. for viewers).
        const requiredCap = capabilityForPageAction({
          id: entry.id,
          mutating: entry.mutating,
          outbound: entry.outbound,
          cost: entry.cost,
          reversible: entry.reversible,
        });
        if (requiredCap && !hasPermission(role, requiredCap)) {
          return {
            error: `Cannot run "${actionId}": your role (${role}) lacks "${requiredCap}".`,
          };
          // No _uiDirective key -> client dispatches nothing (CLE-04 wire-level
          // guarantee). decideAction is NOT consulted (permission-first).
        }

        // The single decision authority computes the disposition.
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
        const invocationId = crypto.randomUUID(); // decided once at the emit site (CLE-03)

        return {
          invoked: {
            actionId,
            title: entry.title,
            requireConfirm,
            queued: decision.disposition === "queue",
            reason: decision.reason,
          },
          ...invokeActionDirective(
            invocationId,
            actionId,
            parsed.data as Record<string, unknown>,
            requireConfirm,
          ),
        };
      },
    }),
  };
}
