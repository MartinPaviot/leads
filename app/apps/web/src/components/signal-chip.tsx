"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { SignalKey, SignalPayload, Source } from "@/lib/tam-stream/events";

export interface SignalChipProps {
  /** Built-in signal key (investor_overlap, funding_recent…). When
   * omitted the chip is being used for a custom signal and
   * `falseLabel` takes over as the "No" label. */
  signalKey?: SignalKey;
  /** null means "still computing" — renders a shimmer placeholder. */
  payload: SignalPayload | null;
  label: string;
  /** Label rendered when `payload.value === false` and no `signalKey`
   * is provided. Falls back to "—" for custom signals. */
  falseLabel?: string;
  /** Stable unique id for this chip (e.g. `${companyId}::${signalKey}`).
   * When provided, the parent can use it with `openId` / `onOpenChange`
   * to enforce "only one popover open at a time" across many chips. */
  id?: string;
  /** Which chip's popover is currently open — drives this chip's open
   * state when `id === openId`. Optional; when omitted each chip owns
   * its own popover state locally. */
  openId?: string | null;
  onOpenChange?: (id: string | null) => void;
}

const LABEL_WHEN_FALSE: Record<SignalKey, string> = {
  investor_overlap: "No overlap",
  funding_recent: "No recent raise",
  funding_crunchbase: "No CB funding",
  hiring_intent: "Not hiring",
  yc_company: "Not YC",
};

export function SignalChip({
  signalKey,
  payload,
  label,
  falseLabel,
  id,
  openId,
  onOpenChange,
}: SignalChipProps) {
  const chipId = id ?? signalKey ?? label;
  const isOpen = openId === chipId;
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const open = onOpenChange ? isOpen : fallbackOpen;

  const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"reasoning" | "sources">("reasoning");

  useEffect(() => {
    if (!open) return;
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (onOpenChange) onOpenChange(null);
        else setFallbackOpen(false);
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onOpenChange]);

  // ── Pending (shimmer) ──
  if (!payload) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px]"
        style={{
          background: "var(--color-bg-hover)",
          color: "var(--color-text-tertiary)",
          border: "1px solid var(--color-border-default)",
          animation: "signal-shimmer 1.2s ease-in-out infinite",
        }}
        aria-label={`Computing ${label}`}
      >
        <span style={{ letterSpacing: "0.2em" }}>···</span>
      </span>
    );
  }

  // ── Resolved states ──
  const { value, confidence } = payload;

  // Indeterminate: we lack data to say yes or no. Keep it subtle —
  // don't alarm the user with a red chip, just a dim dash.
  if (confidence === "indeterminate") {
    return (
      <ChipShell
        onClick={() => {
          if (onOpenChange) onOpenChange(isOpen ? null : chipId);
          else setFallbackOpen((v) => !v);
        }}
        open={open}
        ref={ref}
        style={{
          background: "transparent",
          color: "var(--color-text-tertiary)",
          border: "1px dashed var(--color-border-default)",
        }}
      >
        —
        {open && (
          <Popover
            payload={payload}
            label={label}
            tab={tab}
            onTab={setTab}
          />
        )}
      </ChipShell>
    );
  }

  // Resolved true: green chip. Medium confidence gets a dashed border
  // to signal the heuristic nature — stays green because the signal
  // IS true per our best-effort detection, just flagged for caution.
  if (value) {
    const borderStyle = confidence === "medium" ? "dashed" : "solid";
    return (
      <ChipShell
        onClick={() => {
          if (onOpenChange) onOpenChange(isOpen ? null : chipId);
          else setFallbackOpen((v) => !v);
        }}
        open={open}
        ref={ref}
        style={{
          background: "var(--color-success-soft)",
          color: "var(--color-success)",
          border: `1px ${borderStyle} var(--color-success)`,
        }}
      >
        {label}
        {open && (
          <Popover
            payload={payload}
            label={label}
            tab={tab}
            onTab={setTab}
          />
        )}
      </ChipShell>
    );
  }

  // Resolved false: muted grey chip with strike-through text.
  const resolvedFalseLabel =
    falseLabel ?? (signalKey ? LABEL_WHEN_FALSE[signalKey] : undefined) ?? "—";
  return (
    <ChipShell
      onClick={() => {
        if (onOpenChange) onOpenChange(isOpen ? null : chipId);
        else setFallbackOpen((v) => !v);
      }}
      open={open}
      ref={ref}
      style={{
        background: "var(--color-bg-hover)",
        color: "var(--color-text-tertiary)",
        border: "1px solid var(--color-border-default)",
        textDecoration: "line-through",
        textDecorationThickness: "1px",
        textDecorationColor: "var(--color-border-default)",
      }}
    >
      {resolvedFalseLabel}
      {open && (
        <Popover
          payload={payload}
          label={label}
          tab={tab}
          onTab={setTab}
        />
      )}
    </ChipShell>
  );
}

