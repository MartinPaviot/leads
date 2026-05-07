import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Server-side guard for admin-only pages.
 * Call at the top of an async server page/layout. Redirects:
 *   - to /sign-in if no session
 *   - to /settings if signed-in but not admin
 *
 * Defense-in-depth: API endpoints exposed by the page must also call
 * `requireAdmin()` server-side — never trust the page guard alone.
 */
export async function adminOnlyOrRedirect(): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/sign-in");
  }
  const role = (session as unknown as { role?: string }).role;
  if (role !== "admin") {
    redirect("/settings");
  }
}

/**
 * Returns true if the current session is an admin.
 * Returns false if non-admin OR not signed in.
 * Use in server components/layouts to conditionally render admin-only UI.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  const role = (session as unknown as { role?: string }).role;
  return role === "admin";
}
