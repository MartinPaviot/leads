"use client";

import { useState } from "react";
import Link from "next/link";
import { BodyScrollUnlock } from "@/components/auth/body-scroll-unlock";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always pretend success — the route itself returns 200 unconditionally.
      setSubmitted(true);
    } catch (err) {
      console.warn("forgot-password: submit failed", err);
      // Still show the "check your inbox" screen — don't help an attacker
      // differentiate "this email exists" from "this email doesn't".
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

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
          <img src="/orion-icon.svg" alt="Orion" className="mb-3 h-10 w-10" />
          <h1 className="gradient-text text-2xl font-bold tracking-tight">Orion</h1>
        </div>

        {submitted ? (
          <div className="space-y-3 text-center">
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Check your inbox
            </h2>
            <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
              If an account exists for <strong>{email}</strong>, we&apos;ve sent a reset link.
              Check your inbox within a minute. The link expires in 1 hour.
            </p>
            <Link
              href="/sign-in"
              className="mt-4 inline-block text-[13px] font-medium hover:underline"
              style={{ color: "var(--color-accent)" }}
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-1 text-center">
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Forgot your password?
              </h2>
              <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-[13px] font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
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
                disabled={loading || !email}
                className="gradient-brand w-full rounded-lg px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send reset link"}
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
        )}
      </div>
    </div>
  );
}
