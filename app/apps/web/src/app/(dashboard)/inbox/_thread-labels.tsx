"use client";

/**
 * Shared thread labels (INBOX-X04). Tenant-wide tags any member can apply, with
 * autocomplete from labels already used in the workspace. Self-contained per
 * thread via /api/inbox/labels.
 */

import { useState, useEffect, useId } from "react";
import { Tag, X, Plus } from "lucide-react";
import { labelHue } from "@/lib/inbox/labels";
import { useT } from "@/lib/i18n/locale";

export function ThreadLabels({
  conversationKey,
  openSignal,
}: {
  conversationKey: string;
  /** B6: bumped by the page (`l` key / "Label" palette command) to open the
   * add-label input on the focused thread; `autoFocus` then focuses it. */
  openSignal?: number;
}) {
  const t = useT();
  const [labels, setLabels] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const listId = useId();

  useEffect(() => {
    let cancelled = false;
    setLabels([]);
    setAdding(false);
    setDraft("");
    fetch(`/api/inbox/labels?key=${encodeURIComponent(conversationKey)}`)
      .then((r) => (r.ok ? r.json() : { labels: [], suggestions: [] }))
      .then((d: { labels?: string[]; suggestions?: string[] }) => {
        if (cancelled) return;
        if (Array.isArray(d.labels)) setLabels(d.labels);
        if (Array.isArray(d.suggestions)) setSuggestions(d.suggestions);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationKey]);

  // Open the add-label input when the page bumps openSignal (`l` key / palette).
  // Declared AFTER the per-thread reset above so an explicit label-open wins when
  // both fire; the initial 0/undefined never auto-opens on first render.
  useEffect(() => {
    if (openSignal && openSignal > 0) setAdding(true);
  }, [openSignal]);

  async function apply(name: string) {
    const n = name.trim();
    if (!n) return;
    setDraft("");
    setAdding(false);
    try {
      const r = await fetch("/api/inbox/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: conversationKey, name: n }),
      });
      if (r.ok) {
        const d = (await r.json()) as { labels?: string[] };
        if (Array.isArray(d.labels)) setLabels(d.labels);
        setSuggestions((s) => (s.some((x) => x.toLowerCase() === n.toLowerCase()) ? s : [...s, n].sort()));
      }
    } catch {
      /* ignore — a reload re-syncs */
    }
  }

  async function remove(name: string) {
    setLabels((ls) => ls.filter((l) => l !== name)); // optimistic
    await fetch(`/api/inbox/labels?key=${encodeURIComponent(conversationKey)}&name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag size={12} className="shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
      {labels.map((l) => {
        const hue = labelHue(l);
        return (
          <span
            key={l}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{
              background: `hsl(${hue} 70% 95%)`,
              color: `hsl(${hue} 60% 32%)`,
              border: `1px solid hsl(${hue} 60% 85%)`,
            }}
          >
            {l}
            <button type="button" onClick={() => void remove(l)} aria-label={t("inbox.labels.removeAria", { l })} className="opacity-60 hover:opacity-100">
              <X size={10} />
            </button>
          </span>
        );
      })}
      {adding ? (
        <input
          autoFocus
          list={listId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void apply(draft);
            }
            if (e.key === "Escape") {
              setAdding(false);
              setDraft("");
            }
          }}
          onBlur={() => (draft.trim() ? void apply(draft) : setAdding(false))}
          placeholder={t("inbox.labels.placeholder")}
          className="w-28 rounded-full border px-2 py-0.5 text-[11px] outline-none"
          style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-page)", color: "var(--color-text-primary)" }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px]"
          style={{ border: "1px dashed var(--color-border-default)", color: "var(--color-text-tertiary)" }}
        >
          <Plus size={10} /> {t("inbox.labels.add")}
        </button>
      )}
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
