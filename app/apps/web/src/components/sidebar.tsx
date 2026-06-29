"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useLocale } from "@/lib/i18n/locale";
import {
  Building2,
  CircleDot,
  Users,
  Calendar,
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
  Languages,
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
  Search,
  Bot,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "@/components/ui/theme-provider";
import { Avatar } from "@/components/ui/avatar";
import { BetaTag } from "@/components/ui/beta-tag";
import { isBetaRoute } from "@/lib/beta-routes";
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
  /** Versioned URL of the workspace logo (Settings → General). Renders in
   * the workspace slot at the TOP of the sidebar, next to the workspace
   * name; gradient initials when absent. */
  tenantLogoUrl?: string | null;
  recentChats: Array<{ id: string; title: string | null }>;
  onSignOut: () => void;
}

const navSections = [
  {
    items: [
      { label: "Up next", href: "/", icon: Clock },
    ],
  },
  // "AI" section (Knowledge + Skills) removed from nav for now — Knowledge is
  // an indirect grounding base and Skills are power-user agent workflows;
  // neither earns a top-level slot yet. Pages still exist by URL.
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
      // Deliverability removed from nav — folds into Campaigns. The page
      // (/deliverability) still exists by URL until that integration lands.
    ],
  },
  {
    label: "Activity",
    items: [
      { label: "Meetings", href: "/meetings", icon: Calendar },
      // Tasks (/tasks) and Insights (/insights) removed from nav 2026-06-08 —
      // not earning a top-level production slot yet. Both pages still exist by
      // URL. Reports likewise folds under Insights by URL.
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
  collapsed: boolean;
  theme: string;
  onToggleTheme: () => void;
  onSignOut: () => void;
  isSettingsActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { locale, setLocale } = useLocale();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setOpen(false), 200);
  }, []);

  // This bubble is the PERSON: their photo, else their initials. The
  // workspace identity (logo + name) lives at the top of the sidebar.
  const avatarName = userName;
  const avatarSrc = avatarUrl || null;

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
        <Avatar src={avatarSrc} name={avatarName} size="sm" />
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

            {/* Language — FR is the default; switch shows the base English version */}
            <button
              onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Languages size={14} style={{ opacity: 0.6 }} />
              {locale === "fr" ? "English" : "Français"}
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

export function Sidebar({ userName, userEmail, userInitials, userAvatarUrl, tenantName, tenantLogoUrl, recentChats, onSignOut }: SidebarProps) {
  const pathname = usePathname();

  // Sidebar collapse state.
  //
  // `userPref` is the explicit choice the user made (header chevrons or the
  // right-edge handle), persisted to localStorage so it survives reloads AND
  // navigations. `null` = "never chose" → fall back to the per-route default.
  // This fixes the old behaviour where an effect re-ran on every `pathname`
  // change and forced the rail back open: clicking a nav item while collapsed
  // would re-expand it. Now the manual choice sticks.
  const [userPref, setUserPref] = useState<boolean | null>(null);
  // Narrow viewport is a HARD override — a full-width rail squeezes content on
  // small screens, so it collapses regardless of preference.
  const [isNarrow, setIsNarrow] = useState(false);
  const [edgeHover, setEdgeHover] = useState(false);

  // Load the persisted preference once (post-hydration; the SSR default is
  // "expanded"/route-default, so there is no hydration mismatch).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("elevay:sidebar-collapsed");
      if (saved === "1") setUserPref(true);
      else if (saved === "0") setUserPref(false);
    } catch {
      /* storage blocked (private mode) — fall back to defaults */
    }
  }, []);

  // Track the narrow breakpoint independently of the user's preference.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Routes that own a full-width secondary rail default to a collapsed CRM
  // rail — two 240px sidebars side by side just squeeze content (worst on a
  // half-screen window). The inbox has its folder column; /settings has its
  // own settings sub-nav (settings-sidebar.tsx). This is only the DEFAULT —
  // it applies until the user expresses a choice (userPref wins thereafter).
  const routeDefaultCollapsed =
    !!pathname?.startsWith("/inbox") || !!pathname?.startsWith("/settings");
  const collapsed = isNarrow || (userPref !== null ? userPref : routeDefaultCollapsed);

  // Persist on every explicit toggle. Existing call sites — setCollapsed(true)
  // from the collapse chevron, setCollapsed(false) from the expand button —
  // keep working unchanged.
  const setCollapsed = useCallback((next: boolean) => {
    setUserPref(next);
    try {
      window.localStorage.setItem("elevay:sidebar-collapsed", next ? "1" : "0");
    } catch {
      /* storage blocked — preference holds for this session only */
    }
  }, []);
  const [customObjectTypes, setCustomObjectTypes] = useState<CustomObjectType[]>([]);
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
      className="relative flex flex-col transition-[width] duration-200 ease-in-out"
      style={{
        width: collapsed ? "52px" : "var(--sidebar-width)",
        minWidth: collapsed ? "52px" : "var(--sidebar-width)",
        background: "var(--color-bg-sidebar)",
        borderRight: "1px solid var(--color-border-default)",
      }}
    >
      {/* Workspace header — matches page header height */}
      <div
        className="flex shrink-0 items-center gap-2.5 px-3"
        style={{
          height: "var(--header-height)",
          borderBottom: "1px solid var(--color-border-default)",
        }}
      >
        {!collapsed ? (
          <>
            {/* Workspace identity — logo (or gradient initials) + name, the
                slot Slack/Notion give the workspace. The Elevay brand keeps
                sign-in, marketing, emails and the chat surfaces; it only
                renders here as a graceful fallback when the tenant is
                unknown (DB hiccup). */}
            {tenantName ? (
              <div className="flex min-w-0 items-center gap-2">
                <Avatar src={tenantLogoUrl} name={tenantName} size="sm" shape="square" />
                <span
                  className="truncate text-[14px] font-semibold tracking-tight"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {tenantName}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <img src="/logo-Elevay.svg?v=2" alt="Elevay" className="h-6 w-6" />
                <span className="gradient-text text-[16px] font-bold tracking-tight">
                  Elevay
                </span>
              </div>
            )}
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
                    {!collapsed && isBetaRoute(item.href) && <BetaTag className="ml-auto" />}
                  </Link>
                );
              })}
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
        collapsed={collapsed}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignOut={onSignOut}
        isSettingsActive={!!isActive("/settings")}
      />

      {/* Right-edge handle — click the divider to open/close the sidebar.
          Full-height target on the right border; the 1px line lifts to a 2px
          accent on hover so the affordance is discoverable. Toggles the same
          persisted state as the header chevrons. Sits in the rail's right
          padding gutter, so it never steals clicks from nav items. */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        onMouseEnter={() => setEdgeHover(true)}
        onMouseLeave={() => setEdgeHover(false)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute inset-y-0 right-0 z-20 flex w-1.5 cursor-pointer items-stretch justify-end"
        style={{ background: "transparent", border: "none", padding: 0 }}
      >
        <span
          aria-hidden
          className="h-full transition-all duration-150"
          style={{
            width: edgeHover ? "2px" : "1px",
            background: edgeHover ? "var(--color-accent)" : "transparent",
          }}
        />
      </button>
    </aside>
  );
}
