import { cookies } from "next/headers";

const COOKIE_NAME = "admin_token";

/**
 * Check if the current request has a valid admin session.
 * Compares the `admin_token` cookie against the ADMIN_SECRET env var.
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    // If no ADMIN_SECRET is set, deny all access — fail closed.
    return false;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;

  // Constant-time comparison to prevent timing attacks
  if (token.length !== secret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Set the admin authentication cookie on a Response.
 * Uses HttpOnly + Secure + SameSite=Strict for defense-in-depth.
 */
export function setAdminCookie(response: Response, secret: string): Response {
  const isProduction = process.env.NODE_ENV === "production";
  const maxAge = 60 * 60 * 24 * 7; // 7 days

  response.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${isProduction ? "; Secure" : ""}`
  );
  return response;
}

export { COOKIE_NAME };
