import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { chatThreads } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { Sidebar } from "@/components/sidebar";
import { ChatDock } from "@/components/chat/chat-dock";
import { PostHogIdentify } from "@/components/posthog-provider";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/ui/command-palette";
import { KeyboardShortcutsProvider } from "@/components/keyboard-shortcuts-provider";
import { FlagsProvider } from "@/components/flags-provider";
import { RoleProvider } from "@/components/role-provider";
import { NavigationProgress } from "@/components/ui/navigation-progress";
import { IdleLogout } from "@/components/idle-logout";
import { getFlagsForTenant } from "@/lib/experiments";
import { workspaceLogoUrl } from "@/lib/logo/workspace-logo";
import type { TenantSettings } from "@/lib/config/tenant-settings";
import { cookies } from "next/headers";
import { LocaleProvider } from "@/lib/i18n/locale";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/messages";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const initials = (session.user.name?.charAt(0) || "?").toUpperCase();

  // Default EN; the sidebar Language switch flips to FR and persists the choice
  // to this cookie. An explicit cookie (either language) wins over the default.
  const localeCookie = (await cookies()).get("locale")?.value;
  const initialLocale: Locale =
    localeCookie === "en" || localeCookie === "fr" ? localeCookie : DEFAULT_LOCALE;

  let recentChats: Array<{ id: string; title: string | null }> = [];
  let userAvatarUrl: string | null = null;
  let tenantName: string | null = null;
  let tenantLogoUrl: string | null = null;
  let userRole = "member";
  let flags: Awaited<ReturnType<typeof getFlagsForTenant>> = {} as any;
  try {
    const { users, tenants } = await import("@/db/schema");
    const [appUser] = await db
      .select({ id: users.id, avatarUrl: users.avatarUrl, tenantId: users.tenantId, role: users.role })
      .from(users)
      .where(eq(users.clerkId, session.user.id!))
      .limit(1);

    if (appUser) {
      userAvatarUrl = appUser.avatarUrl;
      userRole = appUser.role || "member";
      recentChats = await db
        .select({ id: chatThreads.id, title: chatThreads.title })
        .from(chatThreads)
        .where(eq(chatThreads.userId, appUser.id))
        .orderBy(desc(chatThreads.updatedAt))
        .limit(5);

      const [tenant] = await db
        .select({ name: tenants.name, settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, appUser.tenantId))
        .limit(1);
      if (tenant) {
        tenantName = tenant.name;
        // Versioned URL only — the logo bytes stay behind the API route,
        // never inlined into the SSR payload.
        tenantLogoUrl = workspaceLogoUrl((tenant.settings || {}) as TenantSettings);
      }

      flags = await getFlagsForTenant(appUser.tenantId);
    }
  } catch {
    // DB not available
  }

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/sign-in" });
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <FlagsProvider flags={flags}>
          <RoleProvider role={userRole}>
          <LocaleProvider initialLocale={initialLocale}>
          <NavigationProgress />
          <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-bg-page)" }}>
            <Sidebar
              userName={session.user.name || "User"}
              userEmail={session.user.email || undefined}
              userInitials={initials}
              userAvatarUrl={userAvatarUrl}
              tenantName={tenantName}
              tenantLogoUrl={tenantLogoUrl}
              recentChats={recentChats}
              onSignOut={handleSignOut}
            />

            {/* Main content */}
            <main className="flex flex-1 flex-col overflow-hidden" style={{ background: "var(--color-bg-page)" }}>
              {/* min-h-0 lets this flex child shrink below its content so it
                  actually scrolls — without it, min-height:auto makes it grow
                  and the parent's overflow-hidden clips the page (no scroll on
                  any long page, e.g. the TAM list). This is the root scroll
                  container for every dashboard page. */}
              <div className="min-h-0 flex-1 overflow-auto">{children}</div>
              <PostHogIdentify
                userId={session.user.id}
                traits={{
                  email: session.user.email ?? undefined,
                  name: session.user.name ?? undefined,
                  tenantName: tenantName ?? undefined,
                }}
              />
            </main>

            <CommandPalette />
            <ChatDock />
            <KeyboardShortcutsProvider />
            <IdleLogout />
          </div>
          </LocaleProvider>
          </RoleProvider>
        </FlagsProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
