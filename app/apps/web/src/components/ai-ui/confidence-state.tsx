"use client";

import { Check, AlertCircle, Circle, Slash, type LucideIcon } from "lucide-react";

/**
 * AI-UI primitive : 4-state confidence chip.
 *
 * Sprint-2 (audit) — generalises `<SignalConfidenceBadge>` to a
 * surface-agnostic primitive. Use anywhere AI returns a labelled
 * level of trust (signals, deal recommendations, next-action chips,
 * health score components, retrieval scores).
 *
 * The 4-state ladder is canonical : `verified` (machine-grounded
 * citation), `likely` (high LLM confidence with no URL), `uncertain`
 * (no URL + low confidence — hide by default), `unverified` (URL
 * provided but HEAD failed → hallucination signal).
 */
export type ConfidenceLevel =
  | "verified"
  | "likely"
  | "uncertain"
  | "unverified";

const PALETTE: Record<
  ConfidenceLevel,
  { dot: string; bg: string; label: string; icon: LucideIcon }
> = {
  verified: {
    dot: "var(--color-success, #059669)",
    bg: "rgba(16,185,129,0.10)",
    label: "Verified",
    icon: Check,
  },
  likely: {
    dot: "var(--color-warning, #d97706)",
    bg: "rgba(217,119,6,0.10)",
    label: "Likely",
    icon: Circle,
  },
  uncertain: {
    dot: "var(--color-text-tertiary)",
    bg: "var(--color-bg-hover)",
    label: "Uncertain",
    icon: Slash,
  },
  unverified: {
    dot: "var(--color-error, #dc2626)",
    bg: "rgba(220,38,38,0.08)",
    label: "Unverified",
    icon: AlertCircle,
  },
};

export interface ConfidenceStateProps {
  level: ConfidenceLevel;
  /** Override the default label ("Verified" / "Likely" / …) — useful
   *  for surface-specific copy like "Confirmed by Apollo" or "Inferred". */
  label?: string;
  /** Hover tooltip — concrete reason the chip is at this level. */
  reason?: string;
  size?: "sm" | "md";
}

export function ConfidenceState({
  level,
  label,
  reason,
  size = "sm",
}: ConfidenceStateProps) {
  const palette = PALETTE[level];
  const Icon = palette.icon;
  const fontSize = size === "md" ? 11 : 10;
  const iconSize = size === "md" ? 11 : 9;
  const padX = size === "md" ? 8 : 6;
  const padY = size === "md" ? 3 : 2;
  const tooltip = reason
    ? `${palette.label}: ${reason}`
    : level === "unverified"
      ? "URL HEAD failed — possible LLM hallucination"
      : palette.label;

  return (
    <span
      title={tooltip}
      className="inline-flex items-center gap-1 rounded-full font-medium"
      style={{
        fontSize: `${fontSize}px`,
        padding: `${padY}px ${padX}px`,
        background: palette.bg,
        color: palette.dot,
        border: `1px solid ${palette.dot}`,
      }}
    >
      <Icon size={iconSize} aria-hidden />
      {label ?? palette.label}
    </span>
  );
}

/** True when the chip should appear in the default view (verified or likely). */
export function isVisibleAtDefault(level: ConfidenceLevel): boolean {
  return level === "verified" || level === "likely";
}
