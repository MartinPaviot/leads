"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Zap, Plus, Sparkles, Loader2 } from "lucide-react";

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
  const router = useRouter();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchSequences = useCallback(async () => {
    try {
      const res = await fetch("/api/sequences");
      if (res.ok) {
        const data = await res.json();
        setSequences(data.sequences || []);
      }
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSequences(); }, [fetchSequences]);

  async function handleCreateManual(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/sequences/${data.sequence.id}`);
      }
    } catch { /* */ }
    setCreating(false);
  }

  async function handleCreateAI() {
    const name = newName.trim() || "AI Campaign";
    setGenerating(true);
    try {
      // Create empty sequence first
      const createRes = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!createRes.ok) throw new Error("Failed to create sequence");
      const { sequence } = await createRes.json();

      // Generate AI steps for it
      const genRes = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequenceId: sequence.id }),
      });
      if (!genRes.ok) {
        const err = await genRes.json();
        throw new Error(err.error || "Generation failed");
      }

      router.push(`/sequences/${sequence.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate sequence");
    }
    setGenerating(false);
  }

  const statusVariant: Record<string, "success" | "warning" | "neutral" | "info"> = {
    active: "success",
    paused: "warning",
    draft: "neutral",
    archived: "neutral",
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Zap size={15} />}
        title="Sequences"
        subtitle={`${sequences.length}`}
      >
        <Button variant="gradient" onClick={() => setShowCreate(true)}>
          <Plus size={14} /> New campaign
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-auto px-4 py-6">
        {/* Create modal */}
        {showCreate && (
          <div className="mb-6 rounded-xl p-5" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-dialog)" }}>
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Create a new campaign</h3>
            <form onSubmit={handleCreateManual} className="mt-3 space-y-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Campaign name (e.g. Q2 Outbound)"
                autoFocus
                className="w-full rounded-lg px-3 py-2.5 text-[13px] outline-none"
                style={{ background: "var(--color-bg-page)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
              />
              <div className="flex items-center gap-2">
                <Button type="submit" variant="outline" size="md" disabled={!newName.trim() || creating}>
                  {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Start from scratch
                </Button>
                <Button type="button" variant="gradient" size="md" onClick={handleCreateAI} disabled={generating}>
                  {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {generating ? "Generating..." : "AI-generated sequence"}
                </Button>
                <div className="flex-1" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
              {generating && (
                <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Analyzing your TAM, picking the best prospect, generating personalized emails...
                </p>
              )}
            </form>
          </div>
        )}

        {/* Sequences list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg" style={{ background: "var(--color-bg-hover)" }} />
            ))}
          </div>
        ) : sequences.length === 0 && !showCreate ? (
          <EmptyState
            icon={<Zap size={24} />}
            title="No campaigns yet"
            description="Create an AI-powered outreach sequence to start engaging your TAM."
            actionLabel="New campaign"
            onAction={() => setShowCreate(true)}
          />
        ) : (
          <div className="space-y-2">
            {sequences.map((seq) => (
              <Card key={seq.id} interactive onClick={() => router.push(`/sequences/${seq.id}`)}>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{seq.name}</h3>
                        <Badge variant={statusVariant[seq.status] || "neutral"} size="sm">
                          {seq.status}
                        </Badge>
                      </div>
                      {seq.description && (
                        <p className="mt-0.5 text-[12px] truncate" style={{ color: "var(--color-text-tertiary)" }}>{seq.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-[12px] ml-4" style={{ color: "var(--color-text-tertiary)" }}>
                      <span>{seq.stepCount} step{seq.stepCount !== 1 ? "s" : ""}</span>
                      <span>{seq.enrolledCount} enrolled</span>
                    </div>
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
