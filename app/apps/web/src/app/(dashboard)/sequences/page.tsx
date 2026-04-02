"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  status: string;
  stepCount: number;
  enrolledCount: number;
  createdAt: string;
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchSequences = useCallback(async () => {
    try {
      const res = await fetch("/api/sequences");
      if (res.ok) {
        const data = await res.json();
        setSequences(data.sequences || []);
      }
    } catch {
      console.error("Failed to fetch sequences");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSequences();
  }, [fetchSequences]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);

    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || undefined }),
      });
      if (res.ok) {
        setNewName("");
        setNewDesc("");
        setShowCreate(false);
        fetchSequences();
      }
    } catch {
      console.error("Failed to create sequence");
    } finally {
      setCreating(false);
    }
  }

  const statusBadgeVariant: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
    draft: "neutral",
    active: "success",
    paused: "warning",
    archived: "neutral",
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Sequences"
        subtitle={`${sequences.length} sequence${sequences.length !== 1 ? "s" : ""}`}
      >
        <Button variant="gradient" onClick={() => setShowCreate(true)}>
          + Create Sequence
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        {showCreate && (
          <form onSubmit={handleCreate} className="mb-6 space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Sequence name (e.g. Cold Outreach)"
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border-default)",
              }}
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              className="w-full rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none"
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border-default)",
              }}
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="solid"
                loading={creating}
                disabled={!newName.trim()}
              >
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--color-bg-hover)]" />
            ))}
          </div>
        ) : sequences.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">No sequences</p>
            <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
              Create a sequence to automate your outreach.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sequences.map((seq) => (
              <Card
                key={seq.id}
                interactive
                onClick={() => window.location.href = `/sequences/${seq.id}`}
              >
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-[var(--color-text-primary)]">{seq.name}</h3>
                      {seq.description && (
                        <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{seq.description}</p>
                      )}
                    </div>
                    <Badge variant={statusBadgeVariant[seq.status] || "neutral"} size="md">
                      {seq.status.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-[var(--color-text-tertiary)]">
                    <span>{seq.stepCount} step{seq.stepCount !== 1 ? "s" : ""}</span>
                    <span>{seq.enrolledCount} enrolled</span>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
