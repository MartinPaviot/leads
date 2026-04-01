"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const settingsNav = [
  {
    label: "Account",
    items: [
      { label: "Profile", href: "/settings" },
      { label: "Agent", href: "/settings/agent" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "General", href: "/settings/workspace" },
      { label: "Members", href: "/settings/members" },
      { label: "Knowledge", href: "/settings/knowledge" },
      { label: "Opportunity Stages", href: "/settings/stages" },
      { label: "Notifications", href: "/settings/notifications" },
    ],
  },
  {
    label: "Outbound",
    items: [
      { label: "Mailboxes", href: "/settings/mailboxes" },
    ],
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full">
      <aside className="w-[220px] flex-shrink-0 border-r border-[#1e1f2a] bg-[#12131a] p-4">
        <Link
          href="/"
          className="mb-4 flex items-center gap-2 text-sm text-[#6366f1] hover:text-[#5558e6]"
        >
          <span>&larr;</span> Settings
        </Link>

        {settingsNav.map((section) => (
          <div key={section.label} className="mb-4">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[#5a5a70]">
              {section.label}
            </div>
            {section.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/settings" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-lg px-2 py-1.5 text-sm ${
                    isActive
                      ? "bg-[rgba(99,102,241,0.12)] text-[#e8e8ed]"
                      : "text-[#8b8ba0] hover:bg-[rgba(99,102,241,0.06)] hover:text-[#e8e8ed]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl p-8">{children}</div>
      </main>
    </div>
  );
}
