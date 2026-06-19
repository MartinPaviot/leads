"use client";

import { useState } from "react";
import { Check, X, AlertTriangle, Pencil } from "lucide-react";
import { getActionManifest } from "@/lib/chat/page-actions/registry";
import type { InvokeActionDirective } from "@/lib/chat/ui-directives";
import {
  buildConfirmFields,
  collectEditedParams,
  riskBadgesFor,
  type ConfirmField,
  type ConfirmFieldError,
  type RiskBadge,
} from "./action-confirm-fields";

/**
 * CLE-05 — the editable confirmation card for a `requireConfirm:true` page
 * action. Reuses ActionCard's visual grammar (tokens, header, field rows, action
 * bar) but is driven by the action's JSON-Schema-derived field model + a risk
 * badge derived from the manifest entry's policy scalars. Nothing here runs the
 * action; it only previews/edits + hands the edited params back to the
 * controller on Approve.
 */

export type ConfirmStatus = "pending" | "running" | "done" | "failed" | "dismissed";

export interface ActionConfirmCardProps {
  directive: InvokeActionDirective;
  status: ConfirmStatus;
  /** Last run summary (shown in the done/failed footer). */
  resultSummary?: string;
  /** Last run error (shown in the failed footer). */
  error?: string;
  onApprove: (editedParams: Record<string, unknown>) => void;
  onDismiss: () => void;
}

const toneStyle: Record<RiskBadge["tone"], { bg: string; color: string }> = {
  danger: { bg: "var(--color-error-soft, oklch(0.95 0.03 25))", color: "var(--color-error, oklch(0.5 0.16 25))" },
  warn: { bg: "var(--color-accent-soft, oklch(0.95 0.03 250))", color: "var(--color-accent, oklch(0.5 0.14 250))" },
  neutral: { bg: "var(--color-bg-muted)", color: "var(--color-text-tertiary)" },
};

