"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CampaignWizard } from "@/components/campaign-wizard";
import { Zap, Plus, Send, Users, Mail, Play, ThumbsDown, Loader2, FlaskConical, LayoutTemplate } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types";
import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";

/* ── CLE-14: page-action helpers (pure, shared) ── */

const okResult = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const errResult = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });

/** Type a PageAction against its own params schema, then erase P so heterogeneous
 *  actions live in one PageAction[] (the registry stores PageAction<unknown>). */
function definePageAction<P>(a: PageAction<P>): PageAction {
  return a as unknown as PageAction;
}

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
  const [loadError, setLoadError] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  // Per-row pending state so we can disable both buttons + show a
  // spinner during the in-flight approve/reject without flicker.
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Outbound test-mode guardrail state (drives the honest banner + toast).
  const [sendingMode, setSendingMode] = useState<{ testMode: boolean; allowlist: string[] }>({
    testMode: false,
    allowlist: [],
  });

  const fetchSequences = useCallback(async () => {
    try {
      setLoadError(false);
      const res = await fetch("/api/sequences");
      if (res.ok) {
        const data = await res.json();
        setSequences(data.sequences || []);
      } else {
        // A failed load must not masquerade as an empty account ("No campaigns yet").
        setLoadError(true);
      }
    } catch (e) {
      console.warn("sequences: list fetch failed", e);
      setLoadError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSequences(); }, [fetchSequences]);

  useEffect(() => {
    fetch("/api/sending-mode")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.testMode === "boolean") setSendingMode(d); })
      .catch(() => {});
  }, []);

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
            ? sendingMode.testMode
              ? "Campaign started. Test mode is on — emails only go to your allowlist, not real prospects."
              : "Campaign started — sending begins on the next worker tick."
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
    [sequences, toast, sendingMode.testMode]
  );

  const statusVariant: Record<string, "success" | "warning" | "neutral" | "info"> = {
    active: "success", paused: "warning", draft: "neutral", archived: "neutral",
  };

  const totalEmails = (stats: Record<string, number>) =>
    Object.values(stats).reduce((sum, n) => sum + n, 0);

  // ── CLE-14: register this page's actions for the chat live-executor. run()s
  //    reuse the existing handlers above; live values via refs so the stable id
  //    set registers once (CLE-03 §3.1). ──
  const sequencesRef = useRef(sequences); sequencesRef.current = sequences;
  const transitionStatusRef = useRef(transitionStatus); transitionStatusRef.current = transitionStatus;
  const sequenceListActions: PageAction[] = useMemo(
    () => [
      definePageAction({
        id: "sequences.createCampaign",
        title: "Open the campaign wizard",
        description:
          "Open the new-campaign wizard so the user can pick targets, generate emails, review and launch. " +
          "Use when the user wants to create or start building a campaign. Opens the wizard; it does not send anything.",
        params: z.object({}),
        mutating: false, cost: "free", confirm: "never",
        run: async (): Promise<PageActionResult> => {
          setShowWizard(true);
          return okResult("Opened the campaign wizard.");
        },
      }),
      definePageAction({
        id: "sequences.startProposed",
        title: "Start a proposed campaign",
        description:
          "Approve an AI-proposed (draft) campaign and start it — flips it to active so the worker begins sending. " +
          "Use when the user wants to approve/start a proposed sequence shown in the list.",
        params: z.object({ sequenceId: z.string().min(1) }),
        mutating: true, outbound: true, reversible: true, cost: "free", confirm: "always",
        run: async ({ sequenceId }): Promise<PageActionResult> => {
          const seq = sequencesRef.current.find((s) => s.id === sequenceId);
          if (!seq) return errResult(`Sequence ${sequenceId} is not in the current list.`);
          await transitionStatusRef.current(sequenceId, "active");
          return okResult("Campaign started - sending begins on the next tick.");
        },
      }),
      definePageAction({
        id: "sequences.rejectProposed",
        title: "Reject a proposed campaign",
        description:
          "Reject an AI-proposed (draft) campaign — archives it (non-destructive, re-openable from the archive). " +
          "Use when the user wants to reject/dismiss a proposed sequence shown in the list.",
        params: z.object({ sequenceId: z.string().min(1) }),
        mutating: true, reversible: true, cost: "free", confirm: "risky",
        run: async ({ sequenceId }): Promise<PageActionResult> => {
          const seq = sequencesRef.current.find((s) => s.id === sequenceId);
          if (!seq) return errResult(`Sequence ${sequenceId} is not in the current list.`);
          await transitionStatusRef.current(sequenceId, "archived");
          return okResult("Archived the proposed sequence.");
        },
      }),
    ],
    // Stable id set; run() reads live values via refs. Register once (CLE-03).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useRegisterPageActions(sequenceListActions);

  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader
        icon={<Zap size={15} />}
        title="Campaigns"
        subtitle={`${sequences.length}`}
      >
        <Button variant="outline" onClick={() => router.push("/sequences/templates")}>
          <LayoutTemplate size={14} /> Modèles
        </Button>
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
        {sendingMode.testMode && (
          <div
            className="mb-4 flex items-start gap-2.5 rounded-lg px-3.5 py-2.5"
            style={{
              background: "var(--color-warning-soft, rgba(217,119,6,0.10))",
              border: "1px solid var(--color-warning, rgba(217,119,6,0.35))",
            }}
          >
            <FlaskConical size={15} className="mt-0.5 shrink-0" style={{ color: "var(--color-warning, #b45309)" }} />
            <div className="text-[12px] leading-[17px]" style={{ color: "var(--color-text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--color-text-primary)" }}>Test mode is on.</span>{" "}
              Outbound emails only reach your allowlist
              {sendingMode.allowlist.length > 0 && (
                <> (<span className="font-medium">{sendingMode.allowlist.join(", ")}</span>)</>
              )}
              {" "}— real prospects are never contacted. You can launch and review campaigns end-to-end safely. Lift it by setting <code className="rounded px-1" style={{ background: "var(--color-bg-hover)" }}>OUTBOUND_TEST_MODE=off</code>.
            </div>
          </div>
        )}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg" style={{ background: "var(--color-bg-hover)" }} />
            ))}
          </div>
        ) : loadError && sequences.length === 0 ? (
          <EmptyState
            variant="error"
            title="Couldn't load your campaigns"
            description="Something went wrong loading your campaigns. They're safe — try again."
            actionLabel="Retry"
            onAction={() => { setLoading(true); fetchSequences(); }}
          />
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
