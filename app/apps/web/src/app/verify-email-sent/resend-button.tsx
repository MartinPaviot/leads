"use client";

import { useEffect, useState } from "react";

/**
 * Resend-verification button with a 30s cooldown after each click. The
 * server already rate-limits at 3/hour but the client-side cooldown is
 * what makes the UI feel intentional — without it people mash the
 * button and assume it's broken.
 */
export function ResendVerifyButton() {
  const [cooldown, setCooldown] = useState(0);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const disabled = cooldown > 0 || state === "sending";

  async function send() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-email/send", { method: "POST" });
      if (!res.ok) {
        setState("error");
        setError("We couldn't resend right now. Try again in a moment.");
        return;
      }
      setState("sent");
      setCooldown(30);
    } catch {
      setState("error");
      setError("Network error. Try again.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={send}
        disabled={disabled}
        aria-busy={state === "sending"}
        className="rounded-lg px-4 py-2 text-[13px] font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: "var(--color-bg-card)",
          color: "var(--color-text-primary)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        {state === "sending"
          ? "Sending…"
          : cooldown > 0
            ? `Resend in ${cooldown}s`
            : state === "sent"
              ? "Email sent — check your inbox"
              : "Resend verification email"}
      </button>
      {error && (
        <p
          role="alert"
          className="text-[12px]"
          style={{ color: "var(--color-error, #b91c1c)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
