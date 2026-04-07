"use client";

import { AlertTriangle, TrendingUp, Lightbulb } from "lucide-react";

type CalloutVariant = "risk" | "opportunity" | "insight";

interface RiskCalloutProps {
  variant: CalloutVariant;
  title: string;
  children: React.ReactNode;
}

const variants: Record<CalloutVariant, { icon: typeof AlertTriangle; bg: string; border: string; iconColor: string; titleColor: string }> = {
  risk: {
    icon: AlertTriangle,
    bg: "oklch(0.97 0.015 25)",
    border: "oklch(0.85 0.06 25)",
    iconColor: "oklch(0.6 0.16 25)",
    titleColor: "oklch(0.5 0.14 25)",
  },
  opportunity: {
    icon: TrendingUp,
    bg: "oklch(0.97 0.015 145)",
    border: "oklch(0.85 0.06 145)",
    iconColor: "oklch(0.55 0.14 145)",
    titleColor: "oklch(0.45 0.12 145)",
  },
  insight: {
    icon: Lightbulb,
    bg: "var(--color-accent-soft)",
    border: "var(--color-accent)30",
    iconColor: "var(--color-accent)",
    titleColor: "var(--color-accent)",
  },
};

export function RiskCallout({ variant, title, children }: RiskCalloutProps) {
  const config = variants[variant];
  const Icon = config.icon;

  return (
    <div
      className="my-3 rounded-lg px-4 py-3"
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} style={{ color: config.iconColor, flexShrink: 0 }} />
        <span
          className="text-[13px] font-semibold"
          style={{ color: config.titleColor }}
        >
          {title}
        </span>
      </div>
      <div
        className="text-[13px] leading-[20px]"
        style={{ color: "var(--color-text-secondary)" }}
      >
        {children}
      </div>
    </div>
  );
}
