"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { SettingsHeader } from "@/components/ui/settings-header";

/**
 * `/settings/security` — Password change.
 *
 * Minimal v1: requires current password + new password. Shown only to
 * users who actually have a credentials account (the endpoint returns a
 * hint if they're SSO-only). 2FA + active-sessions list are v2 ideas.
 */
export default function SecurityPage() {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (next !== confirm) {
      toast("New passwords don't match.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (res.ok) {
        toast("Password updated.", "success");
        setCurrent("");
        setNext("");
        setConfirm("");
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast(data.error ?? "Password change failed.", "error");
      }
    } catch (err) {
      console.warn("security: password change failed", err);
      toast("Network error. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <SettingsHeader
        title="Security"
        subtitle="Change your password. For SSO accounts, use the provider's own security settings."
      />

      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-xl p-5"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        <div>
          <label
            htmlFor="current"
            className="block text-[12px] font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Current password
          </label>
          <input
            id="current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
            className="auth-input mt-1.5 w-full rounded-lg px-3 py-2 text-[13px] outline-none"
            style={{
              background: "var(--color-bg-page)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="new"
            className="block text-[12px] font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            New password
          </label>
          <input
            id="new"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
            minLength={10}
            className="auth-input mt-1.5 w-full rounded-lg px-3 py-2 text-[13px] outline-none"
            style={{
              background: "var(--color-bg-page)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
            }}
          />
          <p
            className="mt-1 text-[11px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            At least 12 characters with a digit, lowercase, and uppercase letter.
          </p>
        </div>

        <div>
          <label
            htmlFor="confirm"
            className="block text-[12px] font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            minLength={10}
            className="auth-input mt-1.5 w-full rounded-lg px-3 py-2 text-[13px] outline-none"
            style={{
              background: "var(--color-bg-page)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border-default)",
            }}
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving || !current || !next || !confirm}
            className="rounded-md px-4 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--color-accent)" }}
          >
            {saving ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </div>
  );
}
