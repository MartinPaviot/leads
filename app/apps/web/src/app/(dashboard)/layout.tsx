import { auth, signOut } from "@/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { chatThreads } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

const navSections = [
  {
    label: "Records",
    items: [
      { label: "Accounts", href: "/accounts" },
      { label: "Opportunities", href: "/opportunities" },
      { label: "Contacts", href: "/contacts" },
    ],
  },
  {
    label: "Outreach",
    items: [
      { label: "Sequences", href: "/sequences" },
      { label: "Deliverability", href: "/deliverability" },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Tasks", href: "/tasks" },
      { label: "Meetings", href: "/meetings" },
      { label: "Notes", href: "/notes" },
    ],
  },
  {
    label: "Chats",
    items: [{ label: "+ New chat", href: "/chat" }],
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

  // G19: Load recent chat threads for sidebar
  let recentChats: Array<{ id: string; title: string | null }> = [];
  try {
    recentChats = await db
      .select({ id: chatThreads.id, title: chatThreads.title })
      .from(chatThreads)
      .where(eq(chatThreads.userId, session.user.id!))
      .orderBy(desc(chatThreads.updatedAt))
      .limit(5);
  } catch {
    // DB not available or table doesn't exist yet
  }

  return (
    <div className="flex h-screen">
      <aside className="flex w-[220px] flex-col border-r border-[#1e1f2a] bg-[#12131a]">
        <div className="flex items-center gap-2 border-b border-[#1e1f2a] px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#6366f1] text-xs font-bold text-white">
            {initials}
          </div>
          <span className="flex-1 truncate text-sm font-medium">
            {session.user.name}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/sign-in" });
            }}
          >
            <button
              type="submit"
              className="text-xs text-[#5a5a70] hover:text-[#8b8ba0]"
            >
              Log out
            </button>
          </form>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#8b8ba0] hover:bg-[rgba(99,102,241,0.12)] hover:text-[#e8e8ed]"
          >
            Up next
          </Link>

          {navSections.map((section) => (
            <div key={section.label}>
              <div className="mb-1 mt-4 px-2 text-[11px] font-medium uppercase tracking-wider text-[#5a5a70]">
                {section.label}
              </div>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#8b8ba0] hover:bg-[rgba(99,102,241,0.12)] hover:text-[#e8e8ed]"
                >
                  {item.label}
                </Link>
              ))}
              {/* G19: Chat history in sidebar */}
              {section.label === "Chats" && recentChats.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {recentChats.map((thread) => (
                    <Link
                      key={thread.id}
                      href={`/chat?thread=${thread.id}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-[#5a5a70] hover:bg-[rgba(99,102,241,0.12)] hover:text-[#8b8ba0] truncate"
                      title={thread.title || "Untitled chat"}
                    >
                      <span className="truncate">{thread.title || "Untitled chat"}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="border-t border-[#1e1f2a] px-2 py-3">
          <Link
            href="/settings"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#8b8ba0] hover:bg-[rgba(99,102,241,0.12)] hover:text-[#e8e8ed]"
          >
            Settings
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
