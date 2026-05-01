"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, CheckCircle2, XCircle, Ban, X } from "lucide-react";

interface TaskProgressData {
  current: number;
  total: number | null;
  message: string | null;
  percent: number | null;
  status: string;
}

interface TaskResult {
  status: string;
  result?: Record<string, unknown>;
  error?: string;
}

interface TaskProgressCardProps {
  taskId: string;
  title: string;
  initialTotal?: number;
}

export function TaskProgressCard({
  taskId,
  title,
  initialTotal,
}: TaskProgressCardProps) {
  const [progress, setProgress] = useState<TaskProgressData>({
    current: 0,
    total: initialTotal ?? null,
    message: null,
    percent: null,
    status: "queued",
  });
  const [finalResult, setFinalResult] = useState<TaskResult | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/agent-tasks/${taskId}/stream`);
    eventSourceRef.current = es;

    es.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data) as TaskProgressData;
      setProgress(data);
    });

    es.addEventListener("complete", (e) => {
      const data = JSON.parse(e.data) as TaskResult;
      setFinalResult(data);
      es.close();
    });

    es.addEventListener("error", (e) => {
      if (e instanceof MessageEvent) {
        const data = JSON.parse(e.data) as TaskResult;
        setFinalResult(data);
      }
      es.close();
    });

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [taskId]);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    try {
      await fetch(`/api/agent-tasks/${taskId}/cancel`, { method: "POST" });
    } catch {
      setCancelling(false);
    }
  }, [taskId]);

  const isTerminal = finalResult !== null;
  const isRunning =
    progress.status === "running" || progress.status === "cancelling";
  const percent = progress.percent ?? 0;

  return (
    <div
      className="my-3 rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-bg-surface)",
      }}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon status={finalResult?.status ?? progress.status} />
          <span
            className="text-sm font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {title}
          </span>
        </div>
        {isRunning && !cancelling && (
          <button
            onClick={handleCancel}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors hover:bg-red-50"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <X size={12} />
            Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      {!isTerminal && (
        <div className="mb-2">
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ background: "var(--color-bg-hover)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${Math.max(percent, 2)}%`,
                background: "var(--color-accent)",
              }}
            />
          </div>
        </div>
      )}

      {/* Status line */}
      <div
        className="flex items-center justify-between text-xs"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {isTerminal ? (
          <TerminalStatus result={finalResult} />
        ) : (
          <>
            <span>
              {progress.message ??
                (progress.status === "queued" ? "Queued..." : "Working...")}
            </span>
            {progress.total && (
              <span>
                {progress.current.toLocaleString()}/
                {progress.total.toLocaleString()} ({percent}%)
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <CheckCircle2
          size={16}
          style={{ color: "var(--color-success, #22c55e)" }}
        />
      );
    case "failed":
      return (
        <XCircle
          size={16}
          style={{ color: "var(--color-error, #ef4444)" }}
        />
      );
    case "cancelled":
      return (
        <Ban size={16} style={{ color: "var(--color-text-tertiary)" }} />
      );
    default:
      return (
        <Loader2
          size={16}
          className="animate-spin"
          style={{ color: "var(--color-accent)" }}
        />
      );
  }
}

function TerminalStatus({ result }: { result: TaskResult }) {
  if (result.status === "completed") {
    const r = result.result ?? {};
    const parts: string[] = [];
    if (typeof r.created === "number") parts.push(`${r.created} created`);
    if (typeof r.updated === "number") parts.push(`${r.updated} updated`);
    if (typeof r.skipped === "number") parts.push(`${r.skipped} skipped`);
    if (typeof r.errors === "number" && (r.errors as number) > 0)
      parts.push(`${r.errors} errors`);
    return <span>{parts.length > 0 ? parts.join(", ") : "Done"}</span>;
  }

  if (result.status === "failed") {
    return (
      <span style={{ color: "var(--color-error, #ef4444)" }}>
        {result.error?.slice(0, 200) ?? "Failed"}
      </span>
    );
  }

  return <span>Cancelled</span>;
}
