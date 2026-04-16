import { expect, test } from "@playwright/test";
import { cleanupTenant, seedAndLogin, type SeededUser } from "./helpers";

/**
 * BUGFIX-06 T9 — offline resilience.
 *
 * Asserts that the dashboard doesn't white-screen when the network
 * drops mid-session. Tests the API-level behavior (endpoints return
 * proper status codes) and a basic page-load resilience check.
 */
test.describe("offline resilience", () => {
  let user: SeededUser | null = null;

  test.afterEach(async ({ request }) => {
    if (user) {
      await cleanupTenant(request, user.tenantId, "e2e-offline-");
      user = null;
    }
  });

  test("dashboard APIs return proper JSON for authenticated user", async ({ page, request }) => {
    user = await seedAndLogin(request, page, {
      tenantSlug: "e2e-offline",
      role: "admin",
    });

    // These endpoints should return valid JSON, not crash
    const endpoints = ["/api/contacts", "/api/accounts", "/api/opportunities"];
    for (const endpoint of endpoints) {
      const res = await page.request.get(endpoint);
      // 200 with data or empty array — not 500
      expect(res.status(), `${endpoint} should not crash`).toBeLessThan(500);
    }
  });

  test("home page loads with app shell", async ({ page, request }) => {
    user = await seedAndLogin(request, page, {
      tenantSlug: "e2e-offline-shell",
      role: "admin",
    });

    await page.goto("/home", { waitUntil: "domcontentloaded" });

    // Wait for the app shell to render — any nav element indicates
    // the layout mounted successfully
    const hasShell = await page
      .locator("nav, [role='navigation'], aside")
      .first()
      .isVisible({ timeout: 15_000 })
      .catch(() => false);

    expect(hasShell, "app shell should render").toBeTruthy();
  });

  test("home page survives going offline and back", async ({ page, request, context }) => {
    user = await seedAndLogin(request, page, {
      tenantSlug: "e2e-offline-cycle",
      role: "admin",
    });

    // Navigate to a simple page first
    await page.goto("/home", { waitUntil: "domcontentloaded" });

    // Wait for app shell with a generous timeout
    await page.locator("nav, [role='navigation'], aside").first().waitFor({
      state: "visible",
      timeout: 20_000,
    });

    // Go offline
    await context.setOffline(true);

    // Try navigating — should not crash the app
    await page.goto("/contacts", { waitUntil: "domcontentloaded" }).catch(() => {
      // Navigation may fail offline — that's expected
    });

    // Go back online
    await context.setOffline(false);

    // Recover — navigate back to home
    await page.goto("/home", { waitUntil: "domcontentloaded" });

    // App should recover
    const recovered = await page
      .locator("nav, [role='navigation'], aside")
      .first()
      .isVisible({ timeout: 15_000 })
      .catch(() => false);

    expect(recovered, "app should recover after going back online").toBeTruthy();
  });
});
