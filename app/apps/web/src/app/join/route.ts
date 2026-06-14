import { NextRequest, NextResponse } from "next/server";
import {
  BETA_ACCESS_COOKIE,
  mintBetaAccessCookie,
  verifyBetaCode,
} from "@/lib/auth/beta-access";

/**
 * Shared beta-access entry point: `/join?code=<CODE>`.
 *
 * The single link the founder shares with beta testers. A valid code drops a
 * short-lived, signed cookie that re-opens self-serve sign-up for this browser
 * (each tester self-provisions their own workspace), then forwards to /sign-up.
 * An invalid / missing code falls through to the marketing page — no signal
 * about whether a code exists. See lib/auth/beta-access.ts.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!verifyBetaCode(code)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const cookieValue = mintBetaAccessCookie();
  if (!cookieValue) {
    // No signing secret configured — refuse to grant an unsigned pass.
    return NextResponse.redirect(new URL("/", req.url));
  }

  const res = NextResponse.redirect(new URL("/sign-up", req.url));
  res.cookies.set(BETA_ACCESS_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // survives the top-level OAuth callback navigation
    path: "/",
    maxAge: 30 * 60,
  });
  return res;
}
