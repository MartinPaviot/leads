import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "admin_token";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth check for login page, auth API, and static assets
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    // No secret configured — redirect to login (which will show an error)
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
