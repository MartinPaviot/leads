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
  // B5b — multi-select bulk approve. Selection lives at this level so
  // the action bar + the list share the same source of truth.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkApproving, setBulkApproving] = useState(false);

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

  // B5b — selection helpers. Clear the selection on status change so
  // checkboxes from the pending tab don't haunt the approved view.
  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const allVisible = drafts.every((d) => prev.has(d.id));
      if (allVisible) {
        // Deselect everything currently visible (but keep selections
        // that point at drafts no longer in the list — defensive).
        const next = new Set(prev);
        for (const d of drafts) next.delete(d.id);
        return next;
      }
      const next = new Set(prev);
      for (const d of drafts) next.add(d.id);
      return next;
    });
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    setBulkApproving(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch("/api/sequences/drafts/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        approved?: string[];
        error?: string;
        failures?: Array<{ id: string; reason: string }>;
        missingIds?: string[];
      };
      if (!res.ok) {
        if (res.status === 409 && Array.isArray(data.failures)) {
          toast(
            `Batch rolled back: ${data.failures.length} draft(s) cannot be approved.`,
            "error",
          );
        } else if (res.status === 404 && Array.isArray(data.missingIds)) {
          toast(
            `${data.missingIds.length} draft(s) not found — refresh and retry.`,
            "error",
          );
        } else {
          toast(data.error ?? `Bulk approve failed (${res.status})`, "error");
        }
        return;
      }
      const approvedCount = data.approved?.length ?? ids.length;
      toast(
        `${approvedCount} draft${approvedCount > 1 ? "s" : ""} approved.`,
        "success",
      );
      const approvedSet = new Set(data.approved ?? ids);
      setDrafts((prev) => prev.filter((d) => !approvedSet.has(d.id)));
      setSelectedIds(new Set());
      if (selectedDraftId && approvedSet.has(selectedDraftId)) {
        setSelectedDraftId(null);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setBulkApproving(false);
    }
  }

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

      {/* B5b — bulk approve action bar, visible only when the pending
          tab has at least one selection. */}
      {status === "pending_approval" && selectedIds.size > 0 && (
        <div
          className="mt-3 flex items-center justify-between gap-3 border-y px-6 py-2"
          style={{
            borderColor: "var(--color-border-default)",
            background: "var(--color-bg-card)",
          }}
        >
          <p
            className="text-[12px]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <strong style={{ color: "var(--color-text-primary)" }}>
              {selectedIds.size}
            </strong>{" "}
            draft{selectedIds.size > 1 ? "s" : ""} selected for batch approve.
            Atomic: if any can't transition, the whole batch rolls back.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkApproving}
              className="rounded px-3 py-1 text-[12px] font-medium"
              style={{
                color: "var(--color-text-secondary)",
                background: "transparent",
                border: "1px solid var(--color-border-default)",
              }}
            >
              Clear
            </button>
            <button
              onClick={handleBulkApprove}
              disabled={bulkApproving}
              className="rounded px-3 py-1 text-[12px] font-medium"
              style={{
                color: "#fff",
                background: "var(--color-accent)",
                border: "1px solid var(--color-accent)",
                opacity: bulkApproving ? 0.6 : 1,
              }}
            >
              {bulkApproving
                ? "Approving…"
                : `Approve ${selectedIds.size} selected`}
            </button>
          </div>
        </div>
      )}

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
              setSelectedIds(new Set());
            }}
            hasMore={hasMore}
            onLoadMore={() =>
              fetchDrafts({ append: true, cursor, status })
            }
            loading={loading}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelectOne}
            onToggleSelectAll={toggleSelectAllVisible}
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
