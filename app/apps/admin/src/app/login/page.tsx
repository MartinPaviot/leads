"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: "var(--color-bg-base)" }}
    >
      <div
        className="w-full max-w-sm rounded-xl p-8"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        }}
      >
        <div className="mb-6 flex flex-col items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: "var(--color-accent-soft)" }}
          >
            <Lock size={18} style={{ color: "var(--color-accent)" }} />
          </div>
          <h1
            className="text-[18px] font-semibold"
            style={{ color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}
          >
            Admin Access
          </h1>
          <p className="text-[13px] text-center" style={{ color: "var(--color-text-tertiary)" }}>
            Enter the admin secret to access the operations center.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              htmlFor="password"
              className="mb-1.5 block text-[12px] font-medium"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Admin Secret
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin secret"
              autoFocus
              required
              className="w-full rounded-lg px-3 py-2 text-[13px] outline-none transition-colors"
              style={{
                border: "1px solid var(--color-border-default)",
                background: "var(--color-bg-base)",
                color: "var(--color-text-primary)",
              }}
              onFocus={(e) => {
                (e.target as HTMLInputElement).style.borderColor = "var(--color-accent)";
              }}
              onBlur={(e) => {
                (e.target as HTMLInputElement).style.borderColor = "var(--color-border-default)";
              }}
            />
          </div>

          {error && (
            <div
              className="mb-4 rounded-lg px-3 py-2 text-[12px] font-medium"
              style={{ background: "oklch(0.95 0.03 25)", color: "var(--color-danger)" }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg px-4 py-2 text-[13px] font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: "var(--color-accent)" }}
          >
            {loading ? "Verifying..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
