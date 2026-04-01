"use client";

import { useState, useEffect } from "react";

interface Mailbox {
  id: string;
  emailAddress: string;
  displayName: string;
  provider: string;
  domain: string;
  status: string;
  dailyLimit: number;
  sentToday: number;
  sentTotal: number;
  healthScore: number;
  warmupStartedAt: string | null;
  warmupDailyTarget: number;
  warmupCompletedAt: string | null;
  createdAt: string;
}

export default function MailboxesPage() {
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    email: "",
    displayName: "",
    provider: "gmail",
    password: "",
  });
  const [saving, setSaving] = useState(false);

  async function loadMailboxes() {
    try {
      const res = await fetch("/api/settings/mailboxes");
      const data = await res.json();
      setMailboxes(data.mailboxes || []);
    } catch {
      console.error("Failed to load mailboxes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMailboxes();
  }, []);

  async function connectMailbox(e: React.FormEvent) {
    e.preventDefault();
    if (!form.email) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          displayName: form.displayName || form.email.split("@")[0],
          provider: form.provider,
          password: form.password,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ email: "", displayName: "", provider: "gmail", password: "" });
        loadMailboxes();
      }
    } catch {
      console.error("Failed to connect mailbox");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMailbox(id: string) {
    try {
      await fetch(`/api/settings/mailboxes?id=${id}`, { method: "DELETE" });
      loadMailboxes();
    } catch {
      console.error("Failed to delete mailbox");
    }
  }

  async function skipWarmup(id: string) {
    try {
      await fetch(`/api/settings/mailboxes?id=${id}&action=skip-warmup`, { method: "PATCH" });
      loadMailboxes();
    } catch {
      console.error("Failed to skip warmup");
    }
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      warming_up: "bg-yellow-500/20 text-yellow-400",
      active: "bg-green-500/20 text-green-400",
      paused: "bg-gray-500/20 text-gray-400",
      disabled: "bg-red-500/20 text-red-400",
      error: "bg-red-500/20 text-red-400",
    };
    return colors[status] || "bg-gray-500/20 text-gray-400";
  }

  function warmupProgress(mailbox: Mailbox) {
    if (mailbox.status !== "warming_up" || !mailbox.warmupStartedAt) return null;
    const daysSinceStart = Math.floor(
      (Date.now() - new Date(mailbox.warmupStartedAt).getTime()) / 86400000
    );
    const progress = Math.min(100, (daysSinceStart / 21) * 100);
    return { daysSinceStart, progress };
  }

  if (loading) {
    return (
      <>
        <h1 className="text-xl font-semibold">Connected mailboxes</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Loading...</p>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Connected mailboxes</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Manage email accounts used for outbound sequences.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Connect Mailbox
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={connectMailbox}
          className="mt-4 space-y-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-surface)] p-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-text-secondary)]">Email address</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="sales@company.com"
                className="mt-1 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-base)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-secondary)]">Display name</label>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="Martin"
                className="mt-1 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-base)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-secondary)]">Provider</label>
              <select
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-base)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="gmail">Gmail</option>
                <option value="outlook">Outlook</option>
                <option value="smtp_custom">Custom SMTP/IMAP</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-secondary)]">App password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="App-specific password"
                className="mt-1 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-base)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !form.email}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Connecting..." : "Connect"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-[rgba(255,255,255,0.08)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {mailboxes.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-[var(--color-text-secondary)]">No mailboxes connected yet.</p>
          <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
            Connect a mailbox to start sending outbound emails.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {mailboxes.map((mb) => {
            const wp = warmupProgress(mb);
            return (
              <div
                key={mb.id}
                className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.08)] bg-[var(--color-bg-surface)] px-4 py-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">
                      {mb.emailAddress}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${statusBadge(mb.status)}`}
                    >
                      {mb.status === "warming_up"
                        ? `Warming up${wp ? ` — Day ${wp.daysSinceStart}/21` : ""}`
                        : mb.status}
                    </span>
                    <span className="text-xs text-[var(--color-text-tertiary)]">{mb.provider}</span>
                  </div>
                  {wp && (
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-1.5 w-48 rounded-full bg-[var(--color-bg-muted)]">
                        <div
                          className="h-full rounded-full bg-yellow-500"
                          style={{ width: `${wp.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[var(--color-text-tertiary)]">
                        {mb.warmupDailyTarget}/day target
                      </span>
                      <button
                        onClick={() => skipWarmup(mb.id)}
                        className="text-[10px] text-[var(--color-accent)] hover:opacity-90"
                      >
                        Skip warm-up
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-6 text-xs text-[var(--color-text-secondary)]">
                  <div>
                    <span className="text-[var(--color-text-primary)]">{mb.sentToday}</span>/{mb.dailyLimit} today
                  </div>
                  <div>
                    <span className="text-[var(--color-text-primary)]">{mb.sentTotal}</span> total
                  </div>
                  <div>
                    Health:{" "}
                    <span
                      className={
                        mb.healthScore >= 80
                          ? "text-green-400"
                          : mb.healthScore >= 50
                          ? "text-yellow-400"
                          : "text-red-400"
                      }
                    >
                      {mb.healthScore}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteMailbox(mb.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
