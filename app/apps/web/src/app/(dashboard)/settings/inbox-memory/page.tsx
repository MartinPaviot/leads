"use client";

/**
 * Inbox AI memory / standing instructions (INBOX-O02) settings.
 *
 * The user's persistent instructions ("always sign as Martin", "keep replies
 * short") + a few facts about them, saved owner-scoped (user_preferences JSONB)
 * and injected into the inbox draft / ask prompts. Auto-send / skip-approval
 * instructions are never honored — drafts stay approval-gated.
 */

import { useEffect, useState } from "react";
import { Sparkles, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StandingInstruction {
  id: string;
  text: string;
}
interface AboutMe {
  signOffName?: string;
  companyLine?: string;
  keyColleagues?: string[];
}
interface InboxMemory {
  standingInstructions: StandingInstruction[];
  aboutMe: AboutMe;
}

const MAX_INSTRUCTIONS = 12;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `i-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

const inputStyle = {
  borderColor: "var(--color-border-default)",
  background: "var(--color-bg-page)",
  color: "var(--color-text-primary)",
} as const;

export default function InboxMemoryPage() {
  const [memory, setMemory] = useState<InboxMemory>({ standingInstructions: [], aboutMe: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inbox/memory")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: { memory?: InboxMemory }) => {
        if (!cancelled && data.memory) {
          setMemory({
            standingInstructions: data.memory.standingInstructions ?? [],
            aboutMe: data.memory.aboutMe ?? {},
          });
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

  function setInstruction(id: string, text: string) {
    setMemory((m) => ({
      ...m,
      standingInstructions: m.standingInstructions.map((s) => (s.id === id ? { ...s, text } : s)),
    }));
    setSaved(false);
  }
  function addInstruction() {
    setMemory((m) =>
      m.standingInstructions.length >= MAX_INSTRUCTIONS
        ? m
        : { ...m, standingInstructions: [...m.standingInstructions, { id: newId(), text: "" }] },
    );
    setSaved(false);
  }
  function removeInstruction(id: string) {
    setMemory((m) => ({ ...m, standingInstructions: m.standingInstructions.filter((s) => s.id !== id) }));
    setSaved(false);
  }
  function setAbout(patch: Partial<AboutMe>) {
    setMemory((m) => ({ ...m, aboutMe: { ...m.aboutMe, ...patch } }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch("/api/inbox/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memory),
      });
      if (r.ok) {
        const data = (await r.json()) as { memory?: InboxMemory };
        if (data.memory) setMemory({
          standingInstructions: data.memory.standingInstructions ?? [],
          aboutMe: data.memory.aboutMe ?? {},
        });
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
        <Sparkles size={16} /> AI memory &amp; standing instructions
      </h1>
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        Tell the assistant how to write for you — it follows these whenever it drafts or answers in your inbox.
        Drafts are always shown for approval, so instructions to send automatically are ignored.
      </p>

      <section className="mt-5">
        <h2 className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
          Standing instructions
        </h2>
        <div className="mt-2 space-y-2">
          {memory.standingInstructions.length === 0 && (
            <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              None yet. Add one like “Keep replies under 120 words” or “Always propose a next step”.
            </p>
          )}
          {memory.standingInstructions.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <input
                value={s.text}
                maxLength={500}
                onChange={(e) => setInstruction(s.id, e.target.value)}
                placeholder="e.g. Always sign as Martin"
                className="min-w-0 flex-1 rounded-md border px-2 py-1 text-[12px] outline-none"
                style={inputStyle}
              />
              <button
                onClick={() => removeInstruction(s.id)}
                aria-label="Remove instruction"
                className="shrink-0 rounded p-1"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        {memory.standingInstructions.length < MAX_INSTRUCTIONS && (
          <button
            onClick={addInstruction}
            className="mt-2 text-[12px] font-medium"
            style={{ color: "var(--color-accent)" }}
          >
            + Add instruction
          </button>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
          About you
        </h2>
        <div className="mt-2 grid gap-2">
          <label className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            Sign off as
            <input
              value={memory.aboutMe.signOffName ?? ""}
              maxLength={80}
              onChange={(e) => setAbout({ signOffName: e.target.value })}
              placeholder="Martin"
              className="mt-0.5 w-full rounded-md border px-2 py-1 text-[12px] outline-none"
              style={inputStyle}
            />
          </label>
          <label className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            One line about your company
            <input
              value={memory.aboutMe.companyLine ?? ""}
              maxLength={200}
              onChange={(e) => setAbout({ companyLine: e.target.value })}
              placeholder="Elevay — autonomous GTM for founder-led sales"
              className="mt-0.5 w-full rounded-md border px-2 py-1 text-[12px] outline-none"
              style={inputStyle}
            />
          </label>
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
