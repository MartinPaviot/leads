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

export const SIGN_IN_ERROR_COPY: Record<string, string> = {
  CredentialsSignin: "Email or password is incorrect.",
  OAuthAccountNotLinked:
    "This email is already linked to another sign-in method. Please use that method, or contact support.",
  OAuthCallback: "Sign-in with the OAuth provider failed. Try again.",
  AccessDenied: "You do not have access to this workspace.",
};

export const SIGN_IN_REASON_COPY: Record<string, string> = {
  "password-reset-success":
    "Password updated. Sign in with your new password.",
  "session-expired": "Your session timed out. Please sign in again.",
};
