import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "admin_token";
const SESSION_COOKIE = "admin_issued_at";
const MAX_SESSION_AGE_S = 4 * 60 * 60; // 4 hours

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Constant-time comparison
  if (token.length !== secret.length) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Session expiry — reject sessions older than MAX_SESSION_AGE_S
  const issuedAt = request.cookies.get(SESSION_COOKIE)?.value;
  if (issuedAt) {
    const age = Math.floor(Date.now() / 1000) - Number(issuedAt);
    if (age > MAX_SESSION_AGE_S) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.delete(COOKIE_NAME);
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
