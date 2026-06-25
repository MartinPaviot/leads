"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { FileText, Plus, Search, ArrowUpDown, Building2, User, Briefcase } from "lucide-react";
import { PageHeader, FilterBar } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isLinkableNoteEntity } from "./_entity-badge";
import Link from "next/link";

interface Note {
  id: string;
  title: string | null;
  content: string;
  entityType: string | null;
  entityId: string | null;
  entityName?: string | null;
  createdAt: string;
}

type SortOrder = "newest" | "oldest";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(months / 12)}y ago`;
}

function entityIcon(entityType: string | null) {
  switch (entityType) {
    case "company":
      return <Building2 size={11} />;
    case "contact":
      return <User size={11} />;
    case "deal":
      return <Briefcase size={11} />;
    default:
      return null;
  }
}

function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case "company":
      return `/accounts/${entityId}`;
    case "contact":
      return `/contacts/${entityId}`;
    case "deal":
      return `/opportunities/${entityId}`;
    default:
      return null;
  }
}

function truncateContent(content: string, maxLen: number = 200): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen).trimEnd() + "...";
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const fetchNotes = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/notes");
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      } else {
        // A 500 here used to fall through to the empty state, so a broken
        // tenant looked identical to one with no notes. Surface it instead.
        setLoadError(true);
      }
    } catch (e) {
      console.warn("notes: list fetch failed", e);
      setLoadError(true);
    } finally { setLoading(false); }
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
    } catch (e) {
      console.warn("notes: add failed", e);
    } finally { setSaving(false); }
  }

  // Filter by search query
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const q = searchQuery.toLowerCase();
    return notes.filter((note) => {
      const content = (note.content || "").toLowerCase();
      const title = (note.title || "").toLowerCase();
      const entityName = (note.entityName || "").toLowerCase();
      return content.includes(q) || title.includes(q) || entityName.includes(q);
    });
  }, [notes, searchQuery]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });
    return arr;
  }, [filtered, sortOrder]);

  return (
    <div className="flex h-full flex-col animate-content-in">
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

      {/* Filter bar */}
      <FilterBar>
        <div className="relative flex items-center">
          <Search size={13} className="absolute left-2.5" style={{ color: "var(--color-text-muted)" }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="h-7 w-52 rounded-md pl-8 pr-3 text-[12px] outline-none transition-colors"
            style={{
              background: "var(--color-bg-page)",
              border: "1px solid var(--color-border-default)",
              color: "var(--color-text-primary)",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-default)"; }}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {searchQuery.trim() && (
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            title={`Sort: ${sortOrder === "newest" ? "newest first" : "oldest first"}`}
          >
            <ArrowUpDown size={12} />
            {sortOrder === "newest" ? "Newest" : "Oldest"}
          </button>
        </div>
      </FilterBar>

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
        ) : loadError ? (
          <EmptyState
            variant="error"
            title="Couldn't load notes"
            description="Something went wrong fetching your notes. This is not an empty list."
            actionLabel="Retry"
            onAction={fetchNotes}
          />
        ) : notes.length === 0 ? (
          <EmptyState
            icon={<FileText size={24} />}
            title="No notes yet"
            description="Capture meeting notes, observations, and insights here."
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<Search size={24} />}
            title="No matching notes"
            description="Try a different search term."
          />
        ) : (
          <div>
            {sorted.map((note) => (
              <div
                key={note.id}
                className="px-4 py-3 transition-colors"
                style={{ borderBottom: "1px solid var(--color-border-default)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {/* Header: title + entity badge + timestamp */}
                <div className="mb-1 flex items-center gap-2">
                  {note.title && (
                    <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {note.title}
                    </span>
                  )}
                  {isLinkableNoteEntity(note.entityType, note.entityId) && (() => {
                    const href = entityHref(note.entityType, note.entityId);
                    const badge = (
                      <Badge variant="neutral" size="sm">
                        <span className="flex items-center gap-1">
                          {entityIcon(note.entityType)}
                          {note.entityName || note.entityType}
                        </span>
                      </Badge>
                    );
                    return href ? <Link href={href} className="hover:underline">{badge}</Link> : badge;
                  })()}
                  <span className="ml-auto shrink-0 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {relativeTime(note.createdAt)}
                  </span>
                </div>

                {/* Content preview */}
                <p
                  className="whitespace-pre-wrap text-[13px]"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {truncateContent(note.content)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
