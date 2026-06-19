import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { verifyLinkState } from "@/lib/auth/oauth-link-state";
import { linkOAuthMailbox } from "@/lib/integrations/link-mailbox";
import {
  exchangeCodeForTokens,
  fetchVerifiedEmail,
  OAUTH_LINK_CALLBACK_PATH,
} from "@/lib/integrations/oauth-link-providers";
import { OAUTH_LINK_NONCE_COOKIE } from "@/app/api/settings/mailboxes/oauth-link/route";
import { logger } from "@/lib/observability/logger";

const SETTINGS_PATH = "/settings/mail-calendar";

type LinkStatus = "ok" | "cancelled" | "error";

function redirectToSettings(origin: string, status: LinkStatus, clearCookie: boolean): NextResponse {
  const res = NextResponse.redirect(`${origin}${SETTINGS_PATH}?linked=${status}`, { status: 302 });
  if (clearCookie) res.cookies.set(OAUTH_LINK_NONCE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

/**
 * GET /api/settings/mailboxes/oauth-link/callback  (A1 B4, R2/R7)
 *
 * The provider redirect target. Verifies the signed single-use state + the nonce
 * cookie (R7.5), handles denied consent (R7.1), exchanges the code for tokens
 * server-side (R2.1), reads the verified email from userinfo (R2.4), and drives
 * the idempotent linkOAuthMailbox upsert. Fail-closed: any bad state / token
 * exchange / EE failure leaves NO half-written row (R7.2/R7.3). No token, code,
 * or password ever reaches the redirect URL or logs (R8.1/R8.3).
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const url = new URL(req.url);
  const params = url.searchParams;

  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.redirect(`${origin}/sign-in`, { status: 302 });

  // R7.1: provider-side denial/error → no row, cancelled.
  if (params.get("error")) {
    return redirectToSettings(origin, "cancelled", true);
  }

  const code = params.get("code");
  const state = params.get("state");

  // R7.5: verify the signed state, the nonce cookie, and the user/tenant binding.
  const jar = await cookies();
  const cookieNonce = jar.get(OAUTH_LINK_NONCE_COOKIE)?.value ?? null;
  const payload = verifyLinkState(state);
  if (
    !code ||
    !payload ||
    !cookieNonce ||
    payload.nonce !== cookieNonce ||
    payload.authUserId !== authCtx.userId ||
    payload.tenantId !== authCtx.tenantId
  ) {
    return redirectToSettings(origin, "error", true);
  }

  const redirectUri = `${origin}${OAUTH_LINK_CALLBACK_PATH}`;

  try {
    // R2.1: exchange the code for tokens server-side; never to the client.
    const tokens = await exchangeCodeForTokens({ provider: payload.provider, code, redirectUri });

    // R2.4: the verified email comes from the provider, never client input.
    const email = await fetchVerifiedEmail({ provider: payload.provider, accessToken: tokens.accessToken });
    if (!email) return redirectToSettings(origin, "error", true);

    // R2.2-R2.5/R4/R6/R7.3: register + idempotent upsert + initial sync.
    await linkOAuthMailbox({
      authUserId: authCtx.userId,
      tenantId: authCtx.tenantId,
      provider: payload.provider,
      email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      appUserId: authCtx.appUserId,
    });

    return redirectToSettings(origin, "ok", true);
  } catch (err) {
    // R8.3: log a redacted reason only — never the code, tokens, or password.
    logger.warn("oauth-link.callback_failed", {
      provider: payload.provider,
      reason: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
    return redirectToSettings(origin, "error", true);
  }
}
