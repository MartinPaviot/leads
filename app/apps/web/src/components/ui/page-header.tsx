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
      className="flex shrink-0 items-center gap-3 px-6"
      style={{
        height: "var(--header-height)",
        borderBottom: "1px solid var(--color-border-default)",
        background: "var(--color-bg-card)",
      }}
    >
      {icon && (
        <span style={{ color: "var(--color-text-tertiary)" }}>{icon}</span>
      )}
      <h1 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
        {title}
      </h1>
      {isBetaRoute(pathname) && <BetaTag />}
      {subtitle && (
        <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          {subtitle}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
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
