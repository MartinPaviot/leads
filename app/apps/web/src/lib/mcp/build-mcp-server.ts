/**
 * CHAT-08 Part B — the MCP tool-list/tool-call core. Adapts the SAME
 * registry the in-app chat uses (buildAllChatTools + resolveCapabilities)
 * onto an MCP McpServer instance. No LLM call happens here — the LLM lives
 * in the external client (Claude Desktop/Cursor/ChatGPT); this server only
 * lists tools and executes the ones the client decides to call.
 *
 * Deliberately NOT wired to a transport/route yet — see
 * _specs/CHAT-08-external-reach/design.md for why the OAuth piece (the
 * actual blocker for a real external client reaching this) is a separate,
 * larger pass. This module is independently correct and testable without it.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildAllChatTools, type ToolContext } from "@/lib/chat/tools";
import { resolveCapabilities, type ResolveInput } from "@/lib/agents/capability-resolver";
import { recordTrace } from "@/lib/observability/observability";
import { identifyMcpClient } from "./identify-client";

export interface BuildMcpServerOptions {
  toolCtx: ToolContext;
  role: string;
  planTier?: ResolveInput["planTier"];
  featureFlags?: ResolveInput["featureFlags"];
  mcpClient?: string;
}

/**
 * A tool registered via lib/chat/tools/context.ts#makeTool always carries a
 * full ZodObject (constructed via z.object({...})) as inputSchema — this
 * codebase never hands a bare non-object schema to a tool. Defensive check
 * kept anyway: registerTool's inputSchema in @modelcontextprotocol/sdk@1.29.0
 * wants a raw ZodRawShape ({key: zodType}), NOT a wrapped z.object(...) —
 * confirmed by reading the SDK's own shipped example
 * (dist/esm/examples/server/simpleStatelessStreamableHttp.js), which
 * contradicts some newer doc snippets showing z.object() directly.
 */
function toMcpShape(inputSchema: unknown): z.ZodRawShape | null {
  if (inputSchema instanceof z.ZodObject) {
    return inputSchema.shape;
  }
  return null;
}

/**
 * Build a fresh, per-request McpServer scoped to this caller's permissions.
 * Stateless by design (see design.md) — a fresh server + fresh transport
 * are built per HTTP request, not held across requests/cold starts.
 *
 * allowDestructive is HARD-CODED false here — never accepted as a param —
 * so a caller can never accidentally widen it. Matches AC5's bar and
 * extends office-hours.md's Slack-specific reasoning (pitfall #3: no
 * reliable two-step confirmation in an external client) to MCP too.
 */
export function buildMcpServerForContext(opts: BuildMcpServerOptions): McpServer {
  const allTools = buildAllChatTools(opts.toolCtx);
  const resolved = resolveCapabilities(allTools, {
    role: opts.role,
    surface: { type: "mcp" },
    allowDestructive: false,
    planTier: opts.planTier,
    featureFlags: opts.featureFlags,
  });

  const server = new McpServer({ name: "leadsens", version: "1.0.0" });
  const mcpClient = opts.mcpClient || "unknown";

  for (const [name, tool] of Object.entries(resolved.tools)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tool as any;
    const shape = toMcpShape(t.inputSchema);
    if (!shape) {
      // Skip rather than register with an unpredictable shape — a tool
      // that somehow isn't a ZodObject shouldn't silently expose a broken
      // MCP schema. Logged, not thrown: one odd tool must not take down
      // the whole tool list.
      console.warn(`mcp: skipping tool "${name}" — inputSchema is not a ZodObject`);
      continue;
    }

    server.registerTool(
      name,
      { description: t.description || name, inputSchema: shape },
      async (args: Record<string, unknown>) => {
        const start = Date.now();
        try {
          const result = await t.execute(args);
          void recordTrace(
            {
              agentId: "mcp",
              tenantId: opts.toolCtx.tenantId,
              surfaceType: "mcp",
              mcpClient,
            },
            {
              input: `${name}(${JSON.stringify(args).slice(0, 300)})`,
              output: JSON.stringify(result).slice(0, 2000),
              latencyMs: Date.now() - start,
              toolCalls: [{ name }],
              status: "ok",
            },
          ).catch(() => {});
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          void recordTrace(
            {
              agentId: "mcp",
              tenantId: opts.toolCtx.tenantId,
              surfaceType: "mcp",
              mcpClient,
            },
            {
              input: `${name}(${JSON.stringify(args).slice(0, 300)})`,
              latencyMs: Date.now() - start,
              toolCalls: [{ name }],
              status: "error",
              errorMessage: message.slice(0, 500),
            },
          ).catch(() => {});
          return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
        }
      },
    );
  }

  return server;
}

export { identifyMcpClient };
