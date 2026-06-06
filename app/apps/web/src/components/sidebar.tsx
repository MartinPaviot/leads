"use client";

import { useState, useEffect } from "react";
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
  Settings,
  Plus,
  Clock,
  Zap,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Moon,
  Sun,
  Box,
  Folder,
  Package,
  Handshake,
  Lightbulb,
  Target,
  Rocket,
  Star,
  Tag,
  Layers,
  Briefcase,
  Globe,
  Heart,
  Bookmark,
  Flag,
  Mail,
  Inbox,
  BarChart3,
  Search,
  Bot,
  BookOpen,
  Wand2,
  Phone,
  Gauge,
  LineChart,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/components/ui/theme-provider";
import { Avatar } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/notification-bell";
import { useRef, useCallback } from "react";

const CUSTOM_ICON_MAP: Record<string, LucideIcon> = {
  Box, Folder, Package, Handshake, Lightbulb, Target, Rocket,
  Star, Tag, Layers, Briefcase, Globe, Heart, Bookmark, Flag,
};

interface SidebarProps {
  userName: string;
  userEmail?: string;
  userInitials: string;
  userAvatarUrl?: string | null;
  tenantName?: string | null;
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
    label: "AI",
    items: [
      { label: "Knowledge", href: "/knowledge", icon: BookOpen },
      { label: "Skills", href: "/skills", icon: Wand2 },
    ],
  },
  {
    label: "CRM",
    items: [
      { label: "Accounts", href: "/accounts", icon: Building2 },
      { label: "Contacts", href: "/contacts", icon: Users },
      { label: "Opportunities", href: "/opportunities", icon: CircleDot },
      { label: "Proposals", href: "/proposals", icon: Briefcase },
    ],
  },
  {
    label: "Engage",
    items: [
      { label: "Inbox", href: "/inbox", icon: Inbox },
      { label: "Call Mode", href: "/call-mode", icon: Phone },
      { label: "Campaigns", href: "/sequences", icon: Zap },
      { label: "Deliverability", href: "/deliverability", icon: Gauge },
    ],
  },
  {
    label: "Activity",
    items: [
      { label: "Meetings", href: "/meetings", icon: Calendar },
      { label: "Notes", href: "/notes", icon: FileText },
      { label: "Tasks", href: "/tasks", icon: CheckSquare },
      { label: "Insights", href: "/insights", icon: BarChart3 },
      { label: "Reports", href: "/reports", icon: LineChart },
    ],
  },
];

interface CustomObjectType {
  id: string;
  name: string;
  nameSingular: string;
  icon: string;
}

