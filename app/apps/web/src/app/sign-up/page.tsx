import { redirect } from "next/navigation";
import { db } from "@/db";
import { authUsers, authAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password-hash";
import Link from "next/link";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthSubmitButton } from "@/components/ui/auth-submit-button";
import { BodyScrollUnlock } from "@/components/auth/body-scroll-unlock";
import { signIn, auth } from "@/auth";
import {
  sanitizeCallbackUrl,
  isNextControlFlowError,
} from "@/lib/auth/auth-callback";
import { isPasswordAcceptable as isPasswordStrong } from "@/lib/auth/password-reset";
import { createVerifyTokenForUser } from "@/lib/emails/email-verification";
import { sendVerifyEmail } from "@/lib/emails/verify-email";
import { isPasswordPwned } from "@/lib/auth/password-pwned";
import { logger } from "@/lib/observability/logger";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string; email?: string; callbackUrl?: string; provider?: string }>;
}) {
  const params = await searchParams;

  // S8: route the error code to the field it belongs to so we can render
  // the message *under that input* (with aria-invalid + aria-describedby
  // for screen readers) instead of a single global banner. Unknown /
  // server errors still fall back to the global banner so we never lose
  // signal to the user.
  type FieldError = "email" | "password" | "name";
  const FIELD_ERRORS: Record<string, { field: FieldError; message: string }> = {
    EmailExists: {
      field: "email",
      message: "An account with this email already exists.",
    },
    PasswordTooShort: {
      field: "password",
      message:
        "Password must be at least 12 characters, with a digit, a lowercase, and an uppercase letter.",
    },
    PasswordPwned: {
      field: "password",
      message:
        "This password has appeared in a known data breach. Please choose a different one.",
    },
  };
  const fieldError = params.error ? FIELD_ERRORS[params.error] : undefined;
  const missingFields = params.error === "MissingFields";

  // OAuth bootstrap failure: the sign-up server actions wrap signIn in
  // try/catch so a network/TLS error reaching the provider's well-known
  // endpoint surfaces inline here instead of bouncing the user to the
  // raw NextAuth `/api/auth/error?error=Configuration` page (which reads
  // as "the product is broken" — it isn't). Provider name is included
  // so we can name the offender.
  const oauthUnavailableProvider =
    params.error === "OAuthUnavailable"
      ? params.provider === "microsoft"
        ? "Microsoft"
        : params.provider === "google"
          ? "Google"
          : "this provider"
      : null;

  const unknownError =
    params.error && !fieldError && !missingFields && !oauthUnavailableProvider
      ? "Something went wrong. Please try again."
      : null;
  const inviteToken = (params.invite || "").trim();
  const presetEmail = (params.email || "").trim();
  const callbackUrl = sanitizeCallbackUrl(params.callbackUrl);

  // S3: if already authed, go straight to the intended destination.
  const session = await auth();
  if (session?.user) {
    redirect(inviteToken ? `/accept-invite?token=${inviteToken}` : callbackUrl);
  }

  // After successful credentials sign-up we auto-sign-in (S1) and land the
  // user directly on their destination. The invite flow still needs the
  // `/accept-invite` hop so the tenant swap happens server-side.
  const postSignupRedirect = inviteToken
    ? `/accept-invite?token=${inviteToken}`
    : callbackUrl;
  const oauthRedirectTo = inviteToken
    ? `/accept-invite?token=${inviteToken}`
    : callbackUrl;

  async function handleSignUp(formData: FormData) {
    "use server";

    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const name = formData.get("name") as string;
    const inviteFromForm = ((formData.get("invite") as string) || "").trim();
    const callbackFromForm = sanitizeCallbackUrl(
      (formData.get("callbackUrl") as string) || undefined
    );

    if (!email || !password || !name) {
      const q = inviteFromForm ? `&invite=${encodeURIComponent(inviteFromForm)}` : "";
      redirect(`/sign-up?error=MissingFields${q}`);
    }

    // Matches the password-reset + credentials-provider policy (M11):
    // ≥12 chars with at least one digit, lower, upper. The credentials
    // provider itself is agnostic on length, but this keeps the two
    // sign-up / reset paths from diverging.
    if (!isPasswordStrong(password)) {
      const q = inviteFromForm ? `&invite=${encodeURIComponent(inviteFromForm)}` : "";
      redirect(`/sign-up?error=PasswordTooShort${q}`);
    }

    // S5: Have I Been Pwned k-anonymity check. Fail-open — if HIBP is
    // down or slow we let the sign-up through; the policy in
    // isPasswordStrong is the floor.
    const pwnedCheck = await isPasswordPwned(password);
    if (pwnedCheck.pwned) {
      const q = inviteFromForm ? `&invite=${encodeURIComponent(inviteFromForm)}` : "";
      redirect(`/sign-up?error=PasswordPwned${q}`);
    }

    const normalizedEmail = email.toLowerCase().trim();

    const [existing] = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, normalizedEmail))
      .limit(1);

    if (existing) {
      const q = inviteFromForm ? `&invite=${encodeURIComponent(inviteFromForm)}` : "";
      redirect(`/sign-up?error=EmailExists${q}`);
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);

    // H12 — password hash goes in the dedicated column on `authUsers`
    // (not reused `authAccounts.access_token`). We still insert a
    // credentials row on `authAccounts` so NextAuth sees a provider
    // binding; the `access_token` on that row is intentionally empty.
    await db.insert(authUsers).values({
      id: userId,
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
    });

    await db.insert(authAccounts).values({
      userId,
      type: "credentials" as never,
      provider: "credentials",
      providerAccountId: normalizedEmail,
    });

    // S2: issue a verification token + email immediately. Best-effort —
    // a Resend outage must NOT block sign-up (the user can resend from
    // /verify-email-sent). The token rows survive the failed send so
    // a manual /verify-email link still works.
    try {
      const token = await createVerifyTokenForUser(userId);
      const sendResult = await sendVerifyEmail(normalizedEmail, token);
      if (!sendResult.sent) {
        logger.warn("sign-up: verify email send failed", {
          userId,
          reason: sendResult.reason,
        });
      }
    } catch (err) {
      logger.error("sign-up: verify email issue threw", { err, userId });
    }

    // S1: auto-login. `signIn` with redirect=true internally calls
    // `redirect(...)` — which throws a special NEXT_REDIRECT — so we
    // MUST NOT wrap it in try/catch that swallows everything, or
    // we'll eat the redirect and leave the user stranded. The call
    // site below (no try/catch) is correct.
    //
    // Invite flows skip the inbox screen — the invitee accepted
    // explicitly so they're already trusted; verifying email later via
    // the soft gate is fine.
    const postRedirect = inviteFromForm
      ? `/accept-invite?token=${inviteFromForm}`
      : `/verify-email-sent?next=${encodeURIComponent(callbackFromForm)}`;
    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirectTo: postRedirect,
    });
  }

  return (
    <div
      className="bg-grid flex min-h-screen flex-col px-4 py-8"
      style={{ background: "var(--color-bg-page)" }}
    >
      <BodyScrollUnlock />
      <div
        className="m-auto w-full max-w-sm space-y-3 rounded-xl px-7 py-5"
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
          <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            Create your account
          </p>
        </div>

        <div className="flex gap-3">
          {/* Google OAuth */}
          <form
            className="flex-1"
            action={async () => {
              "use server";
              try {
                await signIn("google", { redirectTo: oauthRedirectTo });
              } catch (err) {
                // signIn throws NEXT_REDIRECT on success — rethrow it
                // so Next can perform the redirect.
                if (isNextControlFlowError(err)) throw err;
                // Real failure (TLS, DNS, provider down, misconfig).
                // Land back on /sign-up with an inline message instead
                // of the raw NextAuth `/api/auth/error?error=Configuration`
                // page which reads as "the product is broken".
                const inviteQ = inviteToken
                  ? `&invite=${encodeURIComponent(inviteToken)}`
                  : "";
                redirect(
                  `/sign-up?error=OAuthUnavailable&provider=google${inviteQ}`
                );
              }
            }}
          >
            <button
              type="submit"
              className="auth-button flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150"
              style={{
                background: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Google
            </button>
          </form>

          {/* Microsoft OAuth */}
          <form
            className="flex-1"
            action={async () => {
              "use server";
              try {
                await signIn("microsoft-entra-id", {
                  redirectTo: oauthRedirectTo,
                });
              } catch (err) {
                if (isNextControlFlowError(err)) throw err;
                const inviteQ = inviteToken
                  ? `&invite=${encodeURIComponent(inviteToken)}`
                  : "";
                redirect(
                  `/sign-up?error=OAuthUnavailable&provider=microsoft${inviteQ}`
                );
              }
            }}
          >
            <button
              type="submit"
              className="auth-button flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150"
              style={{
                background: "var(--color-bg-card)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
              }}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 21 21">
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

        {missingFields && (
          <div
            role="alert"
            className="rounded-lg px-3 py-2 text-[13px] font-medium"
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            Please fill in all fields.
          </div>
        )}
        {oauthUnavailableProvider && (
          <div
            role="alert"
            className="rounded-lg px-3 py-2 text-[13px]"
            style={{
              background: "rgba(245, 158, 11, 0.10)",
              color: "var(--color-text-primary)",
              border: "1px solid rgba(245, 158, 11, 0.30)",
            }}
          >
            <strong>{oauthUnavailableProvider} sign-in unreachable.</strong>{" "}
            Your network blocked the connection to {oauthUnavailableProvider}.
            Try a different provider above, or use email below.
          </div>
        )}
        {unknownError && (
          <div
            role="alert"
            className="rounded-lg px-3 py-2 text-[13px] font-medium"
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            {unknownError}
          </div>
        )}

        {inviteToken && (
          <div
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{
              background: "var(--color-accent-soft, rgba(99,102,241,0.08))",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-accent, #6366f1)",
            }}
          >
            You&apos;re creating an account to accept a workspace invitation. Use the invited
            email address.
          </div>
        )}

        <form action={handleSignUp} className="space-y-2.5">
          {inviteToken && <input type="hidden" name="invite" value={inviteToken} />}
          <div>
            <label htmlFor="name" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="name"
              placeholder="Martin Paviot"
              aria-invalid={missingFields || undefined}
              className="auth-input mt-1.5 w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-colors"
              style={{
                background: "var(--color-bg-page)",
                color: "var(--color-text-primary)",
                border:
                  missingFields
                    ? "1px solid rgba(220,38,38,0.55)"
                    : "1px solid var(--color-border-default)",
              }}
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={presetEmail}
              placeholder="you@company.com"
              aria-invalid={fieldError?.field === "email" || missingFields || undefined}
              aria-describedby={fieldError?.field === "email" ? "signup-email-error" : undefined}
              className="auth-input mt-1.5 w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-colors"
              style={{
                background: "var(--color-bg-page)",
                color: "var(--color-text-primary)",
                border:
                  fieldError?.field === "email" || missingFields
                    ? "1px solid rgba(220,38,38,0.55)"
                    : "1px solid var(--color-border-default)",
              }}
            />
            {fieldError?.field === "email" && (
              <p
                id="signup-email-error"
                role="alert"
                className="mt-1 text-[12px]"
                style={{ color: "var(--color-error, #b91c1c)" }}
              >
                {fieldError.message}{" "}
                <Link
                  href={
                    callbackUrl === "/home"
                      ? "/sign-in"
                      : `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`
                  }
                  className="font-medium underline"
                  style={{ color: "var(--color-error, #b91c1c)" }}
                >
                  Sign in instead
                </Link>
              </p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Password
            </label>
            <PasswordInput
              id="password"
              name="password"
              required
              minLength={10}
              autoComplete="new-password"
              placeholder="Min 10 chars, 1 digit, upper + lower"
              ariaInvalid={fieldError?.field === "password" || missingFields}
              ariaDescribedBy={fieldError?.field === "password" ? "signup-password-error" : undefined}
            />
            {fieldError?.field === "password" && (
              <p
                id="signup-password-error"
                role="alert"
                className="mt-1 text-[12px]"
                style={{ color: "var(--color-error, #b91c1c)" }}
              >
                {fieldError.message}
              </p>
            )}
          </div>
          {callbackUrl !== "/home" && (
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
          )}
          <AuthSubmitButton label="Create account" busyLabel="Creating account…" />
        </form>

        <p className="text-center text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          Already have an account?{" "}
          <Link
            href={callbackUrl === "/home" ? "/sign-in" : `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="font-medium hover:underline"
            style={{ color: "var(--color-accent)" }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
