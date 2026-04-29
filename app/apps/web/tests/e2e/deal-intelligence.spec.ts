import { test, expect } from "@playwright/test";
import { seedUser, cleanupTenant, loginAs, type SeededUser } from "./helpers";

/**
 * E2E: Deal Intelligence surfaces
 *
 * Verifies the new intelligence APIs respond correctly and
 * key pages render without crashing.
 */

let user: SeededUser;

test.beforeAll(async ({ request }) => {
  user = await seedUser(request, { tenantSlug: "deal-intel-e2e" });
});

test.afterAll(async ({ request }) => {
  await cleanupTenant(request, user.tenantId, "deal-intel-e2e");
});

test.describe("Deal Intelligence APIs", () => {
  test("forecast API returns valid structure", async ({ page }) => {
    await loginAs(page, user);
    const res = await page.request.get("/api/forecast?granularity=month&horizon=3");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("scenarios");
    expect(data).toHaveProperty("simulationCount");
  });

  test("benchmarks API returns array", async ({ page }) => {
    await loginAs(page, user);
    const res = await page.request.get("/api/benchmarks");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("benchmarks");
    expect(Array.isArray(data.benchmarks)).toBe(true);
  });

  test("calibration API returns suggestions", async ({ page }) => {
    await loginAs(page, user);
    const res = await page.request.get("/api/settings/calibration");
    expect(res.status()).toBe(200);
  });

  test("compliance API returns DPA status", async ({ page }) => {
    await loginAs(page, user);
    const res = await page.request.get("/api/settings/compliance");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("dpaStatus");
  });
});

test.describe("Pages render without crash", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, user);
  });

  test("opportunities page loads", async ({ page }) => {
    await page.goto("/opportunities");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("contacts page loads", async ({ page }) => {
    await page.goto("/contacts");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("accounts page loads", async ({ page }) => {
    await page.goto("/accounts");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("settings billing page loads", async ({ page }) => {
    await page.goto("/settings/billing");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("settings privacy page loads", async ({ page }) => {
    await page.goto("/settings/privacy");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("settings workflows page loads", async ({ page }) => {
    await page.goto("/settings/workflows");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });
});
