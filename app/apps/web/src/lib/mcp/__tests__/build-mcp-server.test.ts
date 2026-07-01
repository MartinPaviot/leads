import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * CHAT-08 Part B — buildMcpServerForContext unit tests. Uses REAL
 * resolveCapabilities (pure, already covered by capability-resolver.test.ts)
 * so this also proves the actual role/destructive/plan filtering applies to
 * the MCP surface, not just a mocked stand-in. buildAllChatTools is mocked
 * with a small fixed registry (calling the real one needs a fully-wired
 * ToolContext with live DB access — excessive for this unit).
 *
 * McpServer's registered-tool handlers aren't exposed via a public API
 * (McpServer only exposes tools/list + tools/call over a transport) — this
 * reaches into the documented-internal `_registeredTools[name].handler`
 * shape (confirmed by reading the installed SDK's own mcp.js) rather than
 * spinning up a full transport just to invoke one handler in a test.
 */

function fakeTool(overrides: { description?: string; execute?: (args: any) => Promise<any> } = {}) {
  return {
    description: overrides.description || "a fake tool",
    inputSchema: z.object({ q: z.string() }),
    execute: overrides.execute || (async (args: any) => ({ ok: true, echo: args })),
  };
}

const mockRecordTrace = vi.fn(async (..._args: any[]) => "trace-1");
vi.mock("@/lib/observability/observability", () => ({
  recordTrace: (...args: any[]) => mockRecordTrace(...args),
}));

let fixtureRegistry: Record<string, any> = {};
vi.mock("@/lib/chat/tools", () => ({
  buildAllChatTools: () => fixtureRegistry,
}));

import { buildMcpServerForContext } from "../build-mcp-server";

function getHandler(server: any, name: string) {
  return server._registeredTools[name]?.handler;
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtureRegistry = {
    queryContacts: fakeTool(),
    createContact: fakeTool(),
    updateWorkspace: fakeTool(), // admin-only
    mergeContacts: fakeTool(), // destructive
  };
});

const baseToolCtx = { tenantId: "t1", userId: "u1", authCtx: {} as any, settings: {} as any, agentApprovalMode: "auto" as any };

describe("buildMcpServerForContext", () => {
  it("registers non-admin, non-destructive tools for a member role", () => {
    const server = buildMcpServerForContext({ toolCtx: baseToolCtx, role: "member" });
    expect(getHandler(server, "queryContacts")).toBeDefined();
    expect(getHandler(server, "createContact")).toBeDefined();
    expect(getHandler(server, "updateWorkspace")).toBeUndefined(); // admin-only
    expect(getHandler(server, "mergeContacts")).toBeUndefined(); // destructive
  });

  it("admin role still never gets destructive tools over MCP (allowDestructive is hard-coded false)", () => {
    const server = buildMcpServerForContext({ toolCtx: baseToolCtx, role: "admin" });
    expect(getHandler(server, "updateWorkspace")).toBeDefined(); // admin-only, but not destructive
    expect(getHandler(server, "mergeContacts")).toBeUndefined(); // destructive — still gone even for admin
  });

  it("calling a registered tool's handler invokes the underlying tool.execute and records a trace", async () => {
    const server = buildMcpServerForContext({ toolCtx: baseToolCtx, role: "member", mcpClient: "claude" });
    const handler = getHandler(server, "queryContacts");
    const result = await handler({ q: "acme" });

    expect(result.content[0].text).toContain("acme");
    expect(mockRecordTrace).toHaveBeenCalledTimes(1);
    const [ctx, res] = mockRecordTrace.mock.calls[0];
    expect(ctx).toMatchObject({ agentId: "mcp", tenantId: "t1", surfaceType: "mcp", mcpClient: "claude" });
    expect(res.status).toBe("ok");
  });

  it("a tool that throws returns an MCP error result and records a failed trace (never crashes the handler)", async () => {
    fixtureRegistry.queryContacts = fakeTool({
      execute: async () => {
        throw new Error("db down");
      },
    });
    const server = buildMcpServerForContext({ toolCtx: baseToolCtx, role: "member" });
    const handler = getHandler(server, "queryContacts");
    const result = await handler({ q: "acme" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("db down");
    expect(mockRecordTrace).toHaveBeenCalledTimes(1);
    expect(mockRecordTrace.mock.calls[0][1].status).toBe("error");
  });

  it("defaults mcpClient to 'unknown' when not provided", async () => {
    const server = buildMcpServerForContext({ toolCtx: baseToolCtx, role: "member" });
    const handler = getHandler(server, "queryContacts");
    await handler({ q: "x" });
    expect(mockRecordTrace.mock.calls[0][0].mcpClient).toBe("unknown");
  });
});
