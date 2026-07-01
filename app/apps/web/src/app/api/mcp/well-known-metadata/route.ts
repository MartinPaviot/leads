import { NextResponse } from "next/server";
import type { OAuthMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

/**
 * RFC 8414 OAuth 2.0 Authorization Server Metadata. Served at the
 * spec-fixed path /.well-known/oauth-authorization-server via a rewrite
 * (next.config.ts) — see that file's comment for why a rewrite rather than
 * a literal `.well-known` App Router folder.
 *
 * CHAT-08 Part B — LeadSens acting as the OAuth *provider* here (issuing
 * tokens to external MCP clients), not NextAuth (which makes us a client
 * of Google/Microsoft). See design.md.
 */
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.elevay.dev";

  const metadata: OAuthMetadata = {
    issuer: appUrl,
    authorization_endpoint: `${appUrl}/api/mcp/authorize`,
    token_endpoint: `${appUrl}/api/mcp/token`,
    registration_endpoint: `${appUrl}/api/mcp/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: ["read", "write"],
  };

  return NextResponse.json(metadata, { headers: { "Cache-Control": "public, max-age=3600" } });
}
