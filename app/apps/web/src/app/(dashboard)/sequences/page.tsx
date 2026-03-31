"use client";

import { useState, useEffect, useCallback } from "react";

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

  const statusColors: Record<string, string> = {
    draft: "text-[#5a5a70]",
    active: "text-emerald-400",
    paused: "text-amber-400",
    archived: "text-[#5a5a70]",
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Sequences</h1>
          <p className="mt-1 text-sm text-[#5a5a70]">
            {sequences.length} sequence{sequences.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6]"
        >
          + Create Sequence
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Sequence name (e.g. Cold Outreach)"
            autoFocus
            className="w-full rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
          />
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6] disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-[#1e1f2a] px-4 py-2 text-sm text-[#8b8ba0] hover:text-[#e8e8ed]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-[#1e1f2a]" />
            ))}
          </div>
        ) : sequences.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-[#8b8ba0]">No sequences</p>
            <p className="mt-1 text-sm text-[#5a5a70]">
              Create a sequence to automate your outreach.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sequences.map((seq) => (
              <div
                key={seq.id}
                onClick={() => window.location.href = `/sequences/${seq.id}`}
                className="cursor-pointer rounded-lg border border-[#1e1f2a] bg-[#12131a] p-4 hover:border-[#6366f1]/30"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-[#e8e8ed]">{seq.name}</h3>
                    {seq.description && (
                      <p className="mt-0.5 text-xs text-[#5a5a70]">{seq.description}</p>
                    )}
                  </div>
                  <span className={`text-xs font-medium uppercase ${statusColors[seq.status] || statusColors.draft}`}>
                    {seq.status}
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-[#5a5a70]">
                  <span>{seq.stepCount} step{seq.stepCount !== 1 ? "s" : ""}</span>
                  <span>{seq.enrolledCount} enrolled</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