/* ── User menu: avatar + first name, hover reveals full menu ── */
function UserMenu({
  firstName,
  userName,
  userEmail,
  avatarUrl,
  tenantName,
  collapsed,
  theme,
  onToggleTheme,
  onSignOut,
  isSettingsActive,
}: {
  firstName: string;
  userName: string;
  userEmail?: string;
  avatarUrl?: string | null;
  tenantName?: string | null;
  collapsed: boolean;
  theme: string;
  onToggleTheme: () => void;
  onSignOut: () => void;
  isSettingsActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setOpen(false), 200);
  }, []);

  // Company initials for avatar fallback
  const avatarName = tenantName || userName;

  return (
    <div
      className="relative px-2 py-2"
      style={{ borderTop: "1px solid var(--color-border-default)" }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      {/* Trigger: avatar + first name. A real <button> (not a div) so the
          account menu — including Log out — is keyboard-focusable and not
          hover-only. Hover still opens it; click toggles; Escape closes. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onFocus={handleEnter}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center rounded-md transition-colors ${
          collapsed ? "h-8 w-8 justify-center mx-auto" : "h-8 w-full gap-2.5 px-2.5"
        }`}
        style={{ cursor: "pointer", background: "none", border: "none", textAlign: "left" }}
      >
        <Avatar src={avatarUrl} name={avatarName} size="sm" />
        {!collapsed && (
          <span
            className="flex-1 truncate text-[13px] font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {firstName}
          </span>
        )}
      </button>

      {/* Hover popover */}
      {open && (
        <div
          className="absolute z-50 min-w-[200px] rounded-lg py-1.5 shadow-lg"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
            bottom: "100%",
            left: collapsed ? "calc(100% + 8px)" : "8px",
            marginBottom: collapsed ? undefined : "4px",
            ...(collapsed ? { bottom: "0" } : {}),
          }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          {/* User info header */}
          <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
            <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{userName}</div>
            {userEmail && (
              <div className="truncate text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{userEmail}</div>
            )}
          </div>

          {/* Menu items */}
          <div className="py-1">
            {/* Settings */}
            <Link
              href="/settings"
              className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors"
              style={{ color: isSettingsActive ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Settings size={14} style={{ opacity: 0.6 }} />
              Settings
            </Link>

            {/* Dark mode */}
            <button
              onClick={onToggleTheme}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {theme === "light" ? <Moon size={14} style={{ opacity: 0.6 }} /> : <Sun size={14} style={{ opacity: 0.6 }} />}
              {theme === "light" ? "Dark mode" : "Light mode"}
            </button>

            {/* Contact the team */}
            <a
              href="mailto:support@elevay.dev"
              className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Mail size={14} style={{ opacity: 0.6 }} />
              Contact the team
            </a>
          </div>

          {/* Logout */}
          <div style={{ borderTop: "1px solid var(--color-border-default)" }} className="py-1">
            <button
              onClick={onSignOut}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <LogOut size={14} style={{ opacity: 0.6 }} />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ userName, userEmail, userInitials, userAvatarUrl, tenantName, recentChats, onSignOut }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Auto-collapse on small screens so the sidebar doesn't eat the viewport
  // on mobile (pre-launch audit: not responsive — full 240px rail squeezed
  // content to ~150px at 390px). Desktop users can still toggle manually.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setCollapsed(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const [customObjectTypes, setCustomObjectTypes] = useState<CustomObjectType[]>([]);
  const pathname = usePathname();
  const { theme, toggle: toggleTheme } = useTheme();
  const firstName = userName.split(" ")[0];

  useEffect(() => {
    fetch("/api/custom-objects")
      .then((r) => (r.ok ? r.json() : { objectTypes: [] }))
      .then((data) => setCustomObjectTypes(data.objectTypes || []))
      .catch((e) => console.warn("sidebar: custom-objects fetch failed", e));
  }, []);

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
      {/* Logo + User header — matches page header height */}
      <div
        className="flex shrink-0 items-center gap-2.5 px-3"
        style={{
          height: "var(--header-height)",
          borderBottom: "1px solid var(--color-border-default)",
        }}
      >
        {!collapsed ? (
          <>
            {/* Logo + text */}
            <div className="flex items-center gap-2">
              <img src="/logo-elevay.svg" alt="Elevay" className="h-6 w-6" />
              <span className="gradient-text text-[16px] font-bold tracking-tight">
                Elevay
              </span>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("elevay:command-palette"))}
              className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
              title="Search (⌘K)"
              aria-label="Search"
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Search size={14} />
            </button>
            <button
              onClick={() => setCollapsed(true)}
              className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
              style={{ color: "var(--color-text-tertiary)" }}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <ChevronsLeft size={14} />
            </button>
          </>
        ) : (
          <button
            onClick={() => setCollapsed(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors mx-auto"
            style={{ color: "var(--color-text-tertiary)" }}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <ChevronsRight size={14} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {/* Search button — first nav item when collapsed */}
        {collapsed && (
          <div className="mb-0.5">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("elevay:command-palette"))}
              className="group flex h-8 w-8 items-center justify-center rounded-md mx-auto transition-all duration-150"
              style={{ color: "var(--color-text-secondary)" }}
              title="Search (⌘K)"
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Search size={16} style={{ opacity: 0.6 }} />
            </button>
          </div>
        )}
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
              {/* Notifications nav item — right below "Up next" */}
              {sectionIdx === 0 && (
                <NotificationBell collapsed={collapsed} variant="nav" />
              )}
            </div>
          </div>
        ))}

        {/* Custom Objects section */}
        {customObjectTypes.length > 0 && (
          <div className="mt-4">
            {!collapsed && (
              <div
                className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Custom
              </div>
            )}
            {collapsed && (
              <div
                className="mx-2 mb-2 mt-1"
                style={{ borderTop: "1px solid var(--color-border-default)" }}
              />
            )}
            <div className="space-y-0.5">
              {customObjectTypes.map((ot) => {
                const OtIcon = CUSTOM_ICON_MAP[ot.icon] || Box;
                const href = `/objects/${ot.id}`;
                const active = isActive(href);
                return (
                  <Link
                    key={ot.id}
                    href={href}
                    className={`group flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-all duration-150 ${
                      collapsed ? "h-8 w-8 justify-center mx-auto" : "h-8 px-2.5"
                    }`}
                    style={{
                      color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                      background: active ? "var(--color-accent-soft)" : "transparent",
                      boxShadow: active && !collapsed
                        ? "inset 3px 0 0 0 var(--color-accent)"
                        : undefined,
                    }}
                    title={collapsed ? ot.name : undefined}
                  >
                    <OtIcon
                      size={16}
                      className="shrink-0"
                      style={{
                        color: active ? "var(--color-accent)" : undefined,
                        opacity: active ? 1 : 0.6,
                      }}
                    />
                    {!collapsed && <span className="truncate">{ot.name}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

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

      {/* Footer — user profile with hover menu */}
      <UserMenu
        firstName={firstName}
        userName={userName}
        userEmail={userEmail}
        avatarUrl={userAvatarUrl}
        tenantName={tenantName}
        collapsed={collapsed}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignOut={onSignOut}
        isSettingsActive={!!isActive("/settings")}
      />
    </aside>
  );
}
