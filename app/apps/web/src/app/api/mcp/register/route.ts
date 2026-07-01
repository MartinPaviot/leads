import { NextResponse } from "next/server";
import { OAuthClientMetadataSchema } from "@modelcontextprotocol/sdk/shared/auth.js";
import { registerMcpClient } from "@/lib/mcp/oauth/clients";

/**
 * RFC 7591 OAuth 2.0 Dynamic Client Registration. Deliberately unauthenticated
 * (per spec) — the AUTHORIZE step is what actually gates access to LeadSens
 * data, not registration. Rate-limited so this can't be used to spam the
 * mcp_oauth_clients table.
 */
export async function POST(req: Request) {
  const { rateLimit, rateLimitResponse } = await import("@/lib/infra/rate-limit");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`mcp-register:${ip}`, 20, 60 * 60 * 1000);
  if (!rl.success) return rateLimitResponse(rl.resetAt);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "invalid JSON body" }, { status: 400 });
  }

  const parsed = OAuthClientMetadataSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: parsed.error.message },
      { status: 400 },
    );
  }

  const client = await registerMcpClient(parsed.data);
  return NextResponse.json(client, { status: 201, headers: { "Cache-Control": "no-store" } });
}
