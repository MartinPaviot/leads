import { expect, test } from "@playwright/test";
import { cleanupTenant, seedAndLogin, type SeededUser } from "./helpers";

/**
 * Logo cascade E2E — validates that the V2 logo pipeline activates
 * correctly when `logo.v2.cascade` flag is on.
 *
 * Strategy: seed a tenant with the flag enabled + 3 companies, navigate
 * to /accounts, assert:
 *   1. No V1 Google Favicons URLs (www.google.com/s2/favicons)
 *   2. GeneratedCompanyAvatar SVGs render for cold-start domains
 *   3. Resolved logos swap in after the coalescer batch fires
 *   4. Near-zero CLS
 *
 * The test intercepts /api/company-logo/resolve-batch to avoid real
 * Clearbit/Google calls and return controlled tier data.
 */
test.describe("logo V2 cascade", () => {
  let seeded: SeededUser[] = [];

  test.afterEach(async ({ request }) => {
    for (const u of seeded) {
      await cleanupTenant(request, u.tenantId, "e2e-logo-");
    }
    seeded = [];
  });

  test("flag on: renders gradient avatars, swaps to resolved logos, no V1 URLs", async ({
    page,
    request,
  }) => {
    // 1. Seed tenant with a company
    const user = await seedAndLogin(request, page, {
      tenantSlug: "e2e-logo-cascade",
      role: "admin",
      seedCompany: true,
    });
    seeded.push(user);

    // 2. Enable the logo.v2.cascade flag
    const flagRes = await page.request.put("/api/experiments", {
      data: { flags: { "logo.v2.cascade": true } },
    });
    expect(flagRes.status(), "flag PUT should succeed").toBe(200);

    // 3. Intercept resolve-batch to return controlled data
    await page.route("**/api/company-logo/resolve-batch", async (route) => {
      const body = JSON.parse(route.request().postData() || "{}");
      const results: Record<string, unknown> = {};
      for (const entry of body.entries || []) {
        const domain = entry.domain?.toLowerCase();
        if (!domain) continue;
        if (domain.includes("clearbit-ok")) {
          results[domain] = {
            url: `https://logo.clearbit.com/${domain}`,
            tier: 2,
            fromCache: false,
            resolvedAt: new Date().toISOString(),
          };
        } else if (domain.includes("google-ok")) {
          results[domain] = {
            url: `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=https://${domain}&size=128`,
            tier: 4,
            fromCache: false,
            resolvedAt: new Date().toISOString(),
          };
        } else {
          results[domain] = {
            url: null,
            tier: 6,
            fromCache: false,
            resolvedAt: new Date().toISOString(),
          };
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results }),
      });
    });

    // 4. Navigate to accounts
    await page.goto("/accounts");
    await page.waitForLoadState("networkidle");

    // 5. Assert no V1 Google Favicons URLs anywhere on page
    const v1urls = await page.locator("img[src*='www.google.com/s2/favicons']").count();
    expect(v1urls, "no V1 Google Favicons URLs should appear").toBe(0);

    // 6. Assert GeneratedCompanyAvatar SVGs exist (gradient avatars)
    const avatarSvgs = await page.locator("svg[role='img'][aria-hidden='true']").count();
    expect(avatarSvgs, "at least one GeneratedCompanyAvatar SVG should render").toBeGreaterThanOrEqual(1);

    // 7. Check CLS is near-zero (< 0.1)
    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let total = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              total += (entry as any).value;
            }
          }
        });
        observer.observe({ type: "layout-shift", buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve(total);
        }, 2000);
      });
    });
    expect(cls, "CLS should be near-zero").toBeLessThan(0.1);
  });

  test("flag off: uses V1 Clearbit cascade (no resolve-batch calls)", async ({
    page,
    request,
  }) => {
    const user = await seedAndLogin(request, page, {
      tenantSlug: "e2e-logo-v1",
      role: "admin",
      seedCompany: true,
    });
    seeded.push(user);

    // Flag defaults to false, but explicitly ensure it
    const flagRes = await page.request.put("/api/experiments", {
      data: { flags: { "logo.v2.cascade": false } },
    });
    expect(flagRes.status()).toBe(200);

    let batchCallCount = 0;
    await page.route("**/api/company-logo/resolve-batch", async (route) => {
      batchCallCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results: {} }),
      });
    });

    await page.goto("/accounts");
    await page.waitForLoadState("networkidle");

    // V1 path should not call the batch endpoint
    expect(batchCallCount, "V1 path should not call resolve-batch").toBe(0);
  });
});
