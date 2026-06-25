"use client";

import { useState } from "react";

interface MailboxWarmup {
  email: string;
  warmupStatus: number | null;
  warmupScore: number | null;
}

const STATUS_LABEL: Record<number, string> = {
  1: "active",
  0: "paused",
  [-1]: "banned",
  [-2]: "spam folder",
  [-3]: "suspended",
};

const statusColor = (s: number | null): string => {
  if (s === 1) return "var(--color-accent)";
  if (s === -1 || s === -2 || s === -3) return "#e5484d";
  return "var(--color-text-tertiary)";
};

export function WarmupControls({ tenant }: { tenant: { id: string; name: string | null } }) {
  const [busy, setBusy] = useState<null | "enable" | "disable" | "status">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mailboxes, setMailboxes] = useState<MailboxWarmup[] | null>(null);

  async function act(action: "enable" | "disable") {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id, action }),
      });
      const data = (await res.json()) as { ok?: boolean; mailboxes?: number; reason?: string };
      setMessage(
        data.ok
          ? `Warmup ${action}d on ${data.mailboxes} mailbox${data.mailboxes === 1 ? "" : "es"}.`
          : `Failed: ${data.reason ?? "unknown error"}`,
      );
    } catch {
      setMessage("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function loadStatus() {
    setBusy("status");
    setMessage(null);
    try {
      const res = await fetch(`/api/warmup?tenantId=${encodeURIComponent(tenant.id)}`);
      const data = (await res.json()) as { ok?: boolean; mailboxes?: MailboxWarmup[]; error?: string };
      if (data.ok && data.mailboxes) {
        setMailboxes(data.mailboxes);
        if (data.mailboxes.length === 0) setMessage("No mailboxes on this Instantly workspace.");
      } else {
        setMessage(`Failed: ${data.error ?? "unknown error"}`);
      }
    } catch {
      setMessage("Request failed.");
    } finally {
      setBusy(null);
    }
  }

  const btn = "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50";

  return (
    <div
      className="rounded-xl border px-5 py-4"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            {tenant.name ?? "(unnamed)"}
          </div>
          <div className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {tenant.id}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={btn}
            disabled={busy !== null}
            onClick={loadStatus}
            style={{ color: "var(--color-text-secondary)", background: "var(--color-accent-soft)" }}
          >
            {busy === "status" ? "Checking…" : "Check status"}
          </button>
          <button
            className={btn}
            disabled={busy !== null}
            onClick={() => act("enable")}
            style={{ color: "#fff", background: "var(--color-accent)" }}
          >
            {busy === "enable" ? "Enabling…" : "Enable warmup"}
          </button>
          <button
            className={btn}
            disabled={busy !== null}
            onClick={() => act("disable")}
            style={{ color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}
          >
            {busy === "disable" ? "Disabling…" : "Disable"}
          </button>
        </div>
      </div>

      {message && (
        <div className="mt-3 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          {message}
        </div>
      )}

      {mailboxes && mailboxes.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {mailboxes.map((m) => (
            <div key={m.email} className="flex items-center justify-between text-[12px]">
              <span style={{ color: "var(--color-text-secondary)" }}>{m.email}</span>
              <span className="flex items-center gap-3">
                <span style={{ color: statusColor(m.warmupStatus) }}>
                  {m.warmupStatus === null ? "—" : STATUS_LABEL[m.warmupStatus] ?? `status ${m.warmupStatus}`}
                </span>
                <span style={{ color: "var(--color-text-primary)" }}>
                  {m.warmupScore === null ? "—" : `${m.warmupScore}/100`}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
