"use client";

/**
 * /settings/capture-approvals — human-in-the-loop review queue (gap E).
 *
 * Lists interactions auto-captured from email / meetings / calls that are
 * waiting for approval before they land in the CRM. Only populated when
 * the workspace sets settings.captureApprovalMode = 'review'. Approve
 * inserts the activity; reject discards it.
 */

import { useCallback, useEffect, useState } from "react";
import { SettingsHeader } from "@/components/ui/settings-header";
import { Card, CardBody } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Check, X, Mail, Calendar, Phone, Inbox } from "lucide-react";

type Approval = {
  id: string;
  kind: "email" | "meeting" | "call" | string;
  sourceRef: string | null;
  summary: string | null;
  createdAt: string;
  proposedActivity: { activityType?: string; direction?: string } | null;
};

const KIND_ICON: Record<string, typeof Mail> = {
  email: Mail,
  meeting: Calendar,
  call: Phone,
};

export default function CaptureApprovalsPage() {
  const { toast } = useToast();
  const [list, setList] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/capture-approvals");
      if (res.ok) setList((await res.json()).approvals ?? []);
      else toast("Failed to load approvals", "error");
    } catch {
      toast("Failed to load approvals", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = useCallback(
    async (id: string, action: "approve" | "reject") => {
      setBusy((b) => ({ ...b, [id]: true }));
      try {
        const res = await fetch(`/api/capture-approvals/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          toast(d.error ?? `Failed to ${action}`, "error");
          return;
        }
        toast(action === "approve" ? "Added to the CRM." : "Discarded.", "success");
        setList((l) => l.filter((a) => a.id !== id));
      } catch (err) {
        toast(err instanceof Error ? err.message : "Network error", "error");
      } finally {
        setBusy((b) => {
          const next = { ...b };
          delete next[id];
          return next;
        });
      }
    },
    [toast],
  );

  return (
    <div>
      <SettingsHeader
        title="Capture approvals"
        subtitle="Review interactions captured from email, meetings and calls before they enter the CRM. Enable this by setting the workspace capture mode to review."
      />
      <div>
        {loading && list.length === 0 && (
          <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Loading…</p>
        )}
        {!loading && list.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded border p-8 text-center" style={{ borderColor: "var(--color-border-default)" }}>
            <Inbox size={20} style={{ color: "var(--color-text-tertiary)" }} />
            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              Nothing waiting for review. Captured interactions appear here only when the workspace capture mode is set to review.
            </p>
          </div>
        )}
        <div className="space-y-2">
          {list.map((a) => {
            const Icon = KIND_ICON[a.kind] ?? Inbox;
            return (
              <Card key={a.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon size={13} style={{ color: "var(--color-accent)" }} />
                        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                          {a.kind}
                        </span>
                        {a.proposedActivity?.activityType && (
                          <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                            {a.proposedActivity.activityType.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                        {a.summary || "(no summary)"}
                      </p>
                      <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {new Date(a.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => act(a.id, "approve")}
                        disabled={busy[a.id]}
                        className="flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium"
                        style={{ color: "#fff", background: "var(--color-accent)", border: "1px solid var(--color-accent)", opacity: busy[a.id] ? 0.6 : 1 }}
                      >
                        <Check size={12} /> Approve
                      </button>
                      <button
                        onClick={() => act(a.id, "reject")}
                        disabled={busy[a.id]}
                        aria-label="Reject"
                        className="rounded p-1.5"
                        style={{ color: "var(--color-text-tertiary)", border: "1px solid var(--color-border-default)", opacity: busy[a.id] ? 0.6 : 1 }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
