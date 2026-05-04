"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { KnowledgeEntry } from "./knowledge-sidebar";

const CATEGORY_OPTIONS = [
  { value: "icp", label: "ICP" },
  { value: "competitors", label: "Competitors" },
  { value: "objections", label: "Objections" },
  { value: "product", label: "Product" },
  { value: "process", label: "Process" },
  { value: "context", label: "Context" },
  { value: "custom", label: "Custom" },
];

interface KnowledgeDetailProps {
  entry: KnowledgeEntry;
  onSave: (id: string, updates: { title?: string; content?: string; category?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function KnowledgeDetail({ entry, onSave, onDelete }: KnowledgeDetailProps) {
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [category, setCategory] = useState(entry.category);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset local state when entry changes
  useEffect(() => {
    setTitle(entry.title);
    setContent(entry.content);
    setCategory(entry.category);
  }, [entry.id, entry.title, entry.content, entry.category]);

  const hasChanges =
    title !== entry.title ||
    content !== entry.content ||
    category !== entry.category;

  const handleSave = useCallback(async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      const updates: { title?: string; content?: string; category?: string } = {};
      if (title !== entry.title) updates.title = title;
      if (content !== entry.content) updates.content = content;
      if (category !== entry.category) updates.category = category;
      await onSave(entry.id, updates);
    } finally {
      setSaving(false);
    }
  }, [entry.id, entry.title, entry.content, entry.category, title, content, category, hasChanges, saving, onSave]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await onDelete(entry.id);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [entry.id, onDelete]);

  // Keyboard shortcut: Ctrl/Cmd+S to save
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasChanges && !saving) {
          handleSave();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hasChanges, saving, handleSave]);

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between px-6"
          style={{
            height: "var(--header-height)",
            borderBottom: "1px solid var(--color-border-default)",
          }}
        >
          <div className="flex items-center gap-2">
            <Badge variant={entry.scope === "workspace" ? "info" : "neutral"}>
              {entry.scope === "workspace" ? "Workspace" : "Personal"}
            </Badge>
            {entry.isStale && (
              <Badge variant="warning">
                <Clock size={10} className="mr-1" />
                Stale
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {entry.isEditable && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  icon={<Trash2 size={13} />}
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Delete
                </Button>
                <Button
                  variant="solid"
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges}
                  loading={saving}
                  icon={<Save size={13} />}
                >
                  Save
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {/* Title */}
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!entry.isEditable}
              placeholder="Entry title"
            />

            {/* Category */}
            <Select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={!entry.isEditable}
              options={CATEGORY_OPTIONS}
            />

            {/* Content */}
            <Textarea
              label="Content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!entry.isEditable}
              placeholder="Write your knowledge content here..."
              rows={16}
              style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "13px" }}
            />

            {/* Timestamps */}
            <div
              className="flex items-center gap-4 pt-2 text-[11px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <span>Created {formatDate(entry.createdAt)}</span>
              <span>Updated {formatDate(entry.updatedAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this knowledge entry?"
        description="This entry will be removed from the AI context for your workspace. This action cannot be undone."
        confirmLabel="Delete entry"
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        busy={deleting}
      />
    </>
  );
}

/** Placeholder shown when no entry is selected */
export function KnowledgeDetailEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <p
        className="text-[13px]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        Select an entry to view details
      </p>
    </div>
  );
}
