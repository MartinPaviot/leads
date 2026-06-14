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
import { QUALIFICATION_EXTRAS_ENABLED } from "@/lib/settings/qualification-extras-visibility";

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

// The four auto-filled CRM facts hybrid mode can gate independently.
const HYBRID_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "meddic", label: "Qualification (MEDDPICC)", hint: "metrics, economic buyer, decision process…" },
  { key: "callIntel", label: "Account intel", hint: "stack in place, alternatives, triggers" },
  { key: "callProfile", label: "Contact profile", hint: "role, decision-maker, disposition" },
  { key: "evidence", label: "Evidence quotes", hint: "the verbatim lines that ground each claim" },
];

export default function CaptureApprovalsPage() {
  const { toast } = useToast();
  const [list, setList] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"auto" | "review" | "hybrid">("auto");
  const [fieldModes, setFieldModes] = useState<Record<string, "auto" | "review">>({});
  const [modeSaving, setModeSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/capture-approvals");
      if (res.ok) {
        const data = await res.json();
        setList(data.approvals ?? []);
        if (data.mode === "review" || data.mode === "auto" || data.mode === "hybrid") setMode(data.mode);
        if (data.fieldModes && typeof data.fieldModes === "object") setFieldModes(data.fieldModes);
      } else toast("Failed to load approvals", "error");
    } catch {
      toast("Failed to load approvals", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const changeMode = useCallback(
    async (next: "auto" | "review" | "hybrid") => {
      if (next === mode || modeSaving) return;
      setModeSaving(true);
      const prev = mode;
      setMode(next); // optimistic
      try {
        const res = await fetch("/api/capture-approvals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: next }),
        });
        if (!res.ok) {
          setMode(prev);
          toast("Couldn't change capture mode", "error");
        } else {
          toast(
            next === "review"
              ? "Review mode on — new captures wait here for approval."
              : next === "hybrid"
                ? "Hybrid mode on — set per-field rules below."
                : "Auto mode on — captures enter the CRM directly.",
            "success",
          );
        }
      } catch {
        setMode(prev);
        toast("Couldn't change capture mode", "error");
      } finally {
        setModeSaving(false);
      }
    },
    [mode, modeSaving, toast],
  );

  const changeFieldMode = useCallback(
    async (field: string, next: "auto" | "review") => {
      if (modeSaving) return;
      const prev = fieldModes;
      const optimistic = { ...fieldModes, [field]: next };
      setFieldModes(optimistic); // optimistic
      setModeSaving(true);
      try {
        const res = await fetch("/api/capture-approvals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "hybrid", fieldModes: optimistic }),
        });
        if (!res.ok) {
          setFieldModes(prev);
          toast("Couldn't update the field rule", "error");
        }
      } catch {
        setFieldModes(prev);
        toast("Couldn't update the field rule", "error");
      } finally {
        setModeSaving(false);
      }
    },
    [fieldModes, modeSaving, toast],
  );

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
        subtitle="Review interactions captured from email, meetings and calls before they enter the CRM."
      />

      {/* Capture-mode control — the toggle that was missing. In review mode
          every new auto-capture parks here for approval; in auto mode they
          enter the CRM directly. */}
      <div
        className="mb-5 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <div className="min-w-0">
          <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            Capture mode
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            {mode === "review"
              ? "New captures — and the fields auto-filled from calls & meetings (qualification, account intel) — wait for your approval before they reach the CRM."
              : "Captures and the fields auto-filled from calls & meetings enter the CRM automatically."}
          </p>
        </div>
        <div
          className="inline-flex shrink-0 rounded-md p-0.5"
          style={{ background: "var(--color-bg-hover)", border: "1px solid var(--color-border-default)" }}
        >
          {/* 'hybrid' (per-field) is prod-hidden — auto/review is enough for a
              founder-led workspace. getFieldApprovalMode logic is untouched. */}
          {(QUALIFICATION_EXTRAS_ENABLED ? (["auto", "review", "hybrid"] as const) : (["auto", "review"] as const)).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => changeMode(m)}
                disabled={modeSaving}
                className="rounded px-3 py-1 text-[12px] font-medium capitalize transition-colors"
                style={{
                  background: active ? "var(--color-accent)" : "transparent",
                  color: active ? "#fff" : "var(--color-text-secondary)",
                  opacity: modeSaving ? 0.6 : 1,
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {QUALIFICATION_EXTRAS_ENABLED && mode === "hybrid" && (
        <div
          className="mb-5 rounded-lg border p-4"
          style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
        >
          <p className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            Per-field rules
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            Choose which auto-filled fields sync straight to the CRM and which wait for your approval on each record.
          </p>
          <div className="mt-3 space-y-2">
            {HYBRID_FIELDS.map((f) => {
              const fm = fieldModes[f.key] ?? "auto";
              return (
                <div key={f.key} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{f.label}</p>
                    <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>{f.hint}</p>
                  </div>
                  <div
                    className="inline-flex shrink-0 rounded-md p-0.5"
                    style={{ background: "var(--color-bg-hover)", border: "1px solid var(--color-border-default)" }}
                  >
                    {(["auto", "review"] as const).map((v) => {
                      const active = fm === v;
                      return (
                        <button
                          key={v}
                          onClick={() => changeFieldMode(f.key, v)}
                          disabled={modeSaving}
                          className="rounded px-2.5 py-0.5 text-[11px] font-medium capitalize"
                          style={{
                            background: active ? "var(--color-accent)" : "transparent",
                            color: active ? "#fff" : "var(--color-text-secondary)",
                            opacity: modeSaving ? 0.6 : 1,
                          }}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        {loading && list.length === 0 && (
          <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>Loading…</p>
        )}
        {!loading && list.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded border p-8 text-center" style={{ borderColor: "var(--color-border-default)" }}>
            <Inbox size={20} style={{ color: "var(--color-text-tertiary)" }} />
            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              {mode === "review"
                ? "Nothing waiting for review. New captures from email, meetings and calls will appear here."
                : "Capture mode is Auto, so captures go straight to the CRM. Switch to Review above to queue them here first."}
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