export function ActionConfirmCard({
  directive,
  status,
  resultSummary,
  error,
  onApprove,
  onDismiss,
}: ActionConfirmCardProps) {
  const entry = getActionManifest().find((e) => e.id === directive.actionId);
  const [fields, setFields] = useState<ConfirmField[]>(() =>
    entry ? buildConfirmFields(entry.paramsJsonSchema, directive.params) : [],
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const editable = status === "pending" || status === "failed";

  // E-6 / E-9: the action is not on the live page (its page unmounted). Render a
  // graceful unavailable state — Dismiss only; the authoritative check is still
  // runRegisteredAction at approve time, but Approve is not offered here.
  if (!entry) {
    return (
      <div
        className="my-2 rounded-lg"
        style={{ border: "0.5px solid var(--color-border-moderate)", background: "var(--color-bg-surface)" }}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 text-[12px] font-medium"
          style={{ color: "var(--color-text-secondary)", borderBottom: "0.5px solid var(--color-border-default)" }}
        >
          <AlertTriangle size={13} style={{ color: "var(--color-text-muted)" }} />
          <span>{directive.actionId}</span>
        </div>
        <div className="px-3 py-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          This action is no longer available on this page.
        </div>
        {status === "pending" && (
          <div className="flex items-center justify-end px-3 py-2" style={{ borderTop: "0.5px solid var(--color-border-default)" }}>
            <button
              onClick={onDismiss}
              className="rounded-md px-3 py-1 text-[12px] font-medium"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    );
  }

  const badges = riskBadgesFor(entry);
  const approveLabel = entry.outbound
    ? "Send"
    : (entry.mutating && !entry.reversible) || entry.cost !== "free"
      ? "Confirm"
      : "Run";

  function setValue(key: string, value: string | boolean) {
    setFields((prev) => prev.map((f) => (f.key === key ? ({ ...f, value } as ConfirmField) : f)));
  }
  function setRaw(key: string, rawJson: string) {
    setFields((prev) => prev.map((f) => (f.key === key ? ({ ...f, rawJson } as ConfirmField) : f)));
  }

  function handleApprove() {
    try {
      const edited = collectEditedParams(fields);
      setJsonError(null);
      onApprove(edited);
    } catch (e) {
      const err = e as ConfirmFieldError;
      setJsonError(err?.message ?? "Invalid input");
    }
  }

  return (
    <div
      className="my-2 rounded-lg"
      style={{
        border: `0.5px solid ${editable ? "var(--color-accent)" : "var(--color-border-moderate)"}`,
        background: "var(--color-bg-surface)",
        opacity: status === "dismissed" ? 0.5 : 1,
      }}
    >
      {/* Header: title + risk badges */}
      <div
        className="flex items-center gap-2 px-3 py-2 text-[12px] font-medium"
        style={{ color: "var(--color-text-secondary)", borderBottom: "0.5px solid var(--color-border-default)" }}
      >
        <span className="truncate">{entry.title}</span>
        {badges.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-1">
            {badges.map((b) => (
              <span
                key={b.label}
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: toneStyle[b.tone].bg, color: toneStyle[b.tone].color }}
              >
                {b.label}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Description + editable params */}
      <div className="px-3 py-2">
        {entry.description && (
          <p className="mb-2 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            {entry.description}
          </p>
        )}

        {fields.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            No parameters.
          </p>
        ) : (
          <div className="space-y-1.5">
            {fields.map((f) => (
              <div key={f.key} className="flex items-start gap-2 text-[12px]">
                <span className="w-24 shrink-0 pt-1 capitalize" style={{ color: "var(--color-text-tertiary)" }}>
                  {f.label}
                </span>
                <div className="min-w-0 flex-1">{renderField(f)}</div>
              </div>
            ))}
          </div>
        )}

        {jsonError && (
          <p className="mt-2 text-[11px]" style={{ color: "var(--color-error, oklch(0.5 0.16 25))" }}>
            {jsonError}
          </p>
        )}
      </div>

      {/* Footer: action bar (pending/running/failed) or terminal status */}
      {status === "done" ? (
        <div
          className="flex items-center gap-1 px-3 py-2 text-[11px]"
          style={{ borderTop: "0.5px solid var(--color-border-default)", color: "oklch(0.6 0.15 145)" }}
        >
          <Check size={11} />
          {resultSummary || "Done"}
        </div>
      ) : status === "dismissed" ? (
        <div
          className="px-3 py-2 text-[11px]"
          style={{ borderTop: "0.5px solid var(--color-border-default)", color: "var(--color-text-muted)" }}
        >
          Dismissed
        </div>
      ) : (
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ borderTop: "0.5px solid var(--color-border-default)" }}
        >
          {status === "failed" && (
            <span className="mr-auto text-[11px]" style={{ color: "var(--color-error, oklch(0.5 0.16 25))" }}>
              {/* AC-5: prefer the human-readable summary (it names the offending
                  field for invalid_params); fall back to the error code. */}
              {`Failed: ${resultSummary || error || "the action could not be completed"}`}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onDismiss}
              disabled={status === "running"}
              className="rounded-md px-3 py-1 text-[12px] font-medium transition-colors disabled:opacity-50"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Dismiss
            </button>
            <button
              onClick={handleApprove}
              disabled={status === "running"}
              className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-medium text-white transition-colors disabled:opacity-60"
              style={{ background: "var(--color-accent)" }}
            >
              {status === "running" ? (
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-label="Running"
                />
              ) : (
                <Check size={12} />
              )}
              {status === "running" ? "Running" : status === "failed" ? "Retry" : approveLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  function renderField(f: ConfirmField) {
    const baseInput =
      "w-full rounded border px-1.5 py-0.5 text-[12px] outline-none disabled:opacity-60";
    const inputStyle = {
      borderColor: "var(--color-border-default)",
      color: "var(--color-text-primary)",
      background: "var(--color-bg-card)",
    } as const;

    if (f.kind === "boolean") {
      return (
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={f.value}
            disabled={!editable}
            onChange={(e) => setValue(f.key, e.target.checked)}
          />
          <span style={{ color: "var(--color-text-primary)" }}>{f.value ? "Yes" : "No"}</span>
        </label>
      );
    }
    if (f.kind === "enum") {
      return (
        <select
          className={baseInput}
          style={{ ...inputStyle, cursor: editable ? "pointer" : "default" }}
          value={f.value}
          disabled={!editable}
          onChange={(e) => setValue(f.key, e.target.value)}
        >
          {/* Keep an empty option only when the current value is not a member. */}
          {!f.options.includes(f.value) && <option value={f.value}>{f.value || "—"}</option>}
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    if (f.kind === "number") {
      return (
        <input
          inputMode="decimal"
          className={baseInput}
          style={inputStyle}
          value={f.value}
          disabled={!editable}
          onChange={(e) => setValue(f.key, e.target.value)}
        />
      );
    }
    if (f.kind === "string") {
      return f.multiline ? (
        <textarea
          rows={3}
          className={`${baseInput} resize-y`}
          style={inputStyle}
          value={f.value}
          disabled={!editable}
          onChange={(e) => setValue(f.key, e.target.value)}
        />
      ) : (
        <input
          className={baseInput}
          style={inputStyle}
          value={f.value}
          disabled={!editable}
          onChange={(e) => setValue(f.key, e.target.value)}
        />
      );
    }
    // complex: read-only preview + Edit as JSON toggle
    const isOpen = expanded[f.key];
    return (
      <div>
        {isOpen ? (
          <textarea
            rows={4}
            className={`${baseInput} resize-y font-mono`}
            style={inputStyle}
            value={f.rawJson}
            disabled={!editable}
            onChange={(e) => setRaw(f.key, e.target.value)}
          />
        ) : (
          <pre
            className="max-h-24 overflow-auto rounded px-1.5 py-1 text-[11px]"
            style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}
          >
            {f.rawJson}
          </pre>
        )}
        {editable && (
          <button
            onClick={() => setExpanded((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
            className="mt-1 inline-flex items-center gap-1 text-[11px]"
            style={{ color: "var(--color-text-muted)" }}
          >
            {isOpen ? <X size={10} /> : <Pencil size={10} />}
            {isOpen ? "Done editing" : "Edit as JSON"}
          </button>
        )}
      </div>
    );
  }
}
