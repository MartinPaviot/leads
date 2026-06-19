"use client";

/**
 * Inbox AI data-handling profile (INBOX-P03) settings.
 *
 * Standard / Zero retention / Off, saved owner-scoped (user_preferences JSONB).
 * Inbox AI endpoints gate on this — "Off" disables them fail-closed.
 */

import { useEffect, useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type AiProcessingProfile = "standard" | "zero_retention" | "off";
interface AiProfileOption {
  id: AiProcessingProfile;
  label: string;
  description: string;
}

export default function InboxAiProfilePage() {
  const [options, setOptions] = useState<AiProfileOption[]>([]);
  const [profile, setProfile] = useState<AiProcessingProfile>("standard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox/ai-profile")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: { options?: AiProfileOption[]; profile?: AiProcessingProfile }) => {
        if (!cancelled) {
          setOptions(data.options ?? []);
          if (data.profile) setProfile(data.profile);
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

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch("/api/inbox/ai-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      if (r.ok) {
        const data = (await r.json()) as { profile?: AiProcessingProfile };
        if (data.profile) setProfile(data.profile);
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
        <ShieldCheck size={16} /> AI data handling
      </h1>
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        Control how the assistant processes your inbox.
      </p>

      <div className="mt-4 space-y-2">
        {options.map((o) => {
          const selected = profile === o.id;
          return (
            <label
              key={o.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"
              style={{
                borderColor: selected ? "var(--color-accent)" : "var(--color-border-default)",
                background: selected ? "var(--color-accent-soft)" : "var(--color-bg-card)",
              }}
            >
              <input
                type="radio"
                name="ai-profile"
                checked={selected}
                onChange={() => {
                  setProfile(o.id);
                  setSaved(false);
                }}
                className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {o.label}
                </span>
                <span className="block text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {o.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

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
