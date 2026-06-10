/**
 * Validate a `callbackUrl` query param before handing it to NextAuth's
 * `signIn({ redirectTo })`. Only same-origin relative paths are allowed
 * so a crafted link like `?callbackUrl=https://evil.example/` can't
 * turn sign-in into an open redirect.
 */
export function sanitizeCallbackUrl(raw: string | undefined): string {
  if (!raw) return "/home";
  if (!raw.startsWith("/")) return "/home";
  if (raw.startsWith("//")) return "/home";
  return raw;
}

/**
 * I5: map every NextAuth v5 (`@auth/core`) error type that can leak into a
 * `?error=...` query param to a short, neutral, user-facing sentence.
 *
 * Rules:
 *  - Never disclose whether the email or password was wrong (CredentialsSignin
 *    stays generic).
 *  - Never blame the user for server / config issues — they can't fix them.
 *  - Always end on something the user can actually do: retry, switch method,
 *    contact support.
 *  - Keep copy ≤ 1 sentence so it fits the inline alert banner.
 *
 * Source of truth for the codes:
 *   node_modules/@auth/core/errors.d.ts → `ErrorType` union.
 *
 * Legacy aliases (`OAuthCallback`, `OAuthSignin`, `Configuration`, `Default`)
 * are kept because old emailed magic-links / bookmarked URLs may still land
 * on them.
 */
export const SIGN_IN_ERROR_COPY: Record<string, string> = {
  // --- credentials ---
  CredentialsSignin: "Email or password is incorrect.",
  AccountLocked:
    "Too many failed attempts. Try again in a few minutes, or reset your password.",
  // --- MFA (SOC2 T4) — the sign-in page reveals the code field on these ---
  MfaRequired:
    "Two-factor authentication is on for this account. Enter the 6-digit code from your authenticator app.",
  InvalidTotp:
    "That authentication code is invalid or expired. Enter a fresh code, or use a recovery code.",

  // --- account linking ---
  OAuthAccountNotLinked:
    "This email is already registered with another sign-in method. Use that method, or contact support to merge accounts.",
  AccountNotLinked:
    "This email is already registered with another sign-in method. Use that method, or contact support to merge accounts.",

  // --- OAuth flow failures ---
  OAuthSignInError:
    "We couldn't start sign-in with that provider. Please try again.",
  OAuthCallbackError:
    "Sign-in with that provider didn't complete. Please try again.",
  OAuthProfileParseError:
    "We couldn't read your profile from that provider. Please try again or use email.",
  // Legacy v4 aliases — still emitted by some upstream redirects.
  OAuthSignin:
    "We couldn't start sign-in with that provider. Please try again.",
  OAuthCallback:
    "Sign-in with that provider didn't complete. Please try again.",
  OAuthCreateAccount:
    "We couldn't create your account from that provider. Please try email sign-up.",

  // --- email / magic link ---
  EmailSignInError:
    "We couldn't send the sign-in email. Check the address and try again.",
  Verification:
    "This sign-in link is invalid or has expired. Request a new one.",
  EmailCreateAccount:
    "We couldn't create your account by email. Please try again.",

  // --- access control ---
  AccessDenied: "You don't have access to this workspace.",

  // --- callback / session / CSRF ---
  CallbackRouteError:
    "Sign-in failed mid-flow. Please try again — if it keeps happening, contact support.",
  MissingCSRF:
    "Your browser blocked a security cookie. Reload the page and try again.",
  InvalidCallbackUrl:
    "That sign-in link looks tampered with. Please start sign-in again from elevay.com.",
  InvalidCheck:
    "Your browser blocked a security cookie. Reload the page and try again.",
  JWTSessionError: "Your session is invalid. Please sign in again.",
  SessionTokenError: "Your session is invalid. Please sign in again.",
  SessionRequired: "Please sign in to continue.",

  // --- server / config (shouldn't reach the user, but be polite if it does) ---
  Configuration:
    "This sign-in method is temporarily unreachable from your network. Try a different provider, or use email below.",
  AdapterError:
    "Sign-in is temporarily unavailable. Please try again in a moment.",
  MissingAdapter:
    "Sign-in is temporarily unavailable. Please try again in a moment.",
  MissingSecret:
    "Sign-in is temporarily unavailable. Please try again in a moment.",

  // --- locally-emitted by sign-in/sign-up server actions when the
  // OAuth bootstrap fetch (provider's well-known / authorization URL)
  // fails: TLS interception, corporate proxy, captive portal, DNS, etc.
  // We surface a clearer message than the generic Configuration copy so
  // the user knows the issue is local + actionable. ---
  OAuthUnavailable:
    "This sign-in method is temporarily unreachable from your network. Try a different provider, or use email below.",

  // --- catch-alls used by NextAuth's default error page ---
  Default: "Sign-in failed. Please try again.",
};

/**
 * Resolve a NextAuth `?error=` query value to a user-facing sentence,
 * always returning a friendly fallback for unknown / future codes so we
 * never render a raw camelCase token in the UI.
 */
export function resolveSignInErrorCopy(code: string | undefined): string | null {
  if (!code) return null;
  return SIGN_IN_ERROR_COPY[code] ?? SIGN_IN_ERROR_COPY.Default;
}

export const SIGN_IN_REASON_COPY: Record<string, string> = {
  "password-reset-success":
    "Password updated. Sign in with your new password.",
  "session-expired": "Your session timed out. Please sign in again.",
  idle: "You were signed out after a period of inactivity. Sign in to continue.",
  "email-verified":
    "Email confirmed. Sign in to continue.",
};

/**
 * Next.js signals a successful `redirect()` by throwing an Error whose
 * `digest` starts with `NEXT_REDIRECT`. `signIn()` from NextAuth uses
 * `redirect()` internally on success, so any try/catch around `signIn`
 * MUST rethrow these or the redirect is silently eaten. Same trick for
 * `notFound()` (digest = NEXT_NOT_FOUND).
 *
 * This helper centralizes the check so the two server actions that
 * wrap OAuth `signIn` (sign-in + sign-up) stay in sync.
 */
export function isNextControlFlowError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND";
}
