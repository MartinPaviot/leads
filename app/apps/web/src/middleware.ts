import { auth } from "./auth";
import { NextResponse } from "next/server";
import { isViewerWriteBlocked } from "./lib/auth/viewer-guard";

// ── IP-based rate limiting for API routes ──
// Simple in-memory store (works in Edge Runtime)
const ipStore = new Map<string, { count: number; resetAt: number }>();
const IP_LIMIT = 200; // requests per window
const IP_WINDOW_MS = 60 * 1000; // 1 minute

// Auth endpoint stricter limit
const AUTH_LIMIT = 10;
const AUTH_WINDOW_MS = 60 * 1000;

// Cleanup every 5 minutes
if (typeof globalThis !== "undefined") {
  const cleanup = () => {
    const now = Date.now();
    for (const [key, value] of ipStore) {
      if (value.resetAt < now) ipStore.delete(key);
    }
  };
  // Edge-compatible interval
  setInterval(cleanup, 5 * 60 * 1000);
}

function checkIpRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = ipStore.get(ip);

  if (!entry || entry.resetAt < now) {
    ipStore.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes that don't require auth
  const publicPaths = [
    "/sign-in",
    "/sign-up",
    // Invite acceptance must be reachable WITHOUT a session — an invitee is
    // logged out by definition when they click the emailed link. Without
    // this the middleware bounced /accept-invite to /sign-in (307) and
    // dropped the token + invite context, so the email button looked dead.
    // The page reads the invite (public GET /api/auth/invite/[token]) and
    // handles sign-in itself, preserving the token as the callbackUrl.
    "/accept-invite",
    // Shared beta-access link (/join?code=…). Reachable WITHOUT a session — a
    // beta tester is logged out when they click the founder's link. It
    // validates the code, drops the signed beta cookie, and forwards to
    // /sign-up. Without this the session gate would bounce it to /sign-in.
    "/join",
    // Password reset must be reachable WITHOUT a session — the user is
    // logged out by definition. /forgot-password (request a link) +
    // /reset-password (consume the emailed token). Without these the
    // middleware bounced both to /sign-in (307), so "forgot password"
    // looked like a dead link and the email reset link was broken.
    "/forgot-password",
    "/reset-password",
    "/landing",
    "/terms",
    "/privacy",
    "/sub-processors",
    "/security",
    "/acceptable-use",
    "/pricing",
    "/api/auth",
    "/api/health",
    "/api/unsubscribe",
    "/api/webhooks",
    // Twilio voice webhooks — Twilio POSTs these with no session; `twiml`,
    // `recording-status` and `transcription` self-authenticate via the Twilio
    // request signature (HMAC), and `twiml-fallback` is a constant,
    // side-effect-free response. Without this the session gate rewrites them
    // to /sign-in and Twilio never reaches the handler. (startsWith →
    // "/api/calls/twiml" also covers "/api/calls/twiml-fallback".)
    "/api/calls/twiml",
    "/api/calls/twiml-fallback",
    "/api/calls/agent-twiml",
    "/api/calls/dial-status",
    "/api/calls/recording-status",
    "/api/calls/transcription",
    "/api/inngest",
    "/api/track",
    // MONACO-PARITY-04: visitor-ID pixel + tracking. Both must be
    // accessible from the marketing site (cross-origin, no session).
    // Pixel: GET /api/v1/pixel.js; Track: POST /api/v1/visit/track.
    "/api/v1/pixel.js",
    "/api/v1/visit",
    // E2E test seed / cleanup endpoints. The routes fail-closed on
    // both `NODE_ENV === "production"` AND `ENABLE_E2E_SEED === "1"`
    // (M5) — only the CI pipeline running the Playwright suite sets
    // the second flag, so anywhere else the route 404s before any
    // DB work. Listed here as public so the middleware's session gate
    // doesn't redirect the 404 to /sign-in.
    "/api/test-e2e",
  ];

  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  // IP-based rate limiting for API routes
  if (pathname.startsWith("/api/")) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";

    // Stricter limit for auth endpoints
    const isAuth = pathname.startsWith("/api/auth");
    const limit = isAuth ? AUTH_LIMIT : IP_LIMIT;
    const window = isAuth ? AUTH_WINDOW_MS : IP_WINDOW_MS;

    if (!checkIpRateLimit(`${ip}:${isAuth ? "auth" : "api"}`, limit, window)) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  }

  if (isPublic) return NextResponse.next();

  // Root path: authenticated users go to dashboard, unauthenticated see marketing
  if (pathname === "/") {
    if (req.auth?.user) {
      return NextResponse.redirect(new URL("/home", req.url));
    }
    return NextResponse.next();
  }

  // Protected routes: redirect to sign-in if not authenticated
  if (!req.auth?.user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  // Viewer role: central fail-closed write gate. One predicate covers all
  // /api/* mutations (incl. future routes) instead of per-route checks.
  // Uses the JWT role only — no DB work on the middleware path; the
  // API layer overlays the fresh DB role separately (lib/auth/fresh-role).
  const sessionRole = (req.auth as { role?: string } | null)?.role;
  if (isViewerWriteBlocked(sessionRole, req.method, pathname)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Viewers have read-only access",
          reason: "viewer-read-only",
        },
      },
      { status: 403 },
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$).*)",
  ],
};
