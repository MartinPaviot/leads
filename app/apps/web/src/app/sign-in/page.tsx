import { signIn, auth } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthSubmitButton } from "@/components/ui/auth-submit-button";
import { BodyScrollUnlock } from "@/components/auth/body-scroll-unlock";
import {
  sanitizeCallbackUrl,
  SIGN_IN_REASON_COPY,
  resolveSignInErrorCopy,
  isNextControlFlowError,
} from "@/lib/auth/auth-callback";

/**
 * Credentials + OAuth sign-in page. Reads `searchParams` (I1):
 *   - `callbackUrl` — where to send the user after auth (I2). Must be
 *     a same-origin relative path, otherwise we ignore it to avoid
 *     open-redirect exposure.
 *   - `registered` — "true" after a sign-up completion, show a
 *     success banner.
 *   - `reason` — e.g. "password-reset-success". Human-friendly banners
 *     for known reasons.
 *   - `error` — NextAuth error type. Rendered as a friendly message.
 *
 * Also implements I4: if `auth()` already resolves to a valid session,
 * redirect to the requested `callbackUrl` (or `/home`).
 */

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    registered?: string;
    reason?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const callbackUrl = sanitizeCallbackUrl(params.callbackUrl);

  // I4: bounce away if already authenticated.
  const session = await auth();
  if (session?.user) {
    redirect(callbackUrl);
  }

  const registered = params.registered === "true";
  const reason = params.reason ? SIGN_IN_REASON_COPY[params.reason] ?? null : null;
  const errorMessage = resolveSignInErrorCopy(params.error);
  // SOC2 T4 — reveal the second-factor field once the password cleared
  // and the account turned out to have TOTP enabled.
  const showTotpField =
    params.error === "MfaRequired" || params.error === "InvalidTotp";

  return (
    <div
      className="bg-grid flex min-h-screen flex-col px-4 py-8"
      style={{ background: "var(--color-bg-page)" }}
    >
      <BodyScrollUnlock />
      <div
        className="m-auto w-full max-w-sm space-y-5 rounded-xl p-7"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "var(--shadow-dialog)",
        }}
      >
        <div className="flex flex-col items-center text-center">
          <img src="/logo-Elevay.svg" alt="Elevay" className="mb-3 h-10 w-10" />
          <h1 className="gradient-text text-2xl font-bold tracking-tight">
            Elevay
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            Sign in to your sales engine
          </p>
        </div>

        {registered && (
          <div
            role="status"
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{
              background: "rgba(16,185,129,0.08)",
              color: "var(--color-success, #059669)",
              border: "1px solid rgba(16,185,129,0.25)",
            }}
          >
            Account created. Sign in to continue.
          </div>
        )}
        {reason && (
          <div
            role="status"
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{
              background: "var(--color-bg-hover)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            {reason}
          </div>
        )}
        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{
              background: "rgba(220,38,38,0.08)",
              color: "var(--color-error, #b91c1c)",
              border: "1px solid rgba(220,38,38,0.25)",
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* OAuth buttons */}
        <div className="flex gap-3">
          <form
            className="flex-1"
            action={async () => {
              "use server";
              try {
                await signIn("google", { redirectTo: callbackUrl });
              } catch (err) {
                // Rethrow Next's success-redirect signal so the OAuth
                // hop completes; only catch real failures (TLS, DNS,
                // provider unreachable). Friendly message via
                // resolveSignInErrorCopy("OAuthUnavailable").
                if (isNextControlFlowError(err)) throw err;
                const cb =
                  callbackUrl === "/home"
                    ? ""
                    : `&callbackUrl=${encodeURIComponent(callbackUrl)}`;
                redirect(`/sign-in?error=OAuthUnavailable&provider=google${cb}`);
              }
            }}
          >
            <button
              type="submit"
              className="auth-button flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all duration-150"
              style={{
                background: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Google
            </button>
          </form>
          <form
            className="flex-1"
            action={async () => {
              "use server";
              try {
                await signIn("microsoft-entra-id", { redirectTo: callbackUrl });
              } catch (err) {
                if (isNextControlFlowError(err)) throw err;
                const cb =
                  callbackUrl === "/home"
                    ? ""
                    : `&callbackUrl=${encodeURIComponent(callbackUrl)}`;
                redirect(
                  `/sign-in?error=OAuthUnavailable&provider=microsoft${cb}`
                );
              }
            }}
          >
            <button
              type="submit"
              className="auth-button flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-all duration-150"
              style={{
                background: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <svg className="h-4 w-4" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Microsoft
            </button>
          </form>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: "var(--color-border-default)" }} />
          <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>or</span>
          <div className="h-px flex-1" style={{ background: "var(--color-border-default)" }} />
        </div>

        {/* Email/password */}
        <form
          action={async (formData) => {
            "use server";
            try {
              await signIn("credentials", formData);
            } catch (error) {
              if (error instanceof AuthError) {
                // I6: a `CredentialsSignin` subclass can attach a more
                // specific `code` (e.g. "AccountLocked"). Prefer that
                // over the generic `type` so the error banner can
                // surface the right copy. NextAuth's default `code` is
                // the literal string "credentials" — treat that as
                // "no specific code" and fall back to the type.
                const code = (error as { code?: string }).code;
                const errorKey =
                  code && code !== "credentials" ? code : error.type;
                const params = new URLSearchParams();
                params.set("error", errorKey);
                if (callbackUrl !== "/home") params.set("callbackUrl", callbackUrl);
                redirect(`/sign-in?${params.toString()}`);
              }
              throw error;
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name="redirectTo" value={callbackUrl} />
          <div>
            <label htmlFor="email" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="you@company.com"
              className="auth-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-[13px] outline-none transition-colors"
              style={{
                background: "var(--color-bg-page)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
              }}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
                Password
              </label>
              <a
                href="/forgot-password"
                className="text-[11px] hover:underline"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Forgot password?
              </a>
            </div>
            <PasswordInput
              id="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="Enter password"
            />
          </div>
          {showTotpField && (
            <div>
              <label
                htmlFor="totp"
                className="block text-[13px] font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Authentication code
              </label>
              <input
                id="totp"
                name="totp"
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code or recovery code"
                className="auth-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-[13px] outline-none transition-colors"
                style={{
                  background: "var(--color-bg-page)",
                  color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border-default)",
                }}
              />
            </div>
          )}
          {/* Gradient CTA button — disables itself while pending (I7). */}
          <AuthSubmitButton label="Sign in" busyLabel="Signing in…" />
        </form>

        <p className="text-center text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          Don&apos;t have an account?{" "}
          <a
            href={
              callbackUrl === "/home"
                ? "/sign-up"
                : `/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`
            }
            className="font-medium hover:underline"
            style={{ color: "var(--color-accent)" }}
          >
            Sign up
          </a>
        </p>

        <p className="text-center text-[10px] leading-relaxed" style={{ color: "var(--color-text-tertiary)" }}>
          By signing in, you agree to our{" "}
          <a href="/terms" className="underline hover:opacity-80">Terms of Service</a>{" "}
          and{" "}
          <a href="/privacy" className="underline hover:opacity-80">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}

