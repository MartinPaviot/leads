import { auth } from "./auth";
import { NextResponse } from "next/server";

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
    "/landing",
    "/terms",
    "/privacy",
    "/acceptable-use",
    "/pricing",
    "/api/auth",
    "/api/health",
    "/api/unsubscribe",
    "/api/webhooks",
    "/api/inngest",
    "/api/track",
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

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$).*)",
  ],
};
