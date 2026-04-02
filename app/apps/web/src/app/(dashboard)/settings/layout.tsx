"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  User,
  Bot,
  Building,
  Users,
  BookOpen,
  GitBranch,
  Bell,
  Mail,
  Database,
  CreditCard,
  Workflow,
} from "lucide-react";

const settingsNav = [
  {
    label: "Account",
    items: [
      { label: "Settings", href: "/settings", icon: User },
      { label: "Agent", href: "/settings/agent", icon: Bot },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "General", href: "/settings/workspace", icon: Building },
      { label: "Members", href: "/settings/members", icon: Users },
      { label: "Knowledge", href: "/settings/knowledge", icon: BookOpen },
      { label: "Data Model", href: "/settings/data-model", icon: Database },
      { label: "Opportunity Stages", href: "/settings/stages", icon: GitBranch },
      { label: "Notifications", href: "/settings/notifications", icon: Bell },
      { label: "Workflows", href: "/settings/workflows", icon: Workflow },
    ],
  },
  {
    label: "Outbound",
    items: [
      { label: "Mailboxes", href: "/settings/mailboxes", icon: Mail },
    ],
  },
  {
    label: "Billing",
    items: [
      { label: "Billing", href: "/settings/billing", icon: CreditCard },
    ],
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full">
      {/* Settings sidebar */}
      <aside
        className="flex w-[var(--sidebar-width)] flex-shrink-0 flex-col px-2 py-3"
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

        {settingsNav.map((section) => (
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
        <div className="mx-auto max-w-2xl px-8 py-10">{children}</div>
      </main>
    </div>
  );
}
