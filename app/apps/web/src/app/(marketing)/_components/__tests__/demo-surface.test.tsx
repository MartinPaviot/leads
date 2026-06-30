// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DemoSurface } from "../demo-surface";

afterEach(cleanup);

// Regression: the demo fetch interceptor must NOT leak demo data into the real
// app. It patches the global window.fetch on the landing; without a path guard +
// teardown, SPA-navigating into the authenticated /accounts page kept the patch
// live and served ACCOUNTS_DEMO instead of the tenant's real accounts.
describe("DemoSurface — fetch interceptor leak guard", () => {
  let realFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.history.pushState({}, "", "/"); // start on the landing path
    realFetch = vi.fn(
      async () => new Response(JSON.stringify({ real: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    window.fetch = realFetch as unknown as typeof fetch;
  });

  it("serves demo on the landing, real data once in the app, and restores fetch on unmount", async () => {
    const { unmount } = render(
      <DemoSurface routes={{ "/api/accounts": { accounts: ["demo-co"] } }}>
        <div>child</div>
      </DemoSurface>,
    );

    // On the landing path ("/") the demo route is intercepted.
    const onLanding = await (await window.fetch("/api/accounts")).json();
    expect(onLanding).toEqual({ accounts: ["demo-co"] });
    expect(realFetch).not.toHaveBeenCalled();

    // Simulate client-side navigation INTO the authenticated app (no reload).
    window.history.pushState({}, "", "/accounts");
    const inApp = await (await window.fetch("/api/accounts")).json();
    // The real server answers now — demo no longer leaks into /accounts.
    expect(inApp).toEqual({ real: true });
    expect(realFetch).toHaveBeenCalledTimes(1);

    // Unmounting the last surface tears the patch down: even back on the landing
    // path, the real fetch is restored and the registry is cleared.
    unmount();
    window.history.pushState({}, "", "/");
    const afterUnmount = await (await window.fetch("/api/accounts")).json();
    expect(afterUnmount).toEqual({ real: true });
    expect(realFetch).toHaveBeenCalledTimes(2);
  });
});
