import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "../../../lib/admin-auth";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const secret = process.env.ADMIN_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET not configured on server" },
      { status: 500 }
    );
  }

  // Constant-time comparison
  if (password.length !== secret.length) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  let mismatch = 0;
  for (let i = 0; i < password.length; i++) {
    mismatch |= password.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  if (mismatch !== 0) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const isProduction = process.env.NODE_ENV === "production";
  const maxAge = 60 * 60 * 4; // 4 hours

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, secret, {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    path: "/",
    maxAge,
  });
  response.cookies.set("admin_issued_at", String(Math.floor(Date.now() / 1000)), {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    path: "/",
    maxAge,
  });

  return response;
}
