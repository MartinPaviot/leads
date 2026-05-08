/**
 * Audit-2026-05-08 helper — mint a NextAuth v5 session cookie
 * directly from AUTH_SECRET, bypassing the OAuth round-trip.
 *
 * Used to drive Playwright through the auth-gated L3 portion
 * without needing a browser-resident Google/Microsoft session.
 *
 * Usage :
 *   AUTH_SECRET=… tsx mint-session-cookie.ts > cookie.txt
 *
 * To inject the cookie into a Playwright session driven by the
 * MCP browser tools (which can't set HttpOnly cookies directly) :
 *
 *   1. Add a temporary dev-only Next.js route, e.g.
 *      `app/api/dev-inject-session/route.ts` :
 *
 *        export async function POST(req: Request) {
 *          if (process.env.NODE_ENV === "production") {
 *            return NextResponse.json({ error: "dev only" }, { status: 404 });
 *          }
 *          const { token } = await req.json();
 *          const res = NextResponse.json({ ok: true });
 *          res.cookies.set("authjs.session-token", token, {
 *            httpOnly: true, sameSite: "lax", secure: false,
 *            path: "/", maxAge: 3600,
 *          });
 *          return res;
 *        }
 *
 *   2. Allowlist the path in middleware.ts publicPaths so the
 *      auth gate doesn't redirect.
 *
 *   3. From Playwright, after navigating to any anonymous page :
 *      browser_evaluate (`() => fetch('/api/dev-inject-session',
 *        { method: 'POST', headers: { 'Content-Type': 'application/json' },
 *          body: JSON.stringify({ token: '<minted JWT>' }) })`)
 *
 *   4. Subsequent navigations carry the session cookie.
 *
 *   5. Delete the route + middleware allowlist entry after the
 *      audit run so the dev surface stays small.
 *
 * Hard-coded to the design-priv-test@elevay.dev admin user
 * (UUID `ac406efe-3243-4afd-95c9-58fca0761392`, tenant
 * `db9237b8-89dd-4702-88ab-fcd0ba31fda1`). Read-only navigation
 * only — never call POST/PUT/DELETE while signed in as this
 * user.
 */

import { encode } from "@auth/core/jwt";

const SECRET = process.env.AUTH_SECRET;
if (!SECRET) {
  console.error("AUTH_SECRET is required");
  process.exit(2);
}

const COOKIE_NAME = process.env.COOKIE_NAME || "authjs.session-token";

const now = Math.floor(Date.now() / 1000);
const exp = now + 60 * 60; // 1h is plenty for an audit run

const token = {
  // session.user.id will be set to this — matches clerk_id column
  id: "ac406efe-3243-4afd-95c9-58fca0761392",
  // Standard JWT fields
  sub: "ac406efe-3243-4afd-95c9-58fca0761392",
  email: "design-priv-test@elevay.dev",
  name: "Design Privacy Test",
  // App-specific claims read by auth.ts's session callback
  tenantId: "db9237b8-89dd-4702-88ab-fcd0ba31fda1",
  appUserId: "8ae8032e-9d06-42fe-93b4-f28c6812a2a4",
  role: "admin",
  // Lifetime
  iat: now,
  exp,
  jti: crypto.randomUUID(),
};

async function main() {
  const cookie = await encode({
    token,
    secret: SECRET!,
    salt: COOKIE_NAME,
    // 1h lifetime
    maxAge: 60 * 60,
  });
  // Print just the cookie value so the caller can pipe it into curl /
  // Playwright addCookies().
  console.log(cookie);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
