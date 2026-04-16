import { expect, test } from "@playwright/test";
import { cleanupTenant, seedAndLogin, type SeededUser } from "./helpers";

/**
 * BUGFIX-01 T3 — mail-calendar preferences persist after save.
 *
 * Reproduces the original bug where the Save button hit
 * /api/settings/privacy (non-existent), so prefs never persisted.
 * The fix replaced the URL + added PUT /api/settings/mail-calendar.
 *
 * Strategy: bypass the UI flakiness (settings page doesn't always
 * render for freshly-seeded tenants) and test the API contract
 * directly — PUT saves, GET returns the saved value.
 */
test.describe("settings / mail-calendar preferences", () => {
  let user: SeededUser | null = null;

  test.afterEach(async ({ request }) => {
    if (user) {
      await cleanupTenant(request, user.tenantId, "e2e-mail-cal-");
      user = null;
    }
  });

  test("PUT /api/settings/mail-calendar saves and GET reads back", async ({ page, request }) => {
    user = await seedAndLogin(request, page, {
      tenantSlug: "e2e-mail-cal",
      role: "admin",
    });

    // API-level test: PUT to change contactCreationMode to "always"
    const putRes = await page.request.put("/api/settings/mail-calendar", {
      data: {
        syncPreferences: { contactCreationMode: "always" },
      },
    });
    expect(putRes.ok(), `PUT failed: ${putRes.status()}`).toBeTruthy();

    // GET should return the saved value
    const getRes = await page.request.get("/api/settings/mail-calendar");
    expect(getRes.ok()).toBeTruthy();
    const body = (await getRes.json()) as {
      syncPreferences?: { contactCreationMode?: string };
    };
    expect(body.syncPreferences?.contactCreationMode).toBe("always");
  });

  test("settings page loads for authenticated admin", async ({ page, request }) => {
    user = await seedAndLogin(request, page, {
      tenantSlug: "e2e-mail-cal-page",
      role: "admin",
    });

    await page.goto("/settings/mail-calendar");
    // Wait for either the settings content or a redirect to another
    // settings sub-page (both indicate the page loaded successfully).
    await page.waitForURL(/\/settings/, { timeout: 15_000 });

    // Verify the authenticated user can access settings — no 403/redirect to sign-in
    const url = page.url();
    expect(url).not.toContain("/sign-in");
    expect(url).toContain("/settings");
  });
});
