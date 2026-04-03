"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  CircleDot,
  Users,
  CheckSquare,
  Calendar,
  FileText,
  MessageSquare,
  MessageCircle,
  Network,
  FlaskConical,
  Settings,
  Plus,
  Clock,
  Zap,
  Shield,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "@/components/ui/theme-provider";
import { Avatar } from "@/components/ui/avatar";

interface SidebarProps {
  userName: string;
  userInitials: string;
  recentChats: Array<{ id: string; title: string | null }>;
  onSignOut: () => void;
}

const navSections = [
  {
    items: [
      { label: "Up next", href: "/", icon: Clock },
    ],
  },
  {
    label: "Records",
    items: [
      { label: "Accounts", href: "/accounts", icon: Building2 },
      { label: "Opportunities", href: "/opportunities", icon: CircleDot },
      { label: "Contacts", href: "/contacts", icon: Users },
    ],
  },
  {
    label: "Outreach",
    items: [
      { label: "Sequences", href: "/sequences", icon: Zap },
      { label: "Deliverability", href: "/deliverability", icon: Shield },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Tasks", href: "/tasks", icon: CheckSquare },
      { label: "Meetings", href: "/meetings", icon: Calendar },
      { label: "Notes", href: "/notes", icon: FileText },
      { label: "Voice of Customer", href: "/voice-of-customer", icon: MessageCircle },
      { label: "Context Graph", href: "/graph", icon: Network },
      { label: "Graph Evals", href: "/settings/evals", icon: FlaskConical },
    ],
  },
];

export function Sidebar({ userName, userInitials, recentChats, onSignOut }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { theme, toggle: toggleTheme } = useTheme();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  }

  return (
    <aside
      className="flex flex-col transition-[width] duration-200 ease-in-out"
      style={{
        width: collapsed ? "52px" : "var(--sidebar-width)",
        minWidth: collapsed ? "52px" : "var(--sidebar-width)",
        background: "var(--color-bg-sidebar)",
        borderRight: "1px solid var(--color-border-default)",
      }}
    >
      {/* Logo + User header */}
      <div
        className="flex items-center gap-2.5 px-3 py-3"
        style={{ borderBottom: "1px solid var(--color-border-default)" }}
      >
        {!collapsed ? (
          <>
            {/* Gradient logo text */}
            <span className="gradient-text text-[16px] font-bold tracking-tight">
              LeadSens
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
              title="Collapse sidebar"
            >
              <ChevronsLeft size={14} />
            </button>
          </>
        ) : (
          <button
            onClick={() => setCollapsed(false)}
            className="mx-auto flex h-7 w-7 items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            title="Expand sidebar"
          >
            <ChevronsRight size={14} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {navSections.map((section, sectionIdx) => (
          <div key={section.label || sectionIdx} className={sectionIdx > 0 ? "mt-4" : ""}>
            {section.label && !collapsed && (
              <div
                className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                {section.label}
              </div>
            )}
            {collapsed && sectionIdx > 0 && (
              <div
                className="mx-2 mb-2 mt-1"
                style={{ borderTop: "1px solid var(--color-border-default)" }}
              />
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-all duration-150 ${
                      collapsed ? "h-8 w-8 justify-center mx-auto" : "h-8 px-2.5"
                    }`}
                    style={{
                      color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                      background: active ? "var(--color-accent-soft)" : "transparent",
                      borderLeft: active && !collapsed ? "2px solid transparent" : undefined,
                      // Active gradient left border via box-shadow
                      boxShadow: active && !collapsed
                        ? "inset 3px 0 0 0 var(--color-accent)"
                        : undefined,
                    }}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon
                      size={16}
                      className="shrink-0"
                      style={{
                        color: active ? "var(--color-accent)" : undefined,
                        opacity: active ? 1 : 0.6,
                      }}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Chats section */}
        <div className="mt-4">
          {!collapsed && (
            <div
              className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Chats
            </div>
          )}
          {collapsed && (
            <div
              className="mx-2 mb-2 mt-1"
              style={{ borderTop: "1px solid var(--color-border-default)" }}
            />
          )}
          <Link
            href="/chat"
            className={`group flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-all duration-150 ${
              collapsed ? "h-8 w-8 justify-center mx-auto" : "h-8 px-2.5"
            }`}
            style={{
              color: isActive("/chat") ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              background: isActive("/chat") ? "var(--color-accent-soft)" : "transparent",
            }}
            title={collapsed ? "New chat" : undefined}
          >
            <Plus size={16} className="shrink-0" style={{ opacity: 0.6 }} />
            {!collapsed && <span>New chat</span>}
          </Link>

          {/* Recent threads */}
          {!collapsed && recentChats.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {recentChats.map((thread) => (
                <Link
                  key={thread.id}
                  href={`/chat?thread=${thread.id}`}
                  className="group flex h-7 items-center gap-2 rounded-md px-2.5 text-[12px] transition-colors"
                  style={{ color: "var(--color-text-tertiary)" }}
                  title={thread.title || "Untitled chat"}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <MessageSquare size={13} className="shrink-0" style={{ opacity: 0.5 }} />
                  <span className="truncate">{thread.title || "Untitled chat"}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div
        className="px-2 py-2"
        style={{ borderTop: "1px solid var(--color-border-default)" }}
      >
        {/* User avatar + name */}
        {!collapsed && (
          <div className="mb-2 flex items-center gap-2 px-2">
            <Avatar name={userName} size="sm" />
            <span
              className="flex-1 truncate text-[12px] font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              {userName}
            </span>
          </div>
        )}

        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          className={`group flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors ${
            collapsed ? "h-8 w-8 justify-center mx-auto" : "h-8 w-full px-2.5"
          }`}
          style={{ color: "var(--color-text-secondary)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          title={collapsed ? "Toggle theme" : undefined}
        >
          {theme === "light" ? <Moon size={15} className="shrink-0" style={{ opacity: 0.6 }} /> : <Sun size={15} className="shrink-0" style={{ opacity: 0.6 }} />}
          {!collapsed && <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>}
        </button>

        {/* Settings */}
        <Link
          href="/settings"
          className={`group flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors ${
            collapsed ? "h-8 w-8 justify-center mx-auto" : "h-8 px-2.5"
          }`}
          style={{
            color: isActive("/settings") ? "var(--color-text-primary)" : "var(--color-text-secondary)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings size={15} className="shrink-0" style={{ opacity: 0.6 }} />
          {!collapsed && <span>Settings</span>}
        </Link>

        {/* Logout + legal */}
        {!collapsed && (
          <div className="mt-1.5 flex items-center gap-2 px-2.5">
            <button
              onClick={onSignOut}
              className="flex items-center gap-1 text-[11px] transition-colors hover:opacity-80"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <LogOut size={11} />
              Log out
            </button>
            <div className="flex-1" />
            <Link href="/terms" className="text-[10px] hover:underline" style={{ color: "var(--color-text-tertiary)" }}>Terms</Link>
            <Link href="/privacy" className="text-[10px] hover:underline" style={{ color: "var(--color-text-tertiary)" }}>Privacy</Link>
          </div>
        )}

        {collapsed && (
          <button
            onClick={onSignOut}
            className="mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            title="Log out"
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <LogOut size={14} />
          </button>
        )}
      </div>
    </aside>
  );
}
