import { expect, test } from "@playwright/test";

/**
 * E2E tests for coaching-related API auth.
 * The coaching engine runs via Inngest (not API routes), so we
 * can't test it end-to-end without Inngest Dev Server. These tests
 * verify the dashboard endpoints that surface coaching data are
 * properly gated.
 */
test.describe("Coaching data auth", () => {
  test("unauthenticated request to /api/dashboard/performance returns 401", async ({ request }) => {
    const res = await request.get("/api/dashboard/performance");
    expect(res.status()).toBe(401);
  });

  test("unauthenticated request to /api/dashboard/briefs returns 401", async ({ request }) => {
    const res = await request.get("/api/dashboard/briefs");
    expect(res.status()).toBe(401);
  });
});
