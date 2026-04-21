import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Clear env and restore module before each test so we can assert
// both "no key → no fetch" and "key set → fetch called" branches.
const origKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const origHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

afterEach(() => {
  if (origKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  else process.env.NEXT_PUBLIC_POSTHOG_KEY = origKey;
  if (origHost === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  else process.env.NEXT_PUBLIC_POSTHOG_HOST = origHost;
});

describe("posthogEvents catalog", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("exposes a helper per declared event name, with the same key set", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const mod = await import("@/lib/analytics");

    // Every helper is a function.
    for (const name of mod.KNOWN_EVENT_NAMES) {
      expect(typeof mod.posthogEvents[name]).toBe("function");
    }
    // The catalog covers the funnel shape we care about. This list is
    // intentionally loose — the goal is to fail the test if someone
    // removes a first-class event by accident.
    expect(mod.KNOWN_EVENT_NAMES).toContain("signup_completed");
    expect(mod.KNOWN_EVENT_NAMES).toContain("onboarding_completed");
    expect(mod.KNOWN_EVENT_NAMES).toContain("sequence_launched");
    expect(mod.KNOWN_EVENT_NAMES).toContain("opportunity_stage_changed");
    expect(mod.KNOWN_EVENT_NAMES).toContain("password_reset_completed");
    // WS-0 instrumentation additions — fail loudly if any of these are
    // removed, because the onboarding baseline dashboard depends on them.
    expect(mod.KNOWN_EVENT_NAMES).toContain("onboarding_oauth_returned");
    expect(mod.KNOWN_EVENT_NAMES).toContain("onboarding_confidence_gaps_shown");
    expect(mod.KNOWN_EVENT_NAMES).toContain("onboarding_build_tam_triggered");
    expect(mod.KNOWN_EVENT_NAMES).toContain("onboarding_build_tam_completed");
    expect(mod.KNOWN_EVENT_NAMES).toContain("onboarding_build_tam_failed");
    expect(mod.KNOWN_EVENT_NAMES).toContain("onboarding_api_latency");
    expect(mod.KNOWN_EVENT_NAMES).toContain("ttfaa_started");
    expect(mod.KNOWN_EVENT_NAMES).toContain("ttfaa_completed_v1_proxy");
  });

  it("sends a POST /capture when an event helper is invoked", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://us.i.posthog.com";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mod = await import("@/lib/analytics");
    await mod.posthogEvents.signup_completed("user-1", {
      method: "google",
      userId: "user-1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us.i.posthog.com/capture/");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.event).toBe("signup_completed");
    expect(body.distinct_id).toBe("user-1");
    expect(body.properties).toMatchObject({ method: "google", userId: "user-1", $lib: "elevay-server" });
    expect(body.api_key).toBe("phc_test");
  });

  it("is a no-op when NEXT_PUBLIC_POSTHOG_KEY is missing", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mod = await import("@/lib/analytics");
    await mod.posthogEvents.landing_viewed("anon", { utm_source: "twitter" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows fetch failures so the app doesn't crash on a bad PostHog endpoint", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const fetchMock = vi.fn().mockRejectedValue(new Error("boom"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mod = await import("@/lib/analytics");
    // Should NOT throw.
    await expect(
      mod.posthogEvents.signin_failed("u1", { method: "credentials", reason: "bad-password" })
    ).resolves.toBeUndefined();
  });

  it("still honors the legacy captureEvent API", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const mod = await import("@/lib/analytics");
    await mod.captureEvent("u1", "signup", { method: "credentials" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.event).toBe("signup");
    expect(body.properties.method).toBe("credentials");
  });
});
