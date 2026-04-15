import { redirect } from "next/navigation";
import { db } from "@/db";
import { authUsers, authAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import Link from "next/link";
import { PasswordInput } from "@/components/ui/password-input";
import { AuthSubmitButton } from "@/components/ui/auth-submit-button";
import { signIn, auth } from "@/auth";
import { sanitizeCallbackUrl } from "@/lib/auth-callback";
import { isPasswordAcceptable as isPasswordStrong } from "@/lib/password-reset";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string; email?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const errorMessages: Record<string, string> = {
    EmailExists: "An account with this email already exists.",
    MissingFields: "Please fill in all fields.",
    PasswordTooShort: "Password must be at least 10 characters, with a digit, a lowercase, and an uppercase letter.",
  };
  const errorMessage = params.error ? errorMessages[params.error] ?? "Something went wrong." : null;
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

    // Matches the password-reset + credentials-provider policy (T0.8):
    // ≥10 chars with at least one digit, lower, upper. The credentials
    // provider itself is agnostic on length, but this keeps the two
    // sign-up / reset paths from diverging.
    if (!isPasswordStrong(password)) {
      const q = inviteFromForm ? `&invite=${encodeURIComponent(inviteFromForm)}` : "";
      redirect(`/sign-up?error=PasswordTooShort${q}`);
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
    const passwordHash = await bcrypt.hash(password, 10);

    await db.insert(authUsers).values({
      id: userId,
      email: normalizedEmail,
      name: name.trim(),
    });

    await db.insert(authAccounts).values({
      userId,
      type: "credentials" as never,
      provider: "credentials",
      providerAccountId: normalizedEmail,
      access_token: passwordHash,
    });

    // S1: auto-login. `signIn` with redirect=true internally calls
    // `redirect(...)` — which throws a special NEXT_REDIRECT — so we
    // MUST NOT wrap it in try/catch that swallows everything, or
    // we'll eat the redirect and leave the user stranded. The call
    // site below (no try/catch) is correct.
    const postRedirect = inviteFromForm
      ? `/accept-invite?token=${inviteFromForm}`
      : callbackFromForm;
    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirectTo: postRedirect,
    });
  }

  return (
    <div
      className="bg-grid flex min-h-screen items-center justify-center"
      style={{ background: "var(--color-bg-page)" }}
    >
      <div
        className="w-full max-w-sm space-y-3 rounded-xl px-8 py-6"
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
              await signIn("google", { redirectTo: oauthRedirectTo });
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
              await signIn("microsoft-entra-id", { redirectTo: oauthRedirectTo });
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

        {errorMessage && (
          <div
            className="rounded-lg px-3 py-2 text-[13px] font-medium"
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            {errorMessage}
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
              className="auth-input mt-1.5 w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-colors"
              style={{
                background: "var(--color-bg-page)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
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
              className="auth-input mt-1.5 w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-colors"
              style={{
                background: "var(--color-bg-page)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
              }}
            />
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
            />
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
