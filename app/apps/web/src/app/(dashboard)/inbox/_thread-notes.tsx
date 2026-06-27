"use client";

/**
 * Private notes on a thread (INBOX-X06). A founder's own scratchpad on a
 * conversation — internal-only, never sent or quoted. Self-contained: fetches
 * and mutates /api/inbox/notes for the open thread.
 */

import { useState, useEffect } from "react";
import { StickyNote, X, Plus, Loader2 } from "lucide-react";
import { timeAgo } from "./_time-ago";
import type { ThreadNote } from "@/lib/inbox/notes";
import { useT } from "@/lib/i18n/locale";

export function ThreadNotes({ conversationKey }: { conversationKey: string }) {
  const t = useT();
  const [notes, setNotes] = useState<ThreadNote[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setNotes([]);
    setDraft("");
    fetch(`/api/inbox/notes?key=${encodeURIComponent(conversationKey)}`)
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      .then((d: { notes?: ThreadNote[] }) => {
        if (!cancelled && Array.isArray(d.notes)) setNotes(d.notes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationKey]);

  async function add() {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/inbox/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: conversationKey, content }),
      });
      if (r.ok) {
        const d = (await r.json()) as { note: ThreadNote };
        setNotes((n) => [d.note, ...n]);
        setDraft("");
      }
    } catch {
      /* leave the draft so the user can retry */
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setNotes((n) => n.filter((x) => x.id !== id)); // optimistic
    await fetch(`/api/inbox/notes?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div
      className="mb-3 rounded-lg border p-3"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      <span
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <StickyNote size={12} /> {t("inbox.threadNotes.title")}
      </span>

      {notes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {notes.map((n) => (
            <li
              key={n.id}
              className="group flex items-start justify-between gap-2 rounded-md px-2 py-1.5"
              style={{ background: "var(--color-bg-page)" }}
            >
              <div className="min-w-0">
                <p className="whitespace-pre-wrap break-words text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                  {n.content}
                </p>
                <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                  {timeAgo(n.createdAt)} · {t("inbox.threadNotes.onlyYou")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void remove(n.id)}
                aria-label={t("inbox.threadNotes.delete")}
                className="mt-0.5 shrink-0 opacity-50 transition-opacity hover:opacity-100"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-start gap-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void add();
            }
          }}
          rows={1}
          placeholder={t("inbox.threadNotes.placeholder")}
          className="min-h-[28px] flex-1 resize-none rounded-md border px-2 py-1 text-[12px] outline-none"
          style={{
            borderColor: "var(--color-border-default)",
            background: "var(--color-bg-page)",
            color: "var(--color-text-primary)",
          }}
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={!draft.trim() || saving}
          className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium disabled:opacity-40"
          style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-secondary)" }}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {t("inbox.threadNotes.add")}
        </button>
      </div>
    </div>
  );
}
