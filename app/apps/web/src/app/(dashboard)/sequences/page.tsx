"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CampaignWizard } from "@/components/campaign-wizard";
import { Zap, Plus, Send, Users, Mail, Play, ThumbsDown, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  status: string;
  stepCount: number;
  enrolledCount: number;
  emailStats?: Record<string, number>;
  createdAt: string;
}

export default function CampaignsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  // Per-row pending state so we can disable both buttons + show a
  // spinner during the in-flight approve/reject without flicker.
  const [pendingId, setPendingId] = useState<string | null>(null);

  const fetchSequences = useCallback(async () => {
    try {
      const res = await fetch("/api/sequences");
      if (res.ok) {
        const data = await res.json();
        setSequences(data.sequences || []);
      }
    } catch (e) {
      console.warn("sequences: list fetch failed", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSequences(); }, [fetchSequences]);

  // Monaco-parity: when an AI-proposed sequence lands as "draft",
  // expose Approve (Start) / Reject (thumbs-down) inline so the
  // founder makes the call without opening the detail page. Approve
  // flips status → "active" and the dispatch worker picks it up.
  // Reject archives — non-destructive so the founder can still inspect
  // history later.
  const transitionStatus = useCallback(
    async (id: string, next: "active" | "archived") => {
      setPendingId(id);
      // Optimistic update so the UI feels instant; rollback on error.
      const prev = sequences;
      setSequences((s) => s.map((x) => (x.id === id ? { ...x, status: next } : x)));
      try {
        const res = await fetch(`/api/sequences/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        toast(
          next === "active"
            ? "Campaign started — sending begins on the next worker tick."
            : "Campaign archived — re-open from the archive view.",
          next === "active" ? "success" : "info",
        );
      } catch (err) {
        setSequences(prev);
        toast(
          `Action failed — ${err instanceof Error ? err.message : "try again."}`,
          "error",
        );
      } finally {
        setPendingId(null);
      }
    },
    [sequences, toast]
  );

  const statusVariant: Record<string, "success" | "warning" | "neutral" | "info"> = {
    active: "success", paused: "warning", draft: "neutral", archived: "neutral",
  };

  const totalEmails = (stats: Record<string, number>) =>
    Object.values(stats).reduce((sum, n) => sum + n, 0);

  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader
        icon={<Zap size={15} />}
        title="Campaigns"
        subtitle={`${sequences.length}`}
      >
        <Button variant="gradient" onClick={() => setShowWizard(true)}>
          <Plus size={14} /> New campaign
        </Button>
      </PageHeader>

      {/* Campaign wizard — full screen overlay */}
      {showWizard && (
        <CampaignWizard
          onClose={() => setShowWizard(false)}
          onComplete={(sequenceId) => {
            setShowWizard(false);
            router.push(`/sequences/${sequenceId}`);
          }}
        />
      )}

      <div className="flex-1 overflow-auto px-4 py-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg" style={{ background: "var(--color-bg-hover)" }} />
            ))}
          </div>
        ) : sequences.length === 0 ? (
          <EmptyState
            icon={<Zap size={24} />}
            title="No campaigns yet"
            description="Pick your targets, draft personalized emails, review, and launch."
            actionLabel="Create your first campaign"
            onAction={() => setShowWizard(true)}
          />
        ) : (
          <div className="space-y-2">
            {sequences.map((seq) => {
              const isDraft = seq.status === "draft";
              const isPending = pendingId === seq.id;
              return (
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
                      <div className="flex items-center gap-5 text-[12px] ml-4" style={{ color: "var(--color-text-tertiary)" }}>
                        <span className="flex items-center gap-1"><Mail size={11} /> {seq.stepCount} step{seq.stepCount !== 1 ? "s" : ""}</span>
                        <span className="flex items-center gap-1"><Users size={11} /> {seq.enrolledCount} contact{seq.enrolledCount !== 1 ? "s" : ""}</span>
                        {seq.emailStats && totalEmails(seq.emailStats) > 0 && (
                          <span className="flex items-center gap-1"><Send size={11} /> {seq.emailStats.sent || 0} sent</span>
                        )}
                        {/* Monaco-parity: per-sequence Approve/Reject
                            inline on AI-proposed drafts. Stop click
                            propagation so the buttons don't trigger the
                            row navigation. */}
                        {isDraft && (
                          <div className="ml-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => transitionStatus(seq.id, "active")}
                              className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50"
                              style={{
                                background: "var(--color-success-soft, rgba(16,185,129,0.12))",
                                color: "var(--color-success, #059669)",
                                border: "1px solid rgba(16,185,129,0.25)",
                              }}
                              title="Approve and start sending"
                            >
                              {isPending ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                              Start
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => transitionStatus(seq.id, "archived")}
                              className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50"
                              style={{
                                background: "rgba(220,38,38,0.08)",
                                color: "var(--color-error, #b91c1c)",
                                border: "1px solid rgba(220,38,38,0.22)",
                              }}
                              title="Reject this AI-proposed campaign — archives it"
                            >
                              <ThumbsDown size={11} />
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
