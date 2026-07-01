import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getMcpClient, isRedirectUriRegistered } from "@/lib/mcp/oauth/clients";

/**
 * OAuth 2.1 authorization endpoint (RFC 6749 §3.1). Validates the request,
 * then either bounces to /sign-in (preserving the whole request via
 * callbackUrl — see middleware.ts's comment on why this route is public)
 * or on to the real consent page (/mcp/consent) once a LeadSens session
 * exists. Never issues a code itself — that only happens after explicit
 * consent, in /api/mcp/authorize/decision.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;

  const responseType = params.get("response_type");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method") || "S256";

  if (responseType !== "code") {
    return NextResponse.json({ error: "unsupported_response_type" }, { status: 400 });
  }
  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json({ error: "invalid_request", error_description: "missing client_id/redirect_uri/code_challenge" }, { status: 400 });
  }
  if (codeChallengeMethod !== "S256") {
    return NextResponse.json({ error: "invalid_request", error_description: "only S256 code_challenge_method is supported" }, { status: 400 });
  }

  const client = await getMcpClient(clientId);
  if (!client) {
    return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  }
  // Exact-match redirect_uri validation happens BEFORE any redirect — an
  // unregistered redirect_uri gets a JSON error here, never a redirect to
  // an attacker-controlled URL (the classic open-redirect mistake in a
  // hand-rolled OAuth authorize endpoint).
  if (!isRedirectUriRegistered(client, redirectUri)) {
    return NextResponse.json({ error: "invalid_request", error_description: "redirect_uri is not registered for this client" }, { status: 400 });
  }

  // Forward the whole validated request to the consent page as a relative
  // path (sanitizeCallbackUrl at /sign-in requires this — an absolute URL
  // would be rejected).
  const consentPath = `/mcp/consent?${params.toString()}`;

  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.redirect(new URL(`/sign-in?callbackUrl=${encodeURIComponent(consentPath)}`, req.url));
  }

  return NextResponse.redirect(new URL(consentPath, req.url));
}
