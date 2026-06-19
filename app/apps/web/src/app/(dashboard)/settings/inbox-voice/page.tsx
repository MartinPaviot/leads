"use client";

/**
 * Inbox voice calibration (INBOX-O03) settings.
 *
 * Pick a tone preset and add free-form guidance; saved owner-scoped
 * (user_preferences JSONB) and prepended to the drafting prompts. Complements
 * the standing-instructions screen (O02).
 */

import { useEffect, useState } from "react";
import { MessageSquareText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type VoiceTone = "neutral" | "warm" | "direct" | "formal" | "concise";
interface VoiceOption {
  id: VoiceTone;
  label: string;
  hint: string;
}
interface VoicePrefs {
  tone: VoiceTone;
  customGuidance?: string;
}

export default function InboxVoicePage() {
  const [options, setOptions] = useState<VoiceOption[]>([]);
  const [voice, setVoice] = useState<VoicePrefs>({ tone: "neutral" });
  // B1: pre-draft reply-worthy threads on open (default off). Persisted by the
  // same Save action, owner-scoped in user_preferences (resource inbox, key auto_draft).
  const [autoDraft, setAutoDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox/voice")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: { options?: VoiceOption[]; voice?: VoicePrefs }) => {
        if (!cancelled) {
          setOptions(data.options ?? []);
          if (data.voice) setVoice(data.voice);
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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox/auto-draft")
      .then((r) => (r.ok ? r.json() : { autoDraft: { enabled: false } }))
      .then((data: { autoDraft?: { enabled?: boolean } }) => {
        if (!cancelled) setAutoDraft(data.autoDraft?.enabled === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const [r] = await Promise.all([
        fetch("/api/inbox/voice", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(voice),
        }),
        fetch("/api/inbox/auto-draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: autoDraft }),
        }),
      ]);
      if (r.ok) {
        const data = (await r.json()) as { voice?: VoicePrefs };
        if (data.voice) setVoice(data.voice);
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
        <MessageSquareText size={16} /> Writing voice
      </h1>
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        How drafts should sound. The assistant still grounds every draft in the thread and never sends on its own.
      </p>

      <div className="mt-4 space-y-2">
        {options.map((o) => {
          const selected = voice.tone === o.id;
          return (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border p-2.5"
              style={{
                borderColor: selected ? "var(--color-accent)" : "var(--color-border-default)",
                background: selected ? "var(--color-accent-soft)" : "var(--color-bg-card)",
              }}
            >
              <input
                type="radio"
                name="voice-tone"
                checked={selected}
                onChange={() => {
                  setVoice((v) => ({ ...v, tone: o.id }));
                  setSaved(false);
                }}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              <span>
                <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {o.label}
                </span>
                <span className="ml-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {o.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-4">
        <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
          Extra guidance (optional)
        </label>
        <textarea
          value={voice.customGuidance ?? ""}
          maxLength={300}
          onChange={(e) => {
            setVoice((v) => ({ ...v, customGuidance: e.target.value }));
            setSaved(false);
          }}
          placeholder="e.g. Use the prospect's first name and always offer a short call."
          rows={3}
          className="mt-1 w-full rounded-md border px-2 py-1.5 text-[12px] outline-none"
          style={{
            borderColor: "var(--color-border-default)",
            background: "var(--color-bg-page)",
            color: "var(--color-text-primary)",
          }}
        />
      </div>

      {/* B1 auto-draft toggle (R4.5): pre-draft reply-worthy threads on open.
          Never overrides selectivity — non-reply-worthy threads never auto-draft. */}
      <label
        className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border p-3"
        style={{
          borderColor: autoDraft ? "var(--color-accent)" : "var(--color-border-default)",
          background: autoDraft ? "var(--color-accent-soft)" : "var(--color-bg-card)",
        }}
      >
        <input
          type="checkbox"
          checked={autoDraft}
          onChange={() => {
            setAutoDraft((v) => !v);
            setSaved(false);
          }}
          className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
        />
        <span className="min-w-0">
          <span className="block text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            Pre-draft replies on open
          </span>
          <span className="block text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            When you open a thread that warrants a reply, prepare a voice-matched draft automatically. It is never sent on its own, and threads that don&apos;t need a reply are left untouched.
          </span>
        </span>
      </label>

      <div className="mt-5 flex items-center gap-3">
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
