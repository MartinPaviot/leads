"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import {
  KnowledgeSidebar,
  type KnowledgeEntry,
} from "@/components/knowledge/knowledge-sidebar";
import {
  KnowledgeDetail,
  KnowledgeDetailEmpty,
} from "@/components/knowledge/knowledge-detail";
import { AddKnowledgeDialog } from "@/components/knowledge/add-knowledge-dialog";

export default function KnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/knowledge");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.knowledge || []);
      }
    } catch {
      // Silent fail — entries will be empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const selectedEntry = entries.find((e) => e.id === selectedId) || null;

  const handleAddEntry = useCallback(
    async (data: {
      title: string;
      content: string;
      scope: string;
      category: string;
    }) => {
      const res = await fetch("/api/settings/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create entry");
      }
      const { entry } = await res.json();
      // Refetch to get the full list in correct order
      await fetchEntries();
      // Select the newly created entry
      if (entry?.id) setSelectedId(entry.id);
    },
    [fetchEntries]
  );

  const handleSaveEntry = useCallback(
    async (
      id: string,
      updates: { title?: string; content?: string; category?: string }
    ) => {
      const res = await fetch("/api/settings/knowledge", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (!res.ok) {
        throw new Error("Failed to save");
      }
      await fetchEntries();
    },
    [fetchEntries]
  );

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/settings/knowledge?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete");
      }
      if (selectedId === id) setSelectedId(null);
      await fetchEntries();
    },
    [selectedId, fetchEntries]
  );

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={<BookOpen size={16} />} title="Knowledge" />
        <div className="flex flex-1">
          {/* Sidebar skeleton */}
          <div
            className="w-[280px] shrink-0 space-y-3 p-4"
            style={{ borderRight: "1px solid var(--color-border-default)" }}
          >
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded-md"
                style={{ background: "var(--color-bg-hover)" }}
              />
            ))}
          </div>
          {/* Detail skeleton */}
          <div className="flex-1 p-6">
            <div
              className="h-8 w-48 animate-pulse rounded-md"
              style={{ background: "var(--color-bg-hover)" }}
            />
            <div
              className="mt-4 h-64 animate-pulse rounded-md"
              style={{ background: "var(--color-bg-hover)" }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<BookOpen size={16} />} title="Knowledge">
        <Button
          variant="solid"
          size="sm"
          onClick={() => setAddDialogOpen(true)}
        >
          + Add knowledge
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <KnowledgeSidebar
          entries={entries}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddClick={() => setAddDialogOpen(true)}
        />

        <div className="flex-1" style={{ background: "var(--color-bg-card)" }}>
          {selectedEntry ? (
            <KnowledgeDetail
              entry={selectedEntry}
              onSave={handleSaveEntry}
              onDelete={handleDeleteEntry}
            />
          ) : (
            <KnowledgeDetailEmpty />
          )}
        </div>
      </div>

      <AddKnowledgeDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSubmit={handleAddEntry}
      />
    </div>
  );
}
