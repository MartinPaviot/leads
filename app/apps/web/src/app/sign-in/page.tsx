import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { PasswordInput } from "@/components/ui/password-input";

export default function SignInPage() {
  return (
    <div
      className="bg-grid flex min-h-screen items-center justify-center"
      style={{ background: "var(--color-bg-page)" }}
    >
      <div
        className="w-full max-w-sm space-y-6 rounded-xl p-8"
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

        {/* OAuth buttons */}
        <div className="flex gap-3">
          <form
            className="flex-1"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/home" });
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
              await signIn("microsoft-entra-id", { redirectTo: "/home" });
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
                redirect(`/sign-in?error=${error.type}`);
              }
              throw error;
            }
          }}
          className="space-y-4"
        >
          <input type="hidden" name="redirectTo" value="/home" />
          <div>
            <label htmlFor="email" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
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
            <label htmlFor="password" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Password
            </label>
            <PasswordInput id="password" name="password" required placeholder="Enter password" />
          </div>
          {/* Gradient CTA button */}
          <button
            type="submit"
            className="gradient-brand w-full rounded-lg px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-all hover:brightness-110"
          >
            Sign in
          </button>
        </form>

        <p className="text-center text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          Don&apos;t have an account?{" "}
          <a href="/sign-up" className="font-medium hover:underline" style={{ color: "var(--color-accent)" }}>
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
