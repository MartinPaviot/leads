import { expect, test } from "@playwright/test";
import { cleanupTenant, seedAndLogin, type SeededUser } from "./helpers";

/**
 * BUGFIX-06 T9 — offline resilience.
 *
 * Asserts that the dashboard doesn't white-screen when the network
 * drops mid-session: the React app stays mounted, no uncaught error
 * boundary renders, and the page recovers when the network returns.
 */
test.describe("offline resilience", () => {
  let user: SeededUser | null = null;

  test.afterEach(async ({ request }) => {
    if (user) {
      await cleanupTenant(request, user.tenantId, "e2e-offline-");
      user = null;
    }
  });

  // Flaky on Windows: /home polls several endpoints which keeps the
  // network busy long past `domcontentloaded`, and our nav selector
  // doesn't always match while the first render is still streaming
  // in. Needs a deterministic "app shell is ready" signal before
  // flipping the offline switch.
  test.fixme("home page survives going offline and back", async ({ page, request, context }) => {
    user = await seedAndLogin(request, page, {
      tenantSlug: "e2e-offline",
      role: "admin",
    });

    await page.goto("/home", { waitUntil: "domcontentloaded" });
    // /home keeps a few fetches warm (campaign status polling, etc)
    // so `networkidle` never resolves. `domcontentloaded` is enough
    // for the shell to mount.
    await page.waitForSelector("main, [role='main'], nav", { timeout: 15_000 });

    // Go offline.
    await context.setOffline(true);

    // Force a navigation / refetch cycle. /contacts triggers fetch
    // /api/contacts which will fail. Expect no crash.
    const navPromise = page.goto("/contacts", { waitUntil: "domcontentloaded" });
    // It's fine if the nav eventually errors — we just want the app shell
    // to still be mounted.
    await navPromise.catch(() => undefined);

    // The sidebar nav (part of the app shell layout) should still be
    // visible — it's rendered server-side and doesn't depend on the
    // failing fetch.
    const sidebarVisible = await page
      .locator('nav, [role="navigation"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(sidebarVisible, "sidebar still renders while offline").toBeTruthy();

    // Reset: go back online, reload, expect normal page.
    await context.setOffline(false);
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    await expect(page.locator('nav, [role="navigation"]').first()).toBeVisible();
  });
});
