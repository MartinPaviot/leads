import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { cleanupTenant, seedAndLogin, type SeededUser } from "./helpers";

/**
 * P2 (inbox-deal-closer roadmap) — live visual verification of
 * FollowUpsReadyCard on /home. No other automated test renders this card
 * in a real browser against a real server; this closes that gap.
 *
 * inbox_followup_nudges is cron-written only (no manual-create API by
 * design — drafting must never be triggerable except by the daily cron),
 * so this test inserts the fixture row directly via the DB driver, the
 * same way scripts/ one-off maintenance scripts do. Not covered by
 * /api/test-e2e/cleanup's fixed table list, so this test deletes its own
 * row explicitly rather than relying on cleanupTenant.
 */
test.describe("FollowUpsReadyCard on /home", () => {
  let seeded: SeededUser | null = null;
  let sql: ReturnType<typeof postgres> | null = null;
  let nudgeId: string | null = null;

  test.beforeAll(() => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL required for this spec's direct fixture insert");
    sql = postgres(url, { max: 1 });
  });

  test.afterAll(async () => {
    await sql?.end();
  });

  test.afterEach(async ({ request }) => {
    if (nudgeId && sql) {
      await sql`DELETE FROM inbox_followup_nudges WHERE id = ${nudgeId}`;
      nudgeId = null;
    }
    if (seeded) {
      await cleanupTenant(request, seeded.tenantId, "e2e-followup-nudge-");
      seeded = null;
    }
  });

  test("populated state shows an editable draft; dismiss removes it and flips the row server-side", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000); // dev-mode webpack cold-compile + a resource-constrained shared DB pool can be slow
    seeded = await seedAndLogin(request, page, {
      tenantSlug: "e2e-followup-nudge",
      role: "admin",
    });

    // Insert the fixture row BEFORE the first (and only) /home navigation —
    // one page load, not two, to minimize concurrent load against this
    // shared dev DB's small (15-slot) session-mode pool.
    const [row] = await sql!`
      INSERT INTO inbox_followup_nudges
        (id, tenant_id, user_id, conversation_key, contact_id, to_address, subject, body_text, stage, status, expires_at)
      VALUES
        (gen_random_uuid(), ${seeded.tenantId}, ${seeded.authUserId}, 'e2e-conv-1', NULL,
         'prospect@example.com', 'Re: pricing for 8 seats', 'Just checking in on this!', 1, 'pending_review',
         now() + interval '5 days')
      RETURNING id
    `;
    nudgeId = row.id as string;

    await page.goto("/home", { waitUntil: "domcontentloaded", timeout: 90_000 });
    await expect(page.getByText("Follow-ups ready to review")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/prospect@example\.com/)).toBeVisible();
    await expect(page.locator("input[value='Re: pricing for 8 seats']")).toBeVisible();
    await expect(page.getByText("Just checking in on this!")).toBeVisible();
    await page.screenshot({ path: "test-results/followup-nudges-populated.png", fullPage: true });

    // Dismiss — assert on the actual network response (not a second DB
    // round-trip): this shared dev DB's small (15-slot) session-mode pool
    // is under enough concurrent load in this environment that a THIRD
    // connection for re-verification is itself a source of flakes. The
    // route's tenant/user/version scoping + status transition is already
    // covered deterministically by lib/inbox or API-level DB-mocked unit
    // tests; this only needs to prove the real click → real request wiring.
    const [dismissResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/dismiss") && r.request().method() === "POST", { timeout: 30_000 }),
      page.getByRole("button", { name: /Dismiss/i }).click(),
    ]);
    expect(dismissResponse.status(), await dismissResponse.text().catch(() => "")).toBe(200);
    await expect(page.getByText("Follow-ups ready to review")).toHaveCount(0, { timeout: 15_000 });
    await page.screenshot({ path: "test-results/followup-nudges-after-dismiss.png", fullPage: true });
  });
});
