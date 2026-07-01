import { NextResponse } from "next/server";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { getMcpClient, verifyClientSecret } from "@/lib/mcp/oauth/clients";
import { consumeAuthorizationCode } from "@/lib/mcp/oauth/authorization-codes";
import { issueTokens, refreshTokens } from "@/lib/mcp/oauth/access-tokens";

function errorResponse(error: string, description?: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status, headers: { "Cache-Control": "no-store" } });
}

function toTokenResponse(tokens: { accessToken: string; refreshToken: string; expiresInSeconds: number }, scope: string): OAuthTokens {
  return {
    access_token: tokens.accessToken,
    token_type: "bearer",
    expires_in: tokens.expiresInSeconds,
    refresh_token: tokens.refreshToken,
    scope,
  };
}

/**
 * OAuth 2.1 token endpoint (RFC 6749 §3.2). Handles authorization_code
 * exchange (with mandatory PKCE verification) and refresh_token rotation.
 * Confidential clients (token_endpoint_auth_method !== "none") must
 * authenticate via client_secret in the body — our dynamic registration
 * defaults to public/PKCE-only, matching Claude Desktop/Cursor.
 */
export async function POST(req: Request) {
  const { rateLimit, rateLimitResponse } = await import("@/lib/infra/rate-limit");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit(`mcp-token:${ip}`, 60, 60 * 1000);
  if (!rl.success) return rateLimitResponse(rl.resetAt);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse("invalid_request", "expected application/x-www-form-urlencoded body");
  }

  const grantType = String(form.get("grant_type") || "");
  const clientId = String(form.get("client_id") || "");
  const clientSecret = form.get("client_secret") ? String(form.get("client_secret")) : null;

  const client = await getMcpClient(clientId);
  if (!client) return errorResponse("invalid_client", "unknown client_id");

  if (client.tokenEndpointAuthMethod !== "none") {
    if (!clientSecret || !verifyClientSecret(client, clientSecret)) {
      return errorResponse("invalid_client", "client authentication failed", 401);
    }
  }

  if (grantType === "authorization_code") {
    const code = String(form.get("code") || "");
    const redirectUri = String(form.get("redirect_uri") || "");
    const codeVerifier = String(form.get("code_verifier") || "");
    if (!code || !redirectUri || !codeVerifier) {
      return errorResponse("invalid_request", "missing code/redirect_uri/code_verifier");
    }

    const consumed = await consumeAuthorizationCode({ code, clientId, redirectUri, codeVerifier });
    if (!consumed.ok) return errorResponse(consumed.error, consumed.reason);

    const tokens = await issueTokens({
      clientId,
      tenantId: consumed.tenantId,
      authUserId: consumed.authUserId,
      appUserId: consumed.appUserId,
      role: consumed.role,
      scope: consumed.scope,
    });
    return NextResponse.json(toTokenResponse(tokens, consumed.scope), { headers: { "Cache-Control": "no-store" } });
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(form.get("refresh_token") || "");
    if (!refreshToken) return errorResponse("invalid_request", "missing refresh_token");

    const result = await refreshTokens(refreshToken, clientId);
    if (!result.ok) return errorResponse(result.error, result.reason);

    return NextResponse.json(toTokenResponse(result.tokens, result.scope), { headers: { "Cache-Control": "no-store" } });
  }

  return errorResponse("unsupported_grant_type", `grant_type "${grantType}" is not supported`);
}
