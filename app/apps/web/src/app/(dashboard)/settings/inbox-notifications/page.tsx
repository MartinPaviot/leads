"use client";

/**
 * Inbox notification preferences (INBOX-N01 / N02 / N03) settings.
 *
 * Per-event opt-in, digest cadence, and a do-not-disturb quiet window. Saved
 * owner-scoped (user_preferences JSONB). Delivery is gated elsewhere via
 * shouldNotify — this screen only manages the preferences.
 */

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type DigestMode = "off" | "morning" | "morning_evening";
interface NotifiableEvent {
  id: string;
  label: string;
  description: string;
  default: boolean;
}
interface NotificationPrefs {
  events: Record<string, boolean>;
  digest: DigestMode;
  dndStart: string | null;
  dndEnd: string | null;
}

const DIGEST_OPTIONS: { value: DigestMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "morning", label: "Morning" },
  { value: "morning_evening", label: "Morning + evening" },
];

const inputStyle = {
  borderColor: "var(--color-border-default)",
  background: "var(--color-bg-page)",
  color: "var(--color-text-primary)",
} as const;

export default function InboxNotificationsPage() {
  const [events, setEvents] = useState<NotifiableEvent[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs>({ events: {}, digest: "morning", dndStart: null, dndEnd: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox/notifications")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: { events?: NotifiableEvent[]; prefs?: NotificationPrefs }) => {
        if (!cancelled) {
          setEvents(data.events ?? []);
          if (data.prefs) setPrefs(data.prefs);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function enabled(e: NotifiableEvent): boolean {
    const v = prefs.events[e.id];
    return typeof v === "boolean" ? v : e.default;
  }
  function toggle(e: NotifiableEvent) {
    setPrefs((p) => ({ ...p, events: { ...p.events, [e.id]: !enabled(e) } }));
    setSaved(false);
  }
  function patch(p: Partial<NotificationPrefs>) {
    setPrefs((prev) => ({ ...prev, ...p }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch("/api/inbox/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (r.ok) {
        const data = (await r.json()) as { prefs?: NotificationPrefs };
        if (data.prefs) setPrefs(data.prefs);
        setSaved(true);
      }
    } catch {
      /* fail-soft */
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 size={18} className="animate-spin" style={{ color: "var(--color-text-tertiary)" }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="flex items-center gap-2 text-[16px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
        <Bell size={16} /> Notifications
      </h1>
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        Choose what's worth interrupting you for, when to get a digest, and quiet hours.
      </p>

      <section className="mt-5">
        <h2 className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
          Notify me about
        </h2>
        <div className="mt-2 divide-y" style={{ borderColor: "var(--color-border-default)" }}>
          {events.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
              <span className="min-w-0">
                <span className="block text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {e.label}
                </span>
                <span className="block text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {e.description}
                </span>
              </span>
              <input
                type="checkbox"
                checked={enabled(e)}
                onChange={() => toggle(e)}
                className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
              />
            </label>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
          Digest
        </h2>
        <div className="mt-2 flex gap-1.5">
          {DIGEST_OPTIONS.map((o) => {
            const selected = prefs.digest === o.value;
            return (
              <button
                key={o.value}
                onClick={() => patch({ digest: o.value })}
                className="rounded-md border px-2.5 py-1 text-[12px]"
                style={{
                  borderColor: "var(--color-border-default)",
                  background: selected ? "var(--color-accent)" : "transparent",
                  color: selected ? "var(--color-accent-foreground, #fff)" : "var(--color-text-secondary)",
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
          Do not disturb
        </h2>
        <div className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          <span>From</span>
          <input
            type="time"
            value={prefs.dndStart ?? ""}
            onChange={(e) => patch({ dndStart: e.target.value || null })}
            className="rounded-md border px-2 py-1 text-[12px] outline-none"
            style={inputStyle}
          />
          <span>to</span>
          <input
            type="time"
            value={prefs.dndEnd ?? ""}
            onChange={(e) => patch({ dndEnd: e.target.value || null })}
            className="rounded-md border px-2 py-1 text-[12px] outline-none"
            style={inputStyle}
          />
          <span style={{ color: "var(--color-text-muted)" }}>(quiet hours; wraps past midnight)</span>
        </div>
      </section>

      <div className="mt-6 flex items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 size={13} className="animate-spin" /> : null}
          {saving ? "Saving…" : "Save"}
        </Button>
        {saved && (
          <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Saved.
          </span>
        )}
      </div>
    </div>
  );
}
