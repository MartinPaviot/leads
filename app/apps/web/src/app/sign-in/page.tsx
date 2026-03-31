import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0b0f]">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-[#1e1f2a] bg-[#12131a] p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[#6366f1]">
            LeadSens
          </h1>
          <p className="mt-1 text-sm text-[#8b8ba0]">
            Sign in to your GTM engine
          </p>
        </div>

        {/* Google OAuth */}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#1e1f2a] bg-[#0a0b0f] px-4 py-2.5 text-sm font-medium text-[#e8e8ed] hover:border-[#6366f1] hover:bg-[#1a1b24]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[#1e1f2a]" />
          <span className="text-xs text-[#5a5a70]">or</span>
          <div className="h-px flex-1 bg-[#1e1f2a]" />
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
          <input type="hidden" name="redirectTo" value="/" />
          <div>
            <label htmlFor="email" className="block text-sm text-[#8b8ba0]">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@company.com"
              className="mt-1 w-full rounded-lg border border-[#1e1f2a] bg-[#0a0b0f] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-[#8b8ba0]">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="Enter password"
              className="mt-1 w-full rounded-lg border border-[#1e1f2a] bg-[#0a0b0f] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-[#6366f1] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#5558e6]"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
