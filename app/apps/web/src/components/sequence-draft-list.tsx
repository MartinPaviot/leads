"use client";

/**
 * Sequence draft list — left rail of /sequences/review (P0-1 task 1.3).
 *
 * Renders the queue of pending-approval drafts with cursor pagination.
 * Each item is a card showing : recipient, sequence step, trigger
 * reason, age. Clicking selects the draft for the preview pane.
 *
 * Status filter chips above the list flip between pending_approval
 * (default), approved (queued for send), rejected, expired, sent.
 *
 * B5b — multi-select. When the parent supplies `selectedIds` +
 * `onToggleSelect`, each row gets a checkbox and the header gains a
 * "select all visible" toggle. The bulk-approve action lives in the
 * parent so the list stays presentational. Checkboxes only render on
 * the pending_approval tab — the other statuses can't be bulk-approved.
 */

import { Mail, Clock } from "lucide-react";

export interface DraftListItem {
  id: string;
  sequenceId: string;
  stepId: string;
  enrollmentId: string;
  contactId: string;
  subject: string;
  bodyText: string | null;
  triggerReason: string | null;
  status: string;
  generatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewReason: string | null;
  scheduledSendAt: string | null;
  version: number;
  personalizationSources?: unknown;
}

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  sent: "Sent",
};

const STATUS_COLOR: Record<string, string> = {
  pending_approval: "var(--color-warning)",
  approved: "var(--color-success)",
  rejected: "var(--color-error)",
  expired: "var(--color-text-tertiary)",
  sent: "var(--color-accent)",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

interface SequenceDraftListProps {
  drafts: DraftListItem[];
  selectedDraftId: string | null;
  onSelect: (id: string) => void;
  status: string;
  onStatusChange: (status: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  loading: boolean;
  /** B5b — multi-select. When provided, each row in the pending tab
   *  gets a checkbox. Without these props, the list behaves exactly
   *  as before. */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

export function SequenceDraftList({
  drafts,
  selectedDraftId,
  onSelect,
  status,
  onStatusChange,
  hasMore,
  onLoadMore,
  loading,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: SequenceDraftListProps) {
  // Multi-select is only meaningful for the pending_approval tab —
  // the only state from which a bulk approve makes sense.
  const multiSelectEnabled =
    !!onToggleSelect && status === "pending_approval";
  const allVisibleSelected =
    multiSelectEnabled &&
    drafts.length > 0 &&
    drafts.every((d) => selectedIds?.has(d.id));
  const someVisibleSelected =
    multiSelectEnabled &&
    !allVisibleSelected &&
    drafts.some((d) => selectedIds?.has(d.id));
  const statuses = [
    { key: "pending_approval", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "expired", label: "Expired" },
    { key: "sent", label: "Sent" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Status filter */}
      <div
        className="flex shrink-0 gap-1 border-b p-3"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        {statuses.map((s) => (
          <button
            key={s.key}
            onClick={() => onStatusChange(s.key)}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
            style={{
              background:
                status === s.key
                  ? "var(--color-accent)"
                  : "var(--color-bg-card)",
              color:
                status === s.key ? "#fff" : "var(--color-text-secondary)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Bulk-select header — only when multi-select is wired and there
          are pending drafts visible. */}
      {multiSelectEnabled && drafts.length > 0 && onToggleSelectAll && (
        <div
          className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
          style={{ borderColor: "var(--color-border-default)" }}
        >
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = someVisibleSelected;
              }}
              onChange={onToggleSelectAll}
              aria-label="Select all visible drafts"
              className="h-3.5 w-3.5 cursor-pointer"
            />
            <span
              className="text-[11px]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {selectedIds && selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : "Select all"}
            </span>
          </label>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {drafts.length === 0 && !loading && (
          <EmptyState status={status} />
        )}

        {drafts.map((d) => {
          const isSelected = d.id === selectedDraftId;
          const isChecked = !!selectedIds?.has(d.id);
          // Row is a div now (not a button) so a nested checkbox is
          // valid HTML when multi-select is enabled.
          const Row = multiSelectEnabled ? "div" : "button";
          return (
            <Row
              key={d.id}
              onClick={
                multiSelectEnabled
                  ? undefined
                  : () => onSelect(d.id)
              }
              role={multiSelectEnabled ? undefined : undefined}
              className="block w-full border-b p-3 text-left transition-colors"
              style={{
                background: isSelected
                  ? "var(--color-bg-hover)"
                  : "transparent",
                borderColor: "var(--color-border-default)",
                borderLeft: isSelected
                  ? "2px solid var(--color-accent)"
                  : "2px solid transparent",
                cursor: multiSelectEnabled ? "default" : "pointer",
              }}
            >
              <div className="flex items-start gap-2">
                {multiSelectEnabled && onToggleSelect && (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleSelect(d.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select draft ${d.subject || d.id}`}
                    className="mt-0.5 h-3.5 w-3.5 cursor-pointer"
                  />
                )}
                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={
                    multiSelectEnabled
                      ? () => onSelect(d.id)
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className="flex-1 truncate text-[13px] font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {d.subject || "(no subject)"}
                    </p>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
                      style={{
                        background: "var(--color-bg-card)",
                        color:
                          STATUS_COLOR[d.status] ??
                          "var(--color-text-tertiary)",
                        border: `1px solid ${STATUS_COLOR[d.status] ?? "var(--color-border-default)"}`,
                      }}
                    >
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </div>
                  <div
                    className="mt-1 flex items-center gap-2 text-[11px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    <Clock size={10} />
                    <span>{timeAgo(d.generatedAt)}</span>
                    {d.triggerReason && (
                      <>
                        <span>·</span>
                        <span className="truncate">{d.triggerReason}</span>
                      </>
                    )}
                  </div>
                  {d.bodyText && (
                    <p
                      className="mt-1 line-clamp-2 text-[11px]"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {d.bodyText.slice(0, 160)}
                    </p>
                  )}
                </div>
              </div>
            </Row>
          );
        })}

        {/* Load more */}
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="block w-full p-3 text-center text-[11px] font-medium"
            style={{
              color: "var(--color-accent)",
              background: "transparent",
            }}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ status }: { status: string }) {
  const message =
    status === "pending_approval"
      ? "No drafts awaiting review. Sequences fire as triggers match — drafts will land here for approval."
      : status === "approved"
        ? "No approved drafts queued. Approved drafts live here briefly before the sender worker dispatches them."
        : status === "rejected"
          ? "No rejected drafts. Rejection reasons feed the rejection learner — see the trends panel for repeat issues."
          : status === "expired"
            ? "No expired drafts. Drafts expire after 72h pending without review."
            : "No sent drafts in this view.";
  return (
    <div className="p-6 text-center">
      <Mail
        size={24}
        className="mx-auto mb-2"
        style={{ color: "var(--color-text-tertiary)" }}
      />
      <p
        className="text-[12px] leading-relaxed"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {message}
      </p>
    </div>
  );
}
