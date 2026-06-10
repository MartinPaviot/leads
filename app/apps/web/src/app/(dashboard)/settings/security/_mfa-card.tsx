"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";

interface MfaStatus {
  enabled: boolean;
  pending: boolean;
  recoveryCodesRemaining: number;
}

const inputStyle: React.CSSProperties = {
  background: "var(--color-bg-page)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-default)",
};

/**
 * Two-factor authentication card (SOC2 T4).
 * Enable: server mints a TOTP secret -> user adds it to an authenticator
 * (otpauth link or manual key) -> first valid code activates and shows
 * the 10 single-use recovery codes exactly once.
 */
export function MfaCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<{
    otpauthUrl: string;
    manualKey: string;
  } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableSecret, setDisableSecret] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/account/mfa");
      if (res.ok) setStatus((await res.json()) as MfaStatus);
    } catch {
      // leave the card in its current state; next action retries
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startEnrollment() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/mfa", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setEnrollment(data as { otpauthUrl: string; manualKey: string });
      } else {
        toast((data as { error?: string }).error ?? "Could not start setup.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/mfa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: confirmCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setRecoveryCodes((data as { recoveryCodes: string[] }).recoveryCodes);
        setEnrollment(null);
        setConfirmCode("");
        toast("Two-factor authentication enabled.", "success");
        void refresh();
      } else {
        toast((data as { error?: string }).error ?? "Code didn't match.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      // The same field accepts the password or a current code; the server
      // tries password first, then TOTP/recovery.
      const body = /^\d{6}$/.test(disableSecret.trim())
        ? { code: disableSecret.trim() }
        : { password: disableSecret, code: disableSecret.trim() };
      const res = await fetch("/api/account/mfa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setDisableSecret("");
        setRecoveryCodes(null);
        toast("Two-factor authentication disabled.", "success");
        void refresh();
      } else {
        toast((data as { error?: string }).error ?? "Verification failed.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-5 space-y-3 rounded-xl p-5"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Two-factor authentication
          </h2>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Require a 6-digit code from an authenticator app at sign-in.
          </p>
        </div>
        {status && (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={
              status.enabled
                ? {
                    background: "rgba(16,185,129,0.08)",
                    color: "var(--color-success, #059669)",
                    border: "1px solid rgba(16,185,129,0.25)",
                  }
                : {
                    background: "var(--color-bg-hover)",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border-default)",
                  }
            }
          >
            {status.enabled ? "Enabled" : "Off"}
          </span>
        )}
      </div>

      {/* Recovery codes — rendered exactly once, right after activation. */}
      {recoveryCodes && (
        <div
          className="rounded-lg p-3"
          style={{
            background: "var(--color-bg-hover)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          <p className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            Recovery codes — store them now, they will not be shown again.
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
            Each code signs you in once if you lose your authenticator.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[12px]" style={{ color: "var(--color-text-primary)" }}>
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
            onClick={() => {
              void navigator.clipboard.writeText(recoveryCodes.join("\n"));
              toast("Recovery codes copied.", "success");
            }}
          >
            Copy all
          </button>
        </div>
      )}

      {status && !status.enabled && !enrollment && (
        <button
          type="button"
          onClick={startEnrollment}
          disabled={busy}
          className="rounded-md px-4 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--color-accent)" }}
        >
          {busy ? "Preparing…" : "Enable two-factor authentication"}
        </button>
      )}

      {enrollment && (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-4 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            <li>
              Open your authenticator app (Google Authenticator, 1Password, Authy…) and{" "}
              <a href={enrollment.otpauthUrl} className="underline" style={{ color: "var(--color-accent)" }}>
                add Elevay with this link
              </a>{" "}
              or enter the key below manually.
            </li>
            <li>Enter the 6-digit code it shows to finish.</li>
          </ol>
          <div className="flex items-center gap-2">
            <code
              className="rounded-md px-2.5 py-1.5 font-mono text-[12px] tracking-wide"
              style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
            >
              {enrollment.manualKey}
            </code>
            <button
              type="button"
              className="rounded-md px-2.5 py-1.5 text-[12px]"
              style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-secondary)" }}
              onClick={() => {
                void navigator.clipboard.writeText(enrollment.manualKey.replace(/\s/g, ""));
                toast("Setup key copied.", "success");
              }}
            >
              Copy
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              inputMode="numeric"
              placeholder="123456"
              maxLength={6}
              className="auth-input w-32 rounded-lg px-3 py-2 text-[13px] outline-none"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={confirm}
              disabled={busy || confirmCode.trim().length !== 6}
              className="rounded-md px-4 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--color-accent)" }}
            >
              {busy ? "Verifying…" : "Verify and enable"}
            </button>
          </div>
        </div>
      )}

      {status?.enabled && (
        <div className="space-y-2">
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            {status.recoveryCodesRemaining} recovery code
            {status.recoveryCodesRemaining === 1 ? "" : "s"} remaining.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={disableSecret}
              onChange={(e) => setDisableSecret(e.target.value)}
              type="password"
              placeholder="Password or current code"
              className="auth-input w-56 rounded-lg px-3 py-2 text-[13px] outline-none"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={disable}
              disabled={busy || !disableSecret}
              className="rounded-md px-4 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{ border: "1px solid var(--color-border-default)", color: "var(--color-error, #b91c1c)" }}
            >
              {busy ? "Working…" : "Disable"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
