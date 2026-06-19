"use client";

/**
 * Personal reply snippets in the composer (INBOX-X05). Click a chip to insert
 * the saved template with `{{firstName}}` etc. filled from the thread's contact;
 * "Save reply" captures the current draft as a new snippet. Persists the whole
 * set through PUT /api/inbox/snippets (owner-scoped user_preferences).
 */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { interpolateSnippet, firstNameOf, type Snippet, type SnippetVars } from "@/lib/inbox/snippets";

export function SnippetBar({
  snippets,
  onChange,
  onInsert,
  currentBody,
  contact,
}: {
  snippets: Snippet[];
  onChange: (next: Snippet[]) => void;
  onInsert: (text: string) => void;
  currentBody: string;
  contact: { name: string; email: string | null } | null;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const vars: SnippetVars = {
    firstName: firstNameOf(contact?.name),
    name: contact?.name ?? null,
    email: contact?.email ?? null,
  };

  async function persist(next: Snippet[]) {
    onChange(next); // optimistic
    try {
      const r = await fetch("/api/inbox/snippets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snippets: next }),
      });
      if (r.ok) {
        const data = (await r.json()) as { snippets?: Snippet[] };
        if (data.snippets) onChange(data.snippets);
      }
    } catch {
      /* keep the optimistic set; a reload re-syncs from the server */
    }
  }

  function saveCurrent() {
    const trimmed = name.trim();
    if (!trimmed || !currentBody.trim() || saving) return;
    setSaving(true);
    const next = [...snippets, { id: crypto.randomUUID(), name: trimmed, body: currentBody }];
    void persist(next).finally(() => {
      setSaving(false);
      setAdding(false);
      setName("");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2">
      <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
        Snippets
      </span>
      {snippets.map((s) => (
        <span
          key={s.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-secondary)" }}
        >
          <button
            type="button"
            onClick={() => onInsert(interpolateSnippet(s.body, vars))}
            title={`Insert "${s.name}"`}
          >
            {s.name}
          </button>
          <button
            type="button"
            onClick={() => void persist(snippets.filter((x) => x.id !== s.id))}
            aria-label={`Delete snippet ${s.name}`}
            className="opacity-50 transition-opacity hover:opacity-100"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveCurrent();
              }
              if (e.key === "Escape") {
                setAdding(false);
                setName("");
              }
            }}
            placeholder="Snippet name"
            className="w-28 rounded-md border px-2 py-0.5 text-[11px] outline-none"
            style={{
              borderColor: "var(--color-border-default)",
              background: "var(--color-bg-page)",
              color: "var(--color-text-primary)",
            }}
          />
          <button
            type="button"
            onClick={saveCurrent}
            disabled={!name.trim() || !currentBody.trim() || saving}
            className="text-[11px] font-medium disabled:opacity-50"
            style={{ color: "var(--color-accent)" }}
          >
            Save
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={!currentBody.trim()}
          title="Save the current reply as a snippet"
          className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] disabled:opacity-40"
          style={{ border: "1px dashed var(--color-border-default)", color: "var(--color-text-tertiary)" }}
        >
          <Plus size={11} /> Save reply
        </button>
      )}
    </div>
  );
}
