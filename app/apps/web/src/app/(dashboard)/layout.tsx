import { auth, signOut } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { chatThreads } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  Building2,
  CircleDot,
  Users,
  Mail,
  Shield,
  CheckSquare,
  Calendar,
  FileText,
  MessageSquare,
  Settings,
  Plus,
  Search,
  Clock,
  Zap,
} from "lucide-react";
import { PersistentChatBar } from "@/components/persistent-chat-bar";
import { PostHogPageTracker } from "@/components/posthog-provider";

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
    ],
  },
  {
    label: "Chats",
    items: [{ label: "New chat", href: "/chat", icon: Plus }],
    dynamic: true,
  },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const initials = (session.user.name?.charAt(0) || "?").toUpperCase();

  let recentChats: Array<{ id: string; title: string | null }> = [];
  try {
    recentChats = await db
      .select({ id: chatThreads.id, title: chatThreads.title })
      .from(chatThreads)
      .where(eq(chatThreads.userId, session.user.id!))
      .orderBy(desc(chatThreads.updatedAt))
      .limit(5);
  } catch {
    // DB not available
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className="flex flex-col"
        style={{
          width: "var(--sidebar-width)",
          minWidth: "var(--sidebar-width)",
          borderRight: "0.5px solid var(--color-border-default)",
        }}
      >
        {/* User header */}
        <div
          className="flex items-center gap-2 px-3 py-2.5"
          style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
        >
          <div
            className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold text-white"
            style={{ background: "var(--color-accent)" }}
          >
            {initials}
          </div>
          <span
            className="flex-1 truncate text-[13px] font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            {session.user.name}
          </span>
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--color-text-tertiary)" }}
            title="Search"
          >
            <Search size={14} />
          </button>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/sign-in" });
            }}
          >
            <button
              type="submit"
              className="text-[11px] transition-colors hover:opacity-80"
              style={{ color: "var(--color-text-muted)" }}
            >
              Log out
            </button>
          </form>
        </div>

        {/* Navigation */}
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {navSections.map((section, sectionIdx) => (
            <div key={section.label || sectionIdx} className={sectionIdx > 0 ? "mt-4" : ""}>
              {section.label && (
                <div
                  className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex h-8 items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors"
                      style={{
                        color: "var(--color-text-secondary)",
                        // Active state handled by client-side script or CSS :has
                      }}
                    >
                      <Icon size={16} className="shrink-0 opacity-60 group-hover:opacity-80" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
              {/* Chat thread history */}
              {section.label === "Chats" && recentChats.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {recentChats.map((thread) => (
                    <Link
                      key={thread.id}
                      href={`/chat?thread=${thread.id}`}
                      className="group flex h-7 items-center gap-2 rounded-md px-2 text-[12px] transition-colors"
                      style={{ color: "var(--color-text-tertiary)" }}
                      title={thread.title || "Untitled chat"}
                    >
                      <MessageSquare size={14} className="shrink-0 opacity-50" />
                      <span className="truncate">
                        {thread.title || "Untitled chat"}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Settings footer */}
        <div
          className="px-2 py-2"
          style={{ borderTop: "0.5px solid var(--color-border-default)" }}
        >
          <Link
            href="/settings"
            className="group flex h-8 items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <Settings size={16} className="shrink-0 opacity-60 group-hover:opacity-80" />
            <span>Settings</span>
          </Link>
          <div className="mt-1 flex gap-3 px-2">
            <Link href="/terms" className="text-[10px] hover:underline" style={{ color: "var(--color-text-muted)" }}>Terms</Link>
            <Link href="/privacy" className="text-[10px] hover:underline" style={{ color: "var(--color-text-muted)" }}>Privacy</Link>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">{children}</div>
        <PersistentChatBar />
        <PostHogPageTracker userId={session.user.id} />
      </main>

      {/* Sidebar nav hover/active styles */}
      <style>{`
        aside a:hover {
          background: var(--color-bg-muted) !important;
          color: var(--color-text-primary) !important;
        }
        aside a[data-active="true"],
        aside a:has(+ [data-active]) {
          background: var(--color-accent-soft) !important;
          color: var(--color-text-primary) !important;
        }
      `}</style>
    </div>
  );
}
