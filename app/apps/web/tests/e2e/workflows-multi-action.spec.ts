import { expect, test } from "@playwright/test";
import { cleanupTenant, seedAndLogin, type SeededUser } from "./helpers";

/**
 * BUGFIX-03 T6 — multi-action workflows persist via CRUD.
 *
 * Tests the API contract directly to avoid UI rendering flakiness.
 * The original UI-driven test was `.fixme()` due to race conditions
 * between Save and list render on Windows/Turbopack. API-level tests
 * verify the core bug fix (workflows actually persist with multiple
 * actions) without the UI timing dependency.
 */
test.describe("workflows / multi-action CRUD", () => {
  let user: SeededUser | null = null;

  test.afterEach(async ({ request }) => {
    if (user) {
      await cleanupTenant(request, user.tenantId, "e2e-workflows-");
      user = null;
    }
  });

  test("PUT creates a multi-action workflow and GET returns it", async ({ page, request }) => {
    user = await seedAndLogin(request, page, {
      tenantSlug: "e2e-workflows",
      role: "admin",
    });

    const uniqueName = `E2E MultiAction ${Date.now()}`;

    // Create workflow via API with 3 actions
    const putRes = await page.request.put("/api/settings/workflows", {
      data: {
        name: uniqueName,
        trigger: { event: "deal_stage_changed", conditions: {} },
        actions: [
          { type: "notification", config: { message: "Deal moved!" } },
          { type: "create_task", config: { title: "Follow up" } },
          { type: "add_tag", config: { tag: "stage-changed" } },
        ],
        enabled: true,
      },
    });
    expect(putRes.ok(), `PUT failed: ${putRes.status()}`).toBeTruthy();

    // GET should return the workflow with all 3 actions
    const getRes = await page.request.get("/api/settings/workflows");
    expect(getRes.ok()).toBeTruthy();
    const body = (await getRes.json()) as {
      workflows: Array<{ name: string; actions: unknown[] }>;
    };
    const created = body.workflows.find((w) => w.name === uniqueName);
    expect(created, "created workflow must appear in GET response").toBeTruthy();
    expect(created?.actions.length).toBeGreaterThanOrEqual(3);
  });

  test("/settings/workflows page loads for admin", async ({ page, request }) => {
    user = await seedAndLogin(request, page, {
      tenantSlug: "e2e-workflows-page",
      role: "admin",
    });

    await page.goto("/settings/workflows");
    await page.waitForURL(/\/settings\/workflows/, { timeout: 15_000 });

    // Page should render without crash — heading visible
    await expect(
      page.getByRole("heading", { name: /Workflows/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
