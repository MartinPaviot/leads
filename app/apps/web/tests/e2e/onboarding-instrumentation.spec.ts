import { expect, test } from "@playwright/test";
import { cleanupTenant, seedUser, loginAs, type SeededUser } from "./helpers";

/**
 * WS-0 PR 2 — onboarding instrumentation e2e.
 *
 * Focused on the server-side telemetry hooks that unit tests can't
 * easily cover: `onboarding_completed` fires from /api/onboarding/save
 * with a computed durationMs, and `ttfaa_completed_v1_proxy` fires
 * from /api/home/hydrate on the first qualifying call.
 *
 * We intercept https://us.i.posthog.com/capture/ at the browser context
 * level and collect every PostHog payload. Each test seeds a dedicated
 * tenant so captured events can be filtered by userId.
 *
 * Not covered here (intentional):
 *  - Client-side event emission from the wizard. Those are covered by
 *    the per-component unit tests in __tests__/ttfaa.test.ts and the
 *    analytics-events catalog sanity test.
 *  - TAM build / find-contacts / scoring. Requires Apollo, out of scope.
 */

interface CapturedEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
}

test.describe("WS-0 onboarding instrumentation", () => {
  let seeded: SeededUser[] = [];

  test.afterEach(async ({ request }) => {
    for (const u of seeded) {
      await cleanupTenant(request, u.tenantId, "e2e-ws0-");
    }
    seeded = [];
  });

  test("onboarding_completed fires server-side with durationMs", async ({ page, request }) => {
    const captured: CapturedEvent[] = [];
    await page.context().route("**/capture/**", async (route) => {
      try {
        const body = route.request().postDataJSON() as {
          event: string;
          distinct_id: string;
          properties: Record<string, unknown>;
          timestamp: string;
        };
        captured.push(body);
      } catch {
        // Non-JSON body (e.g. PostHog sometimes uses form data) — ignore.
      }
      await route.fulfill({ status: 200, body: "{}" });
    });

    const user = await seedUser(request, {
      tenantSlug: "e2e-ws0-completed",
      role: "admin",
    });
    seeded.push(user);
    await loginAs(page, user);

    // Stamp the welcome step first so onboardingStartedAt gets set.
    const welcomeRes = await page.request.post("/api/onboarding/save", {
      data: {
        step: "welcome",
        fullName: "Test User",
        companyName: "Test Co",
        role: "Founder",
        domain: "test-co.example",
      },
    });
    expect(welcomeRes.ok()).toBe(true);

    // Short wait so durationMs is measurable (and > 0).
    await page.waitForTimeout(150);

    // Fire the completion save. This is the emission point we care about.
    const completeRes = await page.request.post("/api/onboarding/save", {
      data: { step: "complete", onboardingCompleted: true },
    });
    expect(completeRes.ok()).toBe(true);

    // PostHog captures are fire-and-forget; give the server a moment to
    // finish the fetch before we assert.
    await expect
      .poll(
        () =>
          captured.find(
            (e) => e.event === "onboarding_completed" && e.distinct_id === user.authUserId
          ),
        { timeout: 5_000, message: "expected an onboarding_completed event for this user" }
      )
      .toBeTruthy();

    const evt = captured.find(
      (e) => e.event === "onboarding_completed" && e.distinct_id === user.authUserId
    )!;
    expect(evt.properties.userId).toBe(user.authUserId);
    // Wall-clock between the two saves was >=150ms; allow generous ceiling.
    const duration = Number(evt.properties.durationMs);
    expect(duration).toBeGreaterThanOrEqual(100);
    expect(duration).toBeLessThan(30_000);
  });

  test("ttfaa_completed_v1_proxy fires on first hydrate with enrichedRecordCount >= 1", async ({ page, request }) => {
    const captured: CapturedEvent[] = [];
    await page.context().route("**/capture/**", async (route) => {
      try {
        const body = route.request().postDataJSON() as CapturedEvent;
        captured.push(body);
      } catch {
        // ignore
      }
      await route.fulfill({ status: 200, body: "{}" });
    });

    const user = await seedUser(request, {
      tenantSlug: "e2e-ws0-ttfaa",
      role: "admin",
      seedCompany: true,
    });
    seeded.push(user);
    await loginAs(page, user);

    // Simulate the onboarding-completion state without running the
    // full wizard. Flip onboardingCompleted = true directly through
    // the save endpoint.
    const welcomeRes = await page.request.post("/api/onboarding/save", {
      data: {
        step: "welcome",
        fullName: "Test User",
        companyName: "Test Co",
        role: "Founder",
        domain: "test-co.example",
      },
    });
    expect(welcomeRes.ok()).toBe(true);
    const completeRes = await page.request.post("/api/onboarding/save", {
      data: { step: "complete", onboardingCompleted: true },
    });
    expect(completeRes.ok()).toBe(true);

    // First hydrate — the server-side ttfaa_completed_v1_proxy emission
    // point. Companies count is 1 (seeded), onboarding is complete, so
    // the guard in /api/home/hydrate fires the event.
    const hydrateRes = await page.request.get("/api/home/hydrate");
    expect(hydrateRes.ok()).toBe(true);
    const hydratePayload = (await hydrateRes.json()) as {
      summary: { founderMetrics?: { totalAccounts?: number } } | null;
      onboarding: { needsOnboarding?: boolean } | null;
    };
    // Sanity: the guard's premise holds.
    expect(hydratePayload.onboarding?.needsOnboarding).toBe(false);
    expect(hydratePayload.summary?.founderMetrics?.totalAccounts ?? 0).toBeGreaterThanOrEqual(1);

    await expect
      .poll(
        () =>
          captured.find(
            (e) =>
              e.event === "ttfaa_completed_v1_proxy" &&
              e.distinct_id === user.authUserId
          ),
        { timeout: 5_000, message: "expected a ttfaa_completed_v1_proxy event" }
      )
      .toBeTruthy();

    const evt = captured.find(
      (e) => e.event === "ttfaa_completed_v1_proxy" && e.distinct_id === user.authUserId
    )!;
    expect(typeof evt.properties.durationMs).toBe("number");
    expect(evt.properties.enrichedRecordCount).toBeGreaterThanOrEqual(1);

    // Second hydrate should NOT re-fire the event — idempotency guard.
    const before = captured.filter(
      (e) => e.event === "ttfaa_completed_v1_proxy" && e.distinct_id === user.authUserId
    ).length;
    await page.request.get("/api/home/hydrate");
    await page.waitForTimeout(500);
    const after = captured.filter(
      (e) => e.event === "ttfaa_completed_v1_proxy" && e.distinct_id === user.authUserId
    ).length;
    expect(after).toBe(before);
  });

  test("onboarding_completed duration is absent when onboardingStartedAt was never stamped (legacy tenant)", async ({ page, request }) => {
    const captured: CapturedEvent[] = [];
    await page.context().route("**/capture/**", async (route) => {
      try {
        captured.push(route.request().postDataJSON() as CapturedEvent);
      } catch {
        // ignore
      }
      await route.fulfill({ status: 200, body: "{}" });
    });

    const user = await seedUser(request, {
      tenantSlug: "e2e-ws0-legacy",
      role: "admin",
    });
    seeded.push(user);
    await loginAs(page, user);

    // Skip the welcome save entirely — hit complete directly, mirroring
    // a tenant whose onboarding predates the WS-0 stamp.
    const completeRes = await page.request.post("/api/onboarding/save", {
      data: { step: "complete", onboardingCompleted: true },
    });
    expect(completeRes.ok()).toBe(true);

    await expect
      .poll(
        () =>
          captured.find(
            (e) => e.event === "onboarding_completed" && e.distinct_id === user.authUserId
          ),
        { timeout: 5_000 }
      )
      .toBeTruthy();

    const evt = captured.find(
      (e) => e.event === "onboarding_completed" && e.distinct_id === user.authUserId
    )!;
    // durationMs is omitted when onboardingStartedAt is absent — the
    // property is undefined on the emission side and PostHog drops
    // undefined values, so we assert absence rather than a specific
    // value. The event still fires so the funnel has a signal.
    expect(evt.properties.durationMs).toBeUndefined();
  });
});
