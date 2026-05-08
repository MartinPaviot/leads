/**
 * @vitest-environment happy-dom
 *
 * Audit-2026-05-08 L2 regression — F12 / F13 / F15 PostHog wiring.
 *
 * Pins three contracts the autocapture rollout depends on :
 *
 *   1. trackEvent is a no-op until the SDK is initialised. Calls
 *      from server-side renders or pre-init code paths must not
 *      throw and must not blast the network.
 *
 *   2. trackEvent forwards to posthog.capture once initialised, with
 *      the event name + properties, AND with the legacy distinct_id
 *      hint so a click that fires before the identify effect lands
 *      on the right person.
 *
 *   3. PostHogIdentify calls posthog.identify on mount with traits,
 *      calls posthog.group("tenant", id, ...) when traits.tenantId
 *      is set, and calls posthog.reset on logout (userId flips to
 *      null after being set).
 *
 * If any of these break, the next session's autocapture would miss
 * events / mis-attribute users / leak identity across logout.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const captureSpy = vi.fn();
const identifySpy = vi.fn();
const resetSpy = vi.fn();
const groupSpy = vi.fn();
const peopleSetSpy = vi.fn();
const initSpy = vi.fn();

vi.mock("posthog-js", () => ({
  default: {
    init: (...args: unknown[]) => initSpy(...args),
    capture: (...args: unknown[]) => captureSpy(...args),
    identify: (...args: unknown[]) => identifySpy(...args),
    reset: () => resetSpy(),
    group: (...args: unknown[]) => groupSpy(...args),
    people: { set: (...args: unknown[]) => peopleSetSpy(...args) },
  },
}));

beforeEach(() => {
  captureSpy.mockClear();
  identifySpy.mockClear();
  resetSpy.mockClear();
  groupSpy.mockClear();
  peopleSetSpy.mockClear();
  initSpy.mockClear();
  cleanup();
  // Reset modules so the provider's module-scoped `initialised` flag
  // resets between cases — otherwise the first test's init bleeds
  // into the second.
  vi.resetModules();
});

describe("F12 — trackEvent is a no-op pre-init", () => {
  it("does NOT call posthog.capture when the SDK never initialised", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const mod = await import("@/components/posthog-provider");
    mod.trackEvent("user-1", "test_event", { foo: "bar" });
    expect(captureSpy).not.toHaveBeenCalled();
  });
});

describe("F13 + F15 — trackEvent forwards to posthog.capture once initialised", () => {
  it("forwards event + props + distinct_id_hint after init", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.com";

    const { PostHogProvider, trackEvent } = await import(
      "@/components/posthog-provider"
    );

    // Mount the provider so initOnce runs.
    render(<PostHogProvider />);

    // First effect runs in microtask — flush.
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(initSpy).toHaveBeenCalled();

    // Provider's mount effect already fired one $pageview before
    // we get here. Assert on the specific call that interests us
    // (chat_message_sent) rather than total count, so the test is
    // robust against future additions to the provider's mount-time
    // captures (e.g. a `session_started` event).
    captureSpy.mockClear();

    trackEvent("user-42", "chat_message_sent", {
      queryLength: 17,
      threadId: "t-1",
    });

    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy).toHaveBeenCalledWith(
      "chat_message_sent",
      expect.objectContaining({
        queryLength: 17,
        threadId: "t-1",
        distinct_id_hint: "user-42",
      }),
    );
  });
});

describe("F12 — PostHogIdentify identifies, groups, and resets cleanly", () => {
  it("identifies on mount with traits, groups by tenantId", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";

    const { PostHogProvider, PostHogIdentify } = await import(
      "@/components/posthog-provider"
    );

    render(
      <PostHogProvider>
        <PostHogIdentify
          userId="user-1"
          traits={{
            email: "alex@elevay.dev",
            name: "Alex",
            tenantId: "tenant-1",
            tenantName: "Acme",
          }}
        />
      </PostHogProvider>,
    );

    await new Promise<void>((r) => setTimeout(r, 0));

    expect(identifySpy).toHaveBeenCalledTimes(1);
    expect(identifySpy).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        email: "alex@elevay.dev",
        tenantId: "tenant-1",
      }),
    );
    expect(groupSpy).toHaveBeenCalledWith(
      "tenant",
      "tenant-1",
      expect.objectContaining({ name: "Acme" }),
    );
  });

  it("calls posthog.reset when userId flips to null after being set", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";

    const { PostHogProvider, PostHogIdentify } = await import(
      "@/components/posthog-provider"
    );

    const { rerender } = render(
      <PostHogProvider>
        <PostHogIdentify userId="user-1" traits={{ email: "a@b.c" }} />
      </PostHogProvider>,
    );
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(identifySpy).toHaveBeenCalledTimes(1);

    // Logout simulation : same tree, userId=null.
    rerender(
      <PostHogProvider>
        <PostHogIdentify userId={null} />
      </PostHogProvider>,
    );
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(resetSpy).toHaveBeenCalledTimes(1);
  });
});
