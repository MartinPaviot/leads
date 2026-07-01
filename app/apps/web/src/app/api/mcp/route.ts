import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyAccessToken } from "@/lib/mcp/oauth/access-tokens";
import { buildMcpServerForContext } from "@/lib/mcp/build-mcp-server";
import { identifyMcpClient } from "@/lib/mcp/identify-client";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { readApprovalMode } from "@/lib/guardrails/approval-mode";
import type { AuthContext } from "@/lib/auth/auth-utils";
import type { ToolContext } from "@/lib/chat/tools";

/**
 * CHAT-08 Part B — the MCP tool-call transport.
 *
 * REPLACES a legacy hand-rolled JSON-RPC MCP server (2026-05-05) that used
 * tenant-wide bcrypt API keys with NO role-based filtering — any valid key
 * could call create_contact/create_deal freely, and the tool set was 12
 * hand-written tools, a strict subset of what the modern buildAllChatTools
 * registry already covers (queryContacts/createContact/createDeal/
 * createNote/queryActivities/searchCRM/etc., all with equivalents already
 * verified present before this replacement). See design.md +
 * project_chat08-external-reach memory for the full replace-vs-coexist
 * decision record. /api/mcp/keys' POST (create) now returns 410 pointing
 * here; GET/DELETE stay so existing tenants can see/revoke old keys.
 *
 * Bearer-token authenticated via the OAuth flow in ./authorize, ./token —
 * never the NextAuth session cookie (see middleware.ts's publicPaths
 * comment on why this whole path is listed there).
 *
 * Stateless: a fresh McpServer + transport are built on EVERY request (no
 * sessionIdGenerator) — matches design.md's reasoning (Vercel Functions
 * don't share memory across invocations/cold starts, so the SDK's
 * in-memory stateful mode would silently break under real traffic).
 */
async function handleMcpRequest(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  const verified = await verifyAccessToken(token);
  if (!verified.ok) {
    return NextResponse.json(
      { error: "invalid_token" },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="leadsens", error="invalid_token"' } },
    );
  }

  const authCtx: AuthContext = {
    userId: verified.authUserId,
    tenantId: verified.tenantId,
    appUserId: verified.appUserId,
    role: verified.role,
  };
  const settings = await getTenantSettings(verified.tenantId);
  const toolCtx: ToolContext = {
    tenantId: verified.tenantId,
    userId: verified.appUserId,
    authCtx,
    settings,
    agentApprovalMode: readApprovalMode(settings),
  };

  const mcpClient = identifyMcpClient(req.headers.get("user-agent"));
  const server = buildMcpServerForContext({ toolCtx, role: verified.role, mcpClient });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  return transport.handleRequest(req, {
    authInfo: {
      token,
      clientId: verified.clientId,
      scopes: verified.scope.split(" ").filter(Boolean),
      expiresAt: verified.expiresAtEpochSeconds,
      extra: { tenantId: verified.tenantId, appUserId: verified.appUserId, role: verified.role },
    },
  });
}

export async function GET(req: Request) {
  return handleMcpRequest(req);
}
export async function POST(req: Request) {
  return handleMcpRequest(req);
}
export async function DELETE(req: Request) {
  return handleMcpRequest(req);
}
