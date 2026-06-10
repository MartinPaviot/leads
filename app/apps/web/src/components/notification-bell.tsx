"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bell,
  AlertTriangle,
  Trophy,
  XCircle,
  RefreshCw,
  Reply,
  ClipboardCheck,
  UserPlus,
  Calendar,
  UserCheck,
  Info,
  CheckCheck,
} from "lucide-react";

/* ── Types ── */

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface NotificationBellProps {
  collapsed?: boolean;
  /** Render as a sidebar nav item instead of a small icon button */
  variant?: "icon" | "nav";
}

/* ── Type → icon mapping ── */

const typeIconMap: Record<string, { icon: typeof Bell; color: string }> = {
  deal_risk: { icon: AlertTriangle, color: "var(--color-warning)" },
  deal_won: { icon: Trophy, color: "var(--color-success)" },
  deal_lost: { icon: XCircle, color: "var(--color-error)" },
  enrichment_done: { icon: RefreshCw, color: "var(--color-accent)" },
  sequence_reply: { icon: Reply, color: "var(--color-info)" },
  task_due: { icon: ClipboardCheck, color: "var(--color-warning)" },
  task_assigned: { icon: UserCheck, color: "var(--color-accent)" },
  meeting_upcoming: { icon: Calendar, color: "var(--color-info)" },
  new_contact: { icon: UserPlus, color: "var(--color-success)" },
  system: { icon: Info, color: "var(--color-text-tertiary)" },
};

/* ── Time-ago helper ── */

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/* ── Component ── */

export function NotificationBell({ collapsed, variant = "icon" }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* Fetch notifications */
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  /* Fetch on mount + poll every 30s */
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  /* Refetch when opening */
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  /* Mark all as read */
  async function handleMarkAllRead() {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
    } catch {
      // silently fail
    }
  }

  /* Mark single as read */
  async function handleMarkRead(id: string) {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", notificationIds: [id] }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // silently fail
    }
  }

  /* Render icon for notification type */
  function renderTypeIcon(type: string) {
    const entry = typeIconMap[type] || { icon: Bell, color: "var(--color-text-tertiary)" };
    const Icon = entry.icon;
    return (
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        style={{ background: `color-mix(in srgb, ${entry.color} 12%, transparent)` }}
      >
        <Icon size={14} style={{ color: entry.color }} />
      </div>
    );
  }

  const isNav = variant === "nav";

  return (
    <div ref={ref} className={isNav ? "relative" : "relative inline-flex"}>
      {/* Bell trigger */}
      {isNav ? (
        <button
          onClick={() => setOpen(!open)}
          className={`group flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-all duration-150 ${
            collapsed ? "h-8 w-8 justify-center mx-auto" : "h-8 px-2.5 w-full"
          }`}
          style={{
            color: "var(--color-text-secondary)",
            background: open ? "var(--color-accent-soft)" : "transparent",
          }}
          onMouseEnter={(e) => {
            if (!open) e.currentTarget.style.background = "var(--color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            if (!open) e.currentTarget.style.background = "transparent";
          }}
          title={collapsed ? "Notifications" : undefined}
        >
          <div className="relative shrink-0">
            <Bell size={16} style={{ opacity: open ? 1 : 0.6 }} />
            {unreadCount > 0 && (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white"
                style={{ background: "var(--color-error)" }}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          {!collapsed && <span className="truncate">Notifications</span>}
        </button>
      ) : (
        <button
          onClick={() => setOpen(!open)}
          className="relative flex h-6 w-6 items-center justify-center rounded-md transition-colors"
          style={{ color: "var(--color-text-tertiary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          title="Notifications"
        >
          <Bell size={14} />
          {unreadCount > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white"
              style={{ background: "var(--color-error)" }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Dropdown panel */}
      {open && (
        <div
          className={`absolute z-50 w-[340px] rounded-lg ${isNav ? "left-full top-0 ml-2" : "left-0 top-full mt-2"}`}
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
            boxShadow: "var(--shadow-floating)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2.5"
            style={{ borderBottom: "1px solid var(--color-border-default)" }}
          >
            <span
              className="text-[13px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Notifications
              {unreadCount > 0 && (
                <span
                  className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                  style={{ background: "var(--color-error)" }}
                >
                  {unreadCount}
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[11px] font-medium transition-colors hover:opacity-80"
                style={{ color: "var(--color-accent)" }}
              >
                <CheckCheck size={12} />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-[360px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div
                className="px-3 py-8 text-center text-[12px]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 px-3 py-8"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                <Bell size={24} style={{ opacity: 0.3 }} />
                <span className="text-[12px]">No notifications yet</span>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) handleMarkRead(n.id);
                  }}
                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors"
                  style={{
                    background: n.read ? "transparent" : "var(--color-accent-muted)",
                    borderBottom: "1px solid var(--color-border-default)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--color-bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = n.read
                      ? "transparent"
                      : "var(--color-accent-muted)";
                  }}
                >
                  {renderTypeIcon(n.type)}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="truncate text-[12px] font-semibold"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {n.title}
                      </span>
                      {!n.read && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: "var(--color-accent)" }}
                        />
                      )}
                    </div>
                    <p
                      className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {n.body}
                    </p>
                    <span
                      className="mt-1 block text-[10px]"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {timeAgo(n.createdAt)}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
