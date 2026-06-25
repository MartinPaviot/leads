"use client";

import { usePathname } from "next/navigation";
import { isBetaRoute } from "@/lib/beta-routes";
import { BetaTag } from "@/components/ui/beta-tag";

interface PageHeaderProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PageHeader({ icon, title, subtitle, children }: PageHeaderProps) {
  const pathname = usePathname();
  return (
    <div
      // flex-wrap + minHeight (not a hard height) so a header with several
      // action buttons stays reachable on a narrow / zoomed viewport (founder
      // runs half-screen + 200% zoom ≈ 460px): the actions wrap onto a second
      // line instead of overflowing off the right edge with no scroll. On a
      // wide viewport everything still fits on the single 44px row, unchanged.
      // Safe: --header-height is only ever a bar height, never a sticky `top`.
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-6 py-2"
      style={{
        minHeight: "var(--header-height)",
        borderBottom: "1px solid var(--color-border-default)",
        background: "var(--color-bg-card)",
      }}
    >
      {icon && (
        <span style={{ color: "var(--color-text-tertiary)" }}>{icon}</span>
      )}
      <h1 className="shrink-0 whitespace-nowrap text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
        {title}
      </h1>
      {isBetaRoute(pathname) && <BetaTag />}
      {subtitle && (
        <span className="shrink-0 whitespace-nowrap text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          {subtitle}
        </span>
      )}
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        {children}
      </div>
    </div>
  );
}

interface FilterBarProps {
  children: React.ReactNode;
}

export function FilterBar({ children }: FilterBarProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-3 px-6"
      style={{
        height: "var(--filter-bar-height)",
        borderBottom: "1px solid var(--color-border-default)",
        background: "var(--color-bg-card)",
      }}
    >
      {children}
    </div>
  );
}
