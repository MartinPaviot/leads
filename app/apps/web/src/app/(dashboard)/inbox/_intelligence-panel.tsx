"use client";

/**
 * IntelligencePanel — the collapsible "Intelligence" drawer in the reading view.
 *
 * Upstream/Superhuman open a thread on the SUBJECT + the MESSAGE — calm, email
 * first. Elevay's differentiation is the intelligence layer (signals, brief,
 * action items, objections), but stacking those cards ABOVE the email buried the
 * message and made the inbox feel "années lumières" from Upstream. This wrapper
 * relegates that whole stack behind one collapsed toggle so the email reads
 * first; the intelligence stays one click away, never deleted.
 *
 * Collapsed by default. The parent passes `key={conversationKey}` so opening a
 * new thread remounts this and resets to collapsed (calm default every time).
 */

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n/locale";

export function IntelligencePanel({
  count,
  children,
}: {
  /** Number of high-signal data sections inside (shown as a badge). */
  count: number;
  children: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div
      className="mb-3 rounded-lg border"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
      >
        <ChevronRight
          size={14}
          className="shrink-0 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "none", color: "var(--color-text-tertiary)" }}
          aria-hidden
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
          Intelligence
        </span>
        {count > 0 && (
          <span
            className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
            style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}
          >
            {count}
          </span>
        )}
        <span className="ml-auto text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          {open ? t("inbox.intelligence.hide") : t("inbox.intelligence.show")}
        </span>
      </button>
      {open && (
        <div className="border-t px-3 py-3" style={{ borderColor: "var(--color-border-default)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
