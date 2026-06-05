"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BodyScrollUnlock } from "@/components/auth/body-scroll-unlock";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!clientAcceptable(password)) {
      setError(
        "Password must be at least 12 characters and include a digit, a lowercase letter, and an uppercase letter."
      );
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        router.push("/sign-in?reason=password-reset-success");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Reset failed. Please try again.");
    } catch (err) {
      setError("Network error. Try again.");
      console.warn("reset-password: submit failed", err);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-3 text-center">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Invalid reset link
        </h2>
        <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          This link is missing its token.{" "}
          <Link
            href="/forgot-password"
            className="font-medium hover:underline"
            style={{ color: "var(--color-accent)" }}
          >
            Request a new one
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Set a new password
        </h2>
        <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          At least 12 characters with a digit, a lowercase letter, and an uppercase letter.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="password"
            className="block text-[13px] font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-[13px] outline-none transition-colors"
            style={{
              background: "var(--color-bg-page)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
            }}
          />
        </div>
        <div>
          <label
            htmlFor="confirm"
            className="block text-[13px] font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Confirm password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="auth-input mt-1.5 w-full rounded-lg px-3 py-2.5 text-[13px] outline-none transition-colors"
            style={{
              background: "var(--color-bg-page)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
            }}
          />
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-lg px-3 py-2 text-[12px]"
            style={{
              background: "rgba(220,38,38,0.08)",
              color: "var(--color-error, #b91c1c)",
              border: "1px solid rgba(220,38,38,0.25)",
            }}
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading || !password || !confirm}
          className="gradient-brand w-full rounded-lg px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>

      <p className="text-center text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
        <Link
          href="/sign-in"
          className="font-medium hover:underline"
          style={{ color: "var(--color-accent)" }}
        >
          Back to sign in
        </Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
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
          <img src="/logo-elevay.svg" alt="Elevay" className="mb-3 h-10 w-10" />
          <h1 className="gradient-text text-2xl font-bold tracking-tight">Elevay</h1>
        </div>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}

function clientAcceptable(pwd: string): boolean {
  return (
    pwd.length >= 10 &&
    /[0-9]/.test(pwd) &&
    /[a-z]/.test(pwd) &&
    /[A-Z]/.test(pwd)
  );
}
