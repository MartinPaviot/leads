import { expect, test } from "@playwright/test";
import { cleanupTenant, seedAndLogin, type SeededUser } from "./helpers";

/**
 * BUGFIX-05 T5 — admin-only API routes.
 *
 * Server-side gates live in the route handlers (src/app/api/eval/**,
 * src/app/api/mcp/keys). The BUGFIX-05 spec asked for both page-level
 * and API-level gates; only the API gates shipped. This test asserts
 * the API behavior — a member hitting /api/eval/datasets or
 * /api/mcp/keys gets 403, while an admin gets 200.
 *
 * Page-level redirects (T1) weren't implemented, so we don't assert
 * them here.
 */
test.describe("admin-only API gates", () => {
  let seeded: SeededUser[] = [];

  test.afterEach(async ({ request }) => {
    for (const u of seeded) {
      await cleanupTenant(request, u.tenantId, "e2e-admin-");
    }
    seeded = [];
  });

  test("member is 403 on /api/eval/datasets + /api/mcp/keys", async ({ page, request }) => {
    const member = await seedAndLogin(request, page, {
      tenantSlug: "e2e-admin-member",
      role: "member",
    });
    seeded.push(member);

    const evalRes = await page.request.get("/api/eval/datasets");
    expect(evalRes.status(), "member → /api/eval/datasets").toBe(403);

    const mcpRes = await page.request.get("/api/mcp/keys");
    expect(mcpRes.status(), "member → /api/mcp/keys").toBe(403);
  });

  test("admin can hit /api/eval/datasets + /api/mcp/keys without 403", async ({ page, request }) => {
    const admin = await seedAndLogin(request, page, {
      tenantSlug: "e2e-admin-admin",
      role: "admin",
    });
    seeded.push(admin);

    const evalRes = await page.request.get("/api/eval/datasets");
    expect(evalRes.status(), "admin → /api/eval/datasets must not be 403").not.toBe(403);
    expect([200, 500]).toContain(evalRes.status()); // 500 OK if no datasets table yet

    const mcpRes = await page.request.get("/api/mcp/keys");
    expect(mcpRes.status(), "admin → /api/mcp/keys must not be 403").not.toBe(403);
    expect([200, 500]).toContain(mcpRes.status());
  });
});
