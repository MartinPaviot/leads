"use client";

/**
 * /sequences/review — global pending-approval queue (P0-1 task 1.3).
 *
 * Lists every draft sequence email awaiting founder approval across
 * the tenant. Approve / Reject / Edit flows wire to the lifecycle
 * routes shipped in task 1.2.
 *
 * Layout : 360px left rail (DraftList with status filter) + flexible
 * preview pane (DraftPreview with context bundle + inline editor).
 * Reject opens the reason-capture modal (DraftRejectModal).
 *
 * Polls every 30s when on the pending tab so newly-generated drafts
 * surface without a manual refresh — drafts can land at any time as
 * sequence enrollments hit their next step.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  SequenceDraftList,
  type DraftListItem,
} from "@/components/sequence-draft-list";
import { SequenceDraftPreview } from "@/components/sequence-draft-preview";
import { SequenceDraftRejectModal } from "@/components/sequence-draft-reject-modal";
import { useToast } from "@/components/ui/toast";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

const POLL_INTERVAL_MS = 30_000;

export default function ReviewQueuePage() {
  const { toast } = useToast();
  // P0-1 task 1.9 — accept ?sequenceId=<id> from URL so the legacy
  // per-sequence review page can redirect here without losing scope.
  const searchParams = useSearchParams();
  const sequenceIdParam = searchParams?.get("sequenceId") ?? null;

  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [status, setStatus] = useState<string>("pending_approval");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDrafts = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null; status?: string }) => {
      const filterStatus = opts?.status ?? status;
      const useCursor = opts?.cursor ?? null;
      setLoading(true);
      try {
        const params = new URLSearchParams({ status: filterStatus, limit: "50" });
        if (useCursor) params.set("cursor", useCursor);
        if (sequenceIdParam) params.set("sequenceId", sequenceIdParam);
        const res = await fetch(`/api/sequences/drafts?${params.toString()}`);
        if (!res.ok) {
          toast("Failed to load drafts", "error");
          return;
        }
        const data = await res.json();
        const incoming: DraftListItem[] = data.drafts ?? [];
        setDrafts((prev) => (opts?.append ? [...prev, ...incoming] : incoming));
        setHasMore(!!data.nextCursor);
        setCursor(data.nextCursor ?? null);

        // Auto-select first draft when current selection vanishes (e.g.
        // after status change or initial load).
        if (!opts?.append) {
          if (incoming.length === 0) {
            setSelectedDraftId(null);
          } else if (
            !selectedDraftId ||
            !incoming.some((d) => d.id === selectedDraftId)
          ) {
            setSelectedDraftId(incoming[0].id);
          }
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : "Network error", "error");
      } finally {
        setLoading(false);
      }
    },
    [status, selectedDraftId, sequenceIdParam, toast],
  );

  // Initial load + status change → reload from top.
  useEffect(() => {
    fetchDrafts({ append: false, cursor: null, status });
    // Reset polling when status changes ; we only poll the pending tab
    // since other tabs are stable and polling would just waste cycles.
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (status === "pending_approval") {
      pollRef.current = setInterval(() => {
        fetchDrafts({ append: false, cursor: null, status: "pending_approval" });
      }, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // We intentionally exclude fetchDrafts from deps : it's stable for
    // the same `status` and we don't want to thrash the interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const selectedDraft =
    drafts.find((d) => d.id === selectedDraftId) ?? null;

  async function handleApprove() {
    if (!selectedDraft) return;
    try {
      const res = await fetch(
        `/api/sequences/drafts/${selectedDraft.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: selectedDraft.version }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(
          (data as { error?: string }).error ?? `Approve failed (${res.status})`,
          "error",
        );
        return;
      }
      toast("Approved — queued for send.", "success");
      // Drop the approved draft from the pending list.
      setDrafts((prev) => prev.filter((d) => d.id !== selectedDraft.id));
      setSelectedDraftId(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error");
    }
  }

  async function submitReject(args: {
    reason: string;
    pauseEnrollment: boolean;
  }) {
    if (!selectedDraft) return { ok: false, error: "No draft selected" };
    try {
      const res = await fetch(
        `/api/sequences/drafts/${selectedDraft.id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: args.reason,
            pauseEnrollment: args.pauseEnrollment,
            version: selectedDraft.version,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          error:
            (data as { error?: string }).error ??
            `Reject failed (${res.status})`,
        };
      }
      toast(
        args.pauseEnrollment
          ? "Rejected — enrollment paused."
          : "Rejected.",
        "success",
      );
      setDrafts((prev) => prev.filter((d) => d.id !== selectedDraft.id));
      setSelectedDraftId(null);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  }

  function handleEditSaved(updated: DraftListItem) {
    setDrafts((prev) =>
      prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)),
    );
    toast("Draft updated.", "success");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4">
        <Breadcrumbs
          items={[
            { label: "Sequences", href: "/sequences" },
            { label: "Review queue" },
          ]}
        />
        <h1
          className="mt-2 text-xl font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          Review queue
        </h1>
        <p
          className="mt-1 text-[12px]"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Approve, edit, or reject every sequence draft before it sends.
          Rejected drafts feed the optimizer ; approved drafts queue for
          delivery within 60 seconds.
        </p>
      </div>

      <div className="mt-4 flex flex-1 overflow-hidden border-t" style={{ borderColor: "var(--color-border-default)" }}>
        {/* Left rail */}
        <aside
          className="w-[360px] shrink-0 border-r"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          <SequenceDraftList
            drafts={drafts}
            selectedDraftId={selectedDraftId}
            onSelect={(id) => setSelectedDraftId(id)}
            status={status}
            onStatusChange={(s) => {
              setStatus(s);
              setSelectedDraftId(null);
            }}
            hasMore={hasMore}
            onLoadMore={() =>
              fetchDrafts({ append: true, cursor, status })
            }
            loading={loading}
          />
        </aside>

        {/* Preview */}
        <main className="flex-1 overflow-hidden">
          {selectedDraft ? (
            <SequenceDraftPreview
              draft={selectedDraft}
              onApprove={handleApprove}
              onReject={() => setRejectModalOpen(true)}
              onEditSaved={handleEditSaved}
            />
          ) : (
            <div
              className="flex h-full items-center justify-center p-6 text-center"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <p className="text-[13px]">
                {drafts.length === 0
                  ? "Nothing to review here."
                  : "Select a draft to preview."}
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Reject modal */}
      {selectedDraft && (
        <SequenceDraftRejectModal
          open={rejectModalOpen}
          onClose={() => setRejectModalOpen(false)}
          onSubmit={submitReject}
          recipientName={selectedDraft.subject}
        />
      )}
    </div>
  );
}
