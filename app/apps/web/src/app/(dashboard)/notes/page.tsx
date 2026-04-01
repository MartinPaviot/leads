"use client";

import { useState } from "react";
import { FileText, Plus } from "lucide-react";

interface Note {
  id: string;
  content: string;
  createdAt: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");

  function addNote() {
    if (!newNote.trim()) return;
    setNotes([{ id: crypto.randomUUID(), content: newNote.trim(), createdAt: new Date().toISOString() }, ...notes]);
    setNewNote("");
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6" style={{ height: "var(--header-height)", borderBottom: "0.5px solid var(--color-border-default)" }}>
        <FileText size={16} style={{ color: "var(--color-text-tertiary)" }} />
        <h1 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Notes</h1>
        <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>{notes.length}</span>
        <div className="ml-auto">
          <button onClick={() => document.getElementById("note-input")?.focus()}
            className="flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-medium text-white"
            style={{ background: "var(--color-accent)" }}>
            <Plus size={13} /> Create note
          </button>
        </div>
      </div>

      {/* Note input */}
      <div className="px-6 py-3" style={{ borderBottom: "0.5px solid var(--color-border-default)" }}>
        <textarea
          id="note-input"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Write a note..."
          rows={2}
          className="w-full resize-none rounded-md px-3 py-2 text-[13px] outline-none"
          style={{ background: "var(--color-bg-surface)", border: "0.5px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
        />
        {newNote.trim() && (
          <button onClick={addNote} className="mt-1.5 rounded-md px-3 py-1 text-[12px] font-medium text-white"
            style={{ background: "var(--color-accent)" }}>
            Save note
          </button>
        )}
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-auto">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <FileText size={32} style={{ color: "var(--color-text-muted)" }} />
            <p className="mt-3 text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>No notes yet</p>
            <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Capture meeting notes, observations, and insights here.</p>
          </div>
        ) : (
          <div>
            {notes.map((note) => (
              <div key={note.id} className="px-6 py-3 transition-colors"
                style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-muted)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <p className="whitespace-pre-wrap text-[13px]" style={{ color: "var(--color-text-primary)" }}>{note.content}</p>
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
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
