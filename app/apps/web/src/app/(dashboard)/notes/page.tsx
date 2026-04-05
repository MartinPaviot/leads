"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardBody } from "@/components/ui/card";

interface Note {
  id: string;
  title: string | null;
  content: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  async function addNote() {
    if (!newNote.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newNote.trim() }),
      });
      if (res.ok) { setNewNote(""); fetchNotes(); }
    } catch { /* */ }
    finally { setSaving(false); }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<FileText size={15} />} title="Notes" subtitle={`${notes.length}`}>
        <Button
          variant="gradient"
          size="sm"
          icon={<Plus size={13} />}
          onClick={() => document.getElementById("note-input")?.focus()}
        >
          Create note
        </Button>
      </PageHeader>

      {/* Note input */}
      <div
        className="px-4 py-3"
        style={{ borderBottom: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <textarea
          id="note-input"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Write a note..."
          rows={2}
          className="w-full resize-none rounded-md px-3 py-2 text-[13px] outline-none transition-colors"
          style={{
            background: "var(--color-bg-page)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-primary)",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-default)"; }}
        />
        {newNote.trim() && (
          <Button variant="solid" size="sm" onClick={addNote} loading={saving} className="mt-1.5">
            Save note
          </Button>
        )}
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="space-y-2 p-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : notes.length === 0 ? (
          <EmptyState
            icon={<FileText size={24} />}
            title="No notes yet"
            description="Capture meeting notes, observations, and insights here."
          />
        ) : (
          <div>
            {notes.map((note) => (
              <div
                key={note.id}
                className="px-4 py-3 transition-colors"
                style={{ borderBottom: "1px solid var(--color-border-default)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <p className="whitespace-pre-wrap text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                  {note.content}
                </p>
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {new Date(note.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
