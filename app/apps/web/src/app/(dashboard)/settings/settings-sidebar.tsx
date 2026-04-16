"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  User,
  Activity,
  Building,
  Users,
  BookOpen,
  GitBranch,
  Bell,
  Mail,
  Database,
  CreditCard,
  Workflow,
  Box,
  Plug,
  Target,
  Video,
  FlaskConical,
  Lock,
  Shield,
  Search,
  X,
} from "lucide-react";

interface NavSection {
  label: string;
  adminOnly?: boolean;
  items: Array<{ label: string; href: string; icon: typeof User }>;
}

const settingsNav: NavSection[] = [
  {
    label: "Account",
    items: [
      { label: "Agent", href: "/settings/agent", icon: Activity },
      { label: "Privacy & data", href: "/settings/privacy", icon: Shield },
      { label: "Security", href: "/settings/security", icon: Lock },
      { label: "Settings", href: "/settings", icon: User },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Custom Objects", href: "/settings/objects", icon: Box },
      { label: "Data Model", href: "/settings/data-model", icon: Database },
      { label: "General", href: "/settings/workspace", icon: Building },
      { label: "ICP & Product", href: "/settings/icp", icon: Target },
      { label: "Knowledge", href: "/settings/knowledge", icon: BookOpen },
      { label: "Mail & Calendar", href: "/settings/mail-calendar", icon: Mail },
      { label: "Members", href: "/settings/members", icon: Users },
      { label: "Notifications", href: "/settings/notifications", icon: Bell },
      { label: "Opportunity Stages", href: "/settings/stages", icon: GitBranch },
      { label: "Recording", href: "/settings/recording", icon: Video },
      { label: "Workflows", href: "/settings/workflows", icon: Workflow },
    ],
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [
      { label: "Evaluations", href: "/settings/evals", icon: FlaskConical },
      { label: "MCP Integration", href: "/settings/mcp", icon: Plug },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Billing", href: "/settings/billing", icon: CreditCard },
    ],
  },
];

export default function SettingsSidebar({
  children,
  isAdmin,
}: {
  children: React.ReactNode;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  // N16 — sidebar fuzzy filter. Substring match on label, lower-cased.
  // Sections with zero matching items collapse so the user only sees
  // hits. Empty query renders the full nav unchanged.
  const [filter, setFilter] = useState("");
  const visibleSections = settingsNav
    .filter((s) => !s.adminOnly || isAdmin)
    .map((s) => {
      if (!filter.trim()) return s;
      const q = filter.trim().toLowerCase();
      return { ...s, items: s.items.filter((i) => i.label.toLowerCase().includes(q)) };
    })
    .filter((s) => s.items.length > 0);

  return (
    <div className="flex h-full min-h-0">
      {/* Settings sidebar */}
      <aside
        className="flex w-[var(--sidebar-width)] flex-shrink-0 flex-col overflow-y-auto px-2 py-3"
        style={{ borderRight: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <Link
          href="/"
          className="mb-3 flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors"
          style={{ color: "var(--color-accent)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <ArrowLeft size={14} /> Settings
        </Link>

        {/* N16 — settings filter */}
        <div className="relative mb-2">
          <Search size={12} className="absolute left-2.5 top-2" style={{ color: "var(--color-text-muted)" }} aria-hidden="true" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter settings…"
            aria-label="Filter settings"
            className="h-7 w-full rounded-md pl-7 pr-7 text-[12px] outline-none"
            style={{
              background: "var(--color-bg-page)",
              border: "1px solid var(--color-border-default)",
              color: "var(--color-text-primary)",
            }}
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="Clear filter"
              className="absolute right-1.5 top-1.5 rounded p-0.5 hover:opacity-70"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {visibleSections.length === 0 && (
          <p className="px-2 py-3 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
            No settings match &ldquo;{filter}&rdquo;.
          </p>
        )}

        {visibleSections.map((section) => (
          <div key={section.label} className="mb-3">
            <div
              className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/settings" && pathname?.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-all duration-150"
                    style={{
                      background: isActive ? "var(--color-accent-soft)" : "transparent",
                      color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                      boxShadow: isActive ? "inset 3px 0 0 0 var(--color-accent)" : undefined,
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    <Icon
                      size={15}
                      className="shrink-0"
                      style={{ color: isActive ? "var(--color-accent)" : undefined, opacity: isActive ? 1 : 0.5 }}
                    />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl py-10">{children}</div>
      </main>
    </div>
  );
}
