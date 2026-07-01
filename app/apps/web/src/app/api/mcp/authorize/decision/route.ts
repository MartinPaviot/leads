import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { getMcpClient, isRedirectUriRegistered } from "@/lib/mcp/oauth/clients";
import { issueAuthorizationCode } from "@/lib/mcp/oauth/authorization-codes";

/**
 * Processes the consent page's Approve/Deny form submission. Re-validates
 * everything from scratch (auth, client, redirect_uri) rather than trusting
 * that /mcp/consent already checked it — this route is a real POST
 * endpoint reachable directly, not just a link the consent page happens to
 * render.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const clientId = String(form.get("client_id") || "");
  const redirectUri = String(form.get("redirect_uri") || "");
  const codeChallenge = String(form.get("code_challenge") || "");
  const codeChallengeMethod = String(form.get("code_challenge_method") || "S256");
  const state = String(form.get("state") || "");
  const scope = String(form.get("scope") || "");
  const decision = String(form.get("decision") || "");

  const authCtx = await getAuthContext();
  if (!authCtx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = await getMcpClient(clientId);
  if (!client || !isRedirectUriRegistered(client, redirectUri)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const redirectWith = (extraParams: Record<string, string>) => {
    const target = new URL(redirectUri);
    for (const [k, v] of Object.entries(extraParams)) target.searchParams.set(k, v);
    if (state) target.searchParams.set("state", state);
    return NextResponse.redirect(target, 303);
  };

  if (decision !== "approve") {
    return redirectWith({ error: "access_denied" });
  }

  const code = await issueAuthorizationCode({
    clientId,
    tenantId: authCtx.tenantId,
    authUserId: authCtx.userId,
    appUserId: authCtx.appUserId,
    role: authCtx.role,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
  });

  return redirectWith({ code });
}
