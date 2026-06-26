"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
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
  ShieldCheck,
  Search,
  Menu,
  X,
  Layers,
  DollarSign,
  Radio,
  Inbox,
  Package,
  Send,
  PenLine,
  AtSign,
  Gauge,
  BadgeCheck,
  Brain,
} from "lucide-react";
import { BILLING_PAGE_ENABLED } from "@/lib/billing/page-visibility";
import { EVALS_PAGE_ENABLED, MCP_PAGE_ENABLED } from "@/lib/settings/admin-tools-visibility";

interface NavItem {
  label: string;
  href: string;
  icon: typeof User;
  /** When `false`, the tab is hidden from the sidebar but the page
   *  remains accessible via direct URL. Used for power-user features
   *  that would show empty states and add noise for founders in
   *  early-stage sales. Defaults to `true` when omitted. */
  ready?: boolean;
}

interface NavSection {
  label: string;
  adminOnly?: boolean;
  items: NavItem[];
}

// ── Settings IA (2026-06-26 reorg) ─────────────────────────────────────────
// Six topical sections in a setup-then-operate order: who you are → the AI's
// brain → who it targets → how it reaches out → org admin → developer tooling.
// Replaces the old flat 13-item "Workspace" dumping ground. Canonical pages are
// surfaced (incl. previously-orphaned /autonomy, /agent-memory, /inbox-ai-profile);
// dead redirect routes (/agent, /icp-profiles, /mailboxes) and soon-to-be-merged
// inbox-* duplicates stay reachable by URL but are kept out of the nav. Phase-2
// page merges (3 autonomy → 1, 3 voice → 1, 2 notifications → 1) collapse the
// remaining redundancy; see _reports for the plan.
const settingsNav: NavSection[] = [
  {
    label: "Account",
    items: [
      { label: "Profile", href: "/settings", icon: User },
      { label: "Security", href: "/settings/security", icon: Lock },
      { label: "Notifications", href: "/settings/notifications", icon: Bell },
    ],
  },
  {
    label: "Your AI",
    items: [
      { label: "Autonomy", href: "/settings/autonomy", icon: Gauge },
      // Phase 2: the approval-mode page folds into Autonomy. Until then it is
      // a distinct control (review-each / batch-daily / auto-high-confidence).
      { label: "Approval mode", href: "/settings/guardrails", icon: BadgeCheck },
      { label: "Voice & Writing", href: "/settings/writing-style", icon: PenLine },
      { label: "Knowledge", href: "/settings/knowledge", icon: BookOpen },
      { label: "Product", href: "/settings/product", icon: Package },
      { label: "Agent memory", href: "/settings/agent-memory", icon: Brain },
      { label: "AI data handling", href: "/settings/inbox-ai-profile", icon: ShieldCheck },
      // Hidden until promoted (ready:false). Page stays reachable by URL.
      { label: "Sales Plays", href: "/settings/plays", icon: Layers, ready: false },
    ],
  },
  {
    label: "Targeting & Pipeline",
    items: [
      { label: "ICP", href: "/settings/icp", icon: Target },
      { label: "Opportunity stages", href: "/settings/stages", icon: GitBranch },
      { label: "Capture approvals", href: "/settings/capture-approvals", icon: Inbox },
      { label: "Custom fields", href: "/settings/data-model", icon: Database },
      // Hidden until promoted (ready:false). Pages stay reachable by URL.
      { label: "Custom signals", href: "/settings/signals", icon: Radio, ready: false },
      { label: "Workflows", href: "/settings/workflows", icon: Workflow, ready: false },
      { label: "Custom objects", href: "/settings/objects", icon: Box, ready: false },
    ],
  },
  {
    label: "Channels",
    items: [
      { label: "Mail & Calendar", href: "/settings/mail-calendar", icon: Mail },
      { label: "Sending channels", href: "/settings/sending-infrastructure", icon: Send },
      { label: "Mailbox identity", href: "/settings/mailbox-identity", icon: AtSign },
      // Hidden until promoted (ready:false). Page stays reachable by URL.
      { label: "Recording", href: "/settings/recording", icon: Video, ready: false },
    ],
  },
  {
    label: "Workspace",
    adminOnly: true,
    items: [
      { label: "General", href: "/settings/workspace", icon: Building },
      { label: "Members", href: "/settings/members", icon: Users },
      { label: "Privacy & data", href: "/settings/privacy", icon: Shield },
      { label: "AI budget", href: "/settings/llm-budget", icon: DollarSign },
      // Dev-only: the billing page 404s in production builds (page-visibility.ts).
      { label: "Billing", href: "/settings/billing", icon: CreditCard, ready: BILLING_PAGE_ENABLED },
    ],
  },
  {
    label: "Developer",
    adminOnly: true,
    items: [
      // Dev-only: internal tooling, 404s in production builds
      // (admin-tools-visibility.ts).
      { label: "Evaluations", href: "/settings/evals", icon: FlaskConical, ready: EVALS_PAGE_ENABLED },
      { label: "LLM observability", href: "/settings/llm-evals", icon: Activity },
      { label: "MCP integration", href: "/settings/mcp", icon: Plug, ready: MCP_PAGE_ENABLED },
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
  // Narrow / zoomed viewports (founder runs half-screen + 200% zoom): the
  // 240px nav rail + content don't both fit, so below the container breakpoint
  // the nav becomes a slide-in drawer and content goes full-width.
  const [navOpen, setNavOpen] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);
  // While the drawer is open: Escape closes it, and focus moves into it (the
  // filter input) so keyboard / screen-reader users have an entry point.
  useEffect(() => {
    if (!navOpen) return;
    filterInputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNavOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);
  const visibleSections = settingsNav
    .filter((s) => !s.adminOnly || isAdmin)
    .map((s) => {
      // Filter out items that aren't ready yet (ready defaults to true)
      let items = s.items.filter((i) => i.ready !== false);
      if (filter.trim()) {
        const q = filter.trim().toLowerCase();
        items = items.filter((i) => i.label.toLowerCase().includes(q));
      }
      return { ...s, items };
    })
    .filter((s) => s.items.length > 0);

  return (
    <div className="@container relative flex h-full min-h-0">
      {/* Narrow: tap the backdrop to dismiss the nav drawer. */}
      {navOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close settings menu"
          onClick={() => setNavOpen(false)}
          className="absolute inset-0 z-20 bg-black/30 @min-[680px]:hidden"
        />
      )}
      {/* Settings nav — an inline rail at ≥680px of the shell's OWN width; a
          slide-in drawer below that, so the content keeps the full width
          (founder runs half-screen + 200% zoom ≈ 400px shell). */}
      <aside
        id="settings-nav-drawer"
        className={`absolute inset-y-0 left-0 z-30 flex w-[var(--sidebar-width)] flex-shrink-0 flex-col overflow-y-auto px-2 py-3 transition-transform duration-200 @min-[680px]:static @min-[680px]:z-auto @min-[680px]:shadow-none @min-[680px]:transition-none ${navOpen ? "translate-x-0 shadow-xl" : "-translate-x-full @min-[680px]:translate-x-0"}`}
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
            ref={filterInputRef}
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
                    onClick={() => setNavOpen(false)}
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

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {/* Narrow-only bar to open the nav drawer (the rail is hidden). */}
        <div
          className="flex shrink-0 items-center gap-2 border-b px-4 py-2 @min-[680px]:hidden"
          style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
        >
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open settings menu"
            aria-expanded={navOpen}
            aria-controls="settings-nav-drawer"
            className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-medium transition-colors hover:bg-[var(--color-bg-hover)]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <Menu size={15} /> Settings menu
          </button>
        </div>
        <div className="mx-auto w-full max-w-2xl px-4 py-10 @min-[680px]:px-0">{children}</div>
      </main>
    </div>
  );
}
