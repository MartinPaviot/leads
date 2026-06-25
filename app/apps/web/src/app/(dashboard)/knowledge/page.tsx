"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { z } from "zod";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";
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

/* ── CLE-14: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

export default function KnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [query, setQuery] = useState("");

  const fetchEntries = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/settings/knowledge");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.knowledge || []);
      } else {
        // Was a silent swallow: a 500 left entries empty → the "no knowledge"
        // empty state, masking a backend failure as an empty workspace.
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const selectedEntry = entries.find((e) => e.id === selectedId) || null;

  const q = query.trim().toLowerCase();
  const filteredEntries = q
    ? entries.filter((e) =>
        [e.title, e.content, (e as { category?: string }).category].some((f) =>
          (f ?? "").toLowerCase().includes(q),
        ),
      )
    : entries;

  // ── CLE-14: result-returning network extractions. These are the SINGLE copy
  //    of each request; both the throwing UI handlers below and the registered
  //    chat actions call them. The throwing handlers preserve the child
  //    contract (KnowledgeDetail/AddKnowledgeDialog rely on throw-on-error). ──
  const createEntry = useCallback(
    async (input: {
      title: string;
      content: string;
      scope: string;
      category: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/settings/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, error: err.error || "Failed to create entry" };
        }
        const { entry } = await res.json();
        await fetchEntries();
        if (entry?.id) setSelectedId(entry.id);
        return { ok: true };
      } catch {
        return { ok: false, error: "Failed to create entry" };
      }
    },
    [fetchEntries]
  );

  const saveEntryFields = useCallback(
    async (
      id: string,
      fields: { title?: string; content?: string; category?: string }
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/settings/knowledge", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...fields }),
        });
        if (!res.ok) return { ok: false, error: "Failed to save" };
        await fetchEntries();
        return { ok: true };
      } catch {
        return { ok: false, error: "Failed to save" };
      }
    },
    [fetchEntries]
  );

  const deleteEntryResult = useCallback(
    async (id: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch(`/api/settings/knowledge?id=${id}`, {
          method: "DELETE",
        });
        if (!res.ok) return { ok: false, error: "Failed to delete" };
        if (selectedId === id) setSelectedId(null);
        await fetchEntries();
        return { ok: true };
      } catch {
        return { ok: false, error: "Failed to delete" };
      }
    },
    [selectedId, fetchEntries]
  );

  // Throwing handlers preserved for the child components (they await + rely on
  // throw-on-error). Each is a thin wrapper over the single network copy.
  const handleAddEntry = useCallback(
    async (data: {
      title: string;
      content: string;
      scope: string;
      category: string;
    }) => {
      const r = await createEntry(data);
      if (!r.ok) throw new Error(r.error || "Failed to create entry");
    },
    [createEntry]
  );

  const handleSaveEntry = useCallback(
    async (
      id: string,
      updates: { title?: string; content?: string; category?: string }
    ) => {
      const r = await saveEntryFields(id, updates);
      if (!r.ok) throw new Error(r.error || "Failed to save");
    },
    [saveEntryFields]
  );

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      const r = await deleteEntryResult(id);
      if (!r.ok) throw new Error(r.error || "Failed to delete");
    },
    [deleteEntryResult]
  );

  // ── CLE-14: register this page's actions for the chat live-executor. run()s
  //    reuse the result-returning extractions above. The save/delete/search
  //    actions key off ids the user supplies, so no live list-ref is needed.
  //    Registered UNCONDITIONALLY, above the loading early-return. ──
  const knowledgeActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "knowledge.addEntry",
        title: "Add a knowledge entry",
        description:
          "Create a new knowledge-base entry (title + content). Scope defaults to workspace, " +
          "category to general. Use when the user wants to teach the assistant something.",
        params: z.object({
          title: z.string().min(1),
          content: z.string().min(1),
          scope: z.string().optional(),
          category: z.string().optional(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ title, content, scope, category }): Promise<PageActionResult> => {
          const t = title.trim();
          const r = await createEntry({
            title: t,
            content,
            scope: scope ?? "workspace",
            category: category ?? "general",
          });
          return r.ok ? okResult(`Added knowledge entry "${t}".`) : errResult(r.error ?? "Failed to create entry.");
        },
      }),
      definePageAction({
        id: "knowledge.saveEntry",
        title: "Edit a knowledge entry",
        description:
          "Update an existing knowledge entry's title, content, and/or category. " +
          "Use when the user wants to revise an entry.",
        params: z.object({
          id: z.string().min(1),
          title: z.string().optional(),
          content: z.string().optional(),
          category: z.string().optional(),
        }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ id, title, content, category }): Promise<PageActionResult> => {
          const r = await saveEntryFields(id, { title, content, category });
          return r.ok ? okResult("Saved the entry.") : errResult(r.error ?? "Failed to save the entry.");
        },
      }),
      definePageAction({
        id: "knowledge.deleteEntry",
        title: "Delete a knowledge entry",
        description:
          "Permanently delete a knowledge entry. This cannot be undone, so it always confirms first.",
        params: z.object({ id: z.string().min(1) }),
        mutating: true, reversible: false, cost: "free", confirm: "always",
        run: async ({ id }): Promise<PageActionResult> => {
          const r = await deleteEntryResult(id);
          return r.ok ? okResult("Deleted the entry.") : errResult(r.error ?? "Failed to delete the entry.");
        },
      }),
      definePageAction({
        id: "knowledge.search",
        title: "Search the knowledge base",
        description:
          "Filter the knowledge list by a free-text query (matches title, content, category). " +
          "Pass an empty query to clear the search.",
        params: z.object({ query: z.string() }),
        mutating: false, reversible: true, cost: "free", confirm: "never",
        run: async ({ query }): Promise<PageActionResult> => {
          setQuery(query);
          return query.trim()
            ? okResult(`Searching knowledge for "${query}".`)
            : okResult("Cleared the search.");
        },
      }),
    ],
    // Stable id set; run() reads live values via refs and calls stable
    // useCallback helpers / setters — registration happens once (CLE-03).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useRegisterPageActions(knowledgeActions);

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

  if (loadError) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={<BookOpen size={16} />} title="Knowledge" />
        <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
            Couldn&apos;t load your knowledge base. This is not an empty workspace — the request failed.
          </p>
          <button
            onClick={() => { setLoading(true); fetchEntries(); }}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{ border: "1px solid var(--color-border-default)", color: "var(--color-accent)" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<BookOpen size={16} />} title="Knowledge">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search knowledge..."
            className="rounded-md px-3 py-1.5 text-[13px]"
            style={{ width: 220, background: "var(--color-bg-card)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
          />
          <Button
            variant="solid"
            size="sm"
            onClick={() => setAddDialogOpen(true)}
          >
            + Add knowledge
          </Button>
        </div>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <KnowledgeSidebar
          entries={filteredEntries}
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