// ────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────

const ChipShell = function ChipShell(
  props: React.PropsWithChildren<{
    onClick: () => void;
    open: boolean;
    style: React.CSSProperties;
  }> & { ref?: React.Ref<HTMLDivElement> },
) {
  const { children, onClick, style } = props;
  return (
    <span
      ref={props.ref as React.Ref<HTMLSpanElement>}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="relative inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium cursor-pointer select-none"
      style={style}
    >
      {children}
    </span>
  );
};

function Popover({
  payload,
  label,
  tab,
  onTab,
}: {
  payload: SignalPayload;
  label: string;
  tab: "reasoning" | "sources";
  onTab: (t: "reasoning" | "sources") => void;
}) {
  const verified = payload.sources.filter((s) => s.verified);
  const unverified = payload.sources.filter((s) => !s.verified);

  return (
    <div
      className="absolute z-50 mt-1 w-[300px] rounded-lg p-0 shadow-lg"
      style={{
        top: "100%",
        left: 0,
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
        boxShadow: "var(--shadow-dialog)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Tabs */}
      <div
        className="flex items-center border-b"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <TabButton
          label="Reasoning"
          active={tab === "reasoning"}
          onClick={() => onTab("reasoning")}
        />
        <TabButton
          label={`Sources (${payload.sources.length})`}
          active={tab === "sources"}
          onClick={() => onTab("sources")}
        />
      </div>

      {/* Body */}
      <div className="p-3">
        {tab === "reasoning" ? (
          <div className="space-y-2">
            <div
              className="text-[11px] uppercase tracking-wider font-medium"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {label}
            </div>
            <div
              className="text-[12px] leading-relaxed"
              style={{ color: "var(--color-text-primary)" }}
            >
              {payload.reason}
            </div>
            {payload.confidence === "medium" && (
              <div
                className="text-[11px] italic"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Heuristic detection — verify via sources.
              </div>
            )}
            <div
              className="text-[10px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Computed {formatRelativeTime(payload.computedAt)}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {verified.length === 0 && unverified.length === 0 && (
              <div
                className="text-[12px]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                No sources attached to this signal.
              </div>
            )}
            {verified.length > 0 && (
              <div className="space-y-1.5">
                {verified.map((s, i) => (
                  <SourceRow key={`v-${i}`} source={s} />
                ))}
              </div>
            )}
            {unverified.length > 0 && (
              <details>
                <summary
                  className="text-[11px] cursor-pointer"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Unverified ({unverified.length})
                </summary>
                <div className="mt-1.5 space-y-1.5">
                  {unverified.map((s, i) => (
                    <SourceRow key={`u-${i}`} source={s} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 text-[11px] font-medium transition-colors"
      style={{
        color: active ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
        borderBottom: active
          ? "2px solid var(--color-accent)"
          : "2px solid transparent",
      }}
    >
      {label}
    </button>
  );
}

function SourceRow({ source }: { source: Source }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2 rounded px-1.5 py-1 -mx-1.5 transition-colors hover:opacity-100"
      style={{
        color: "var(--color-text-secondary)",
        textDecoration: "none",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--color-bg-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "transparent")
      }
    >
      {source.favicon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source.favicon}
          alt=""
          width={14}
          height={14}
          className="mt-[2px] shrink-0 rounded-sm"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span
          className="mt-[2px] shrink-0 rounded-sm"
          style={{
            width: 14,
            height: 14,
            background: "var(--color-bg-hover)",
          }}
        />
      )}
      <span className="flex-1 text-[11px] leading-[1.3]">{source.title}</span>
      <ExternalLink
        size={11}
        className="mt-[3px] shrink-0"
        style={{ color: "var(--color-text-tertiary)" }}
      />
    </a>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const delta = Date.now() - then;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}
