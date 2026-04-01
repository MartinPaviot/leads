"use client";

import { useState } from "react";

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
    setNotes([
      {
        id: crypto.randomUUID(),
        content: newNote.trim(),
        createdAt: new Date().toISOString(),
      },
      ...notes,
    ]);
    setNewNote("");
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#e8e8ed]">Notes</h1>
        <p className="text-sm text-[#5a5a70]">{notes.length} notes</p>
      </div>

      <div className="mb-6">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Write a note..."
          rows={3}
          className="w-full rounded-lg border border-[#1e1f2a] bg-[#12131a] px-4 py-3 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
        />
        <button
          onClick={addNote}
          disabled={!newNote.trim()}
          className="mt-2 rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6] disabled:opacity-50"
        >
          Save note
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm font-medium text-[#8b8ba0]">No notes yet</p>
          <p className="mt-1 text-xs text-[#5a5a70]">
            Capture meeting notes, observations, and insights here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-lg border border-[#1e1f2a] bg-[#12131a] px-4 py-3"
            >
              <p className="whitespace-pre-wrap text-sm text-[#e8e8ed]">{note.content}</p>
              <p className="mt-2 text-[10px] text-[#5a5a70]">
                {new Date(note.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
