import { redirect } from "next/navigation";
import { db } from "@/db";
import { authUsers, authAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import Link from "next/link";

export default function SignUpPage() {
  async function handleSignUp(formData: FormData) {
    "use server";

    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const name = formData.get("name") as string;

    if (!email || !password || !name) {
      redirect("/sign-up?error=MissingFields");
    }

    if (password.length < 6) {
      redirect("/sign-up?error=PasswordTooShort");
    }

    const [existing] = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, email.toLowerCase().trim()))
      .limit(1);

    if (existing) {
      redirect("/sign-up?error=EmailExists");
    }

    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    await db.insert(authUsers).values({
      id: userId,
      email: email.toLowerCase().trim(),
      name: name.trim(),
    });

    await db.insert(authAccounts).values({
      userId,
      type: "credentials" as any,
      provider: "credentials",
      providerAccountId: email.toLowerCase().trim(),
      access_token: passwordHash,
    });

    redirect("/sign-in?registered=true");
  }

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
        <div className="text-center">
          <h1 className="gradient-text text-2xl font-bold tracking-tight">
            LeadSens
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            Create your account
          </p>
        </div>

        <form action={handleSignUp} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-[13px] font-medium" style={{ color: "var(--color-text-secondary)" }}>
              Full name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Martin Paviot"
              className="auth-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-[13px] outline-none transition-colors"
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
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              placeholder="Min 6 characters"
              className="auth-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-[13px] outline-none transition-colors"
              style={{
                background: "var(--color-bg-page)",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-default)",
              }}
            />
          </div>
          <button
            type="submit"
            className="gradient-brand w-full rounded-lg px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-all hover:brightness-110"
          >
            Create account
          </button>
        </form>

        <p className="text-center text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium hover:underline" style={{ color: "var(--color-accent)" }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
