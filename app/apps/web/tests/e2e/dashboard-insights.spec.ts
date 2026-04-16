import { expect, test } from "@playwright/test";
import { cleanupTenant, seedAndLogin, type SeededUser } from "./helpers";

/**
 * E2E tests for the Insights dashboard (C6) and dashboard API endpoints.
 *
 * Tests:
 * 1. Dashboard API endpoints return valid JSON with correct shapes
 * 2. /insights page renders pipeline metrics, alerts, and deal briefs
 * 3. Unauthenticated requests get 401
 */
test.describe("Dashboard & Insights (C6)", () => {
  let seeded: SeededUser;

  test.beforeEach(async ({ page, request }) => {
    seeded = await seedAndLogin(request, page, {
      tenantSlug: "e2e-dash",
      role: "admin",
    });
  });

  test.afterEach(async ({ request }) => {
    await cleanupTenant(request, seeded.tenantId, "e2e-dash");
  });

  test("GET /api/dashboard/pipeline returns valid pipeline data", async ({ page }) => {
    const res = await page.request.get("/api/dashboard/pipeline?period=30");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("stages");
    expect(body).toHaveProperty("totals");
    expect(body).toHaveProperty("velocity");
    expect(body).toHaveProperty("risks");
    expect(Array.isArray(body.stages)).toBe(true);
    expect(typeof body.totals.openDeals).toBe("number");
    expect(typeof body.totals.totalValue).toBe("number");
    expect(typeof body.totals.weightedValue).toBe("number");
  });

  test("GET /api/dashboard/activity returns valid activity data", async ({ page }) => {
    const res = await page.request.get("/api/dashboard/activity?period=7");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("volumeByType");
    expect(body).toHaveProperty("feed");
    expect(body).toHaveProperty("totalActivities");
    expect(Array.isArray(body.volumeByType)).toBe(true);
    expect(Array.isArray(body.feed)).toBe(true);
  });

  test("GET /api/dashboard/alerts returns valid alert data", async ({ page }) => {
    const res = await page.request.get("/api/dashboard/alerts");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("totalAlerts");
    expect(body).toHaveProperty("bySeverity");
    expect(body).toHaveProperty("alerts");
    expect(typeof body.totalAlerts).toBe("number");
    expect(typeof body.bySeverity.critical).toBe("number");
    expect(typeof body.bySeverity.high).toBe("number");
    expect(Array.isArray(body.alerts)).toBe(true);
  });

  test("GET /api/dashboard/performance returns valid performance data", async ({ page }) => {
    const res = await page.request.get("/api/dashboard/performance?periods=4");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("snapshots");
    expect(body).toHaveProperty("trends");
    expect(Array.isArray(body.snapshots)).toBe(true);
    expect(Array.isArray(body.trends)).toBe(true);
  });

  test("/insights page renders without crash", async ({ page }) => {
    await page.goto("/insights");
    await page.waitForLoadState("networkidle");

    // Page should render the Pipeline header
    await expect(page.locator("text=Pipeline")).toBeVisible({ timeout: 15_000 });

    // Should show at least the 4 metric cards (Open Deals, Total Value, etc.)
    const metricLabels = ["Open Deals", "Total Value", "Weighted", "Win Rate"];
    for (const label of metricLabels) {
      await expect(page.locator(`text=${label}`)).toBeVisible();
    }
  });

  test("/insights page is accessible from sidebar", async ({ page }) => {
    await page.goto("/home");
    await page.waitForLoadState("networkidle");

    // Click Insights in sidebar
    const insightsLink = page.locator('a[href="/insights"]');
    await expect(insightsLink).toBeVisible({ timeout: 10_000 });
    await insightsLink.click();

    // Should navigate to /insights
    await page.waitForURL("**/insights");
    await expect(page.locator("text=Pipeline")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Dashboard API auth", () => {
  test("unauthenticated requests get 401", async ({ request }) => {
    const endpoints = [
      "/api/dashboard/pipeline",
      "/api/dashboard/activity",
      "/api/dashboard/alerts",
      "/api/dashboard/performance",
      "/api/dashboard/briefs",
    ];

    for (const endpoint of endpoints) {
      const res = await request.get(endpoint);
      expect(res.status(), `${endpoint} should be 401 for unauthenticated`).toBe(401);
    }
  });
});
