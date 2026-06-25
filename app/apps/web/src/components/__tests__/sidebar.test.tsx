// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

/**
 * Sidebar collapse behaviour.
 *
 * Two guarantees the founder asked for (2026-06-25):
 *   1. A manual collapse STICKS across navigation. The old code re-ran an
 *      effect on every `pathname` change that forced the rail back open, so
 *      clicking a nav item while collapsed re-expanded it. Regression test
 *      below pins the fix: collapse → navigate → still collapsed.
 *   2. The right-edge handle toggles the sidebar both ways.
 *
 * `usePathname` is read from a mutable module variable so a test can simulate
 * a navigation by changing it and re-rendering the SAME mounted component
 * (the dashboard layout — and thus the Sidebar — persists across route
 * changes; only `pathname` updates).
 */

let currentPathname = "/accounts";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));
vi.mock("@/lib/i18n/locale", () => ({
  useLocale: () => ({ locale: "fr", setLocale: vi.fn() }),
}));
vi.mock("@/components/ui/theme-provider", () => ({
  useTheme: () => ({ theme: "light", toggle: vi.fn() }),
}));

import { Sidebar } from "@/components/sidebar";

const STORAGE_KEY = "elevay:sidebar-collapsed";

function renderSidebar() {
  return render(
    <Sidebar
      userName="Martin Paviot"
      userEmail="martin@elevay.dev"
      userInitials="MP"
      userAvatarUrl={null}
      tenantName="Acme Inc"
      tenantLogoUrl={null}
      recentChats={[]}
      onSignOut={vi.fn()}
    />,
  );
}

/** The workspace name only renders when the rail is EXPANDED. */
const isExpanded = () => screen.queryByText("Acme Inc") !== null;
/** DOM order: header chevron first, right-edge handle last. */
const edgeHandle = (name: RegExp) => {
  const all = screen.getAllByRole("button", { name });
  return all[all.length - 1];
};

beforeEach(() => {
  currentPathname = "/accounts";
  window.localStorage.clear();
  // happy-dom may not implement matchMedia; the component guards on its
  // presence. Stub a desktop (non-narrow) viewport for determinism.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ objectTypes: [] }),
      text: async () => "{}",
    })) as unknown as typeof fetch,
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Sidebar collapse", () => {
  it("starts expanded on a normal route", async () => {
    renderSidebar();
    await waitFor(() => expect(isExpanded()).toBe(true));
  });

  it("a manual collapse persists across navigation (does NOT re-open on nav)", async () => {
    const { rerender } = renderSidebar();
    await waitFor(() => expect(isExpanded()).toBe(true));

    // Collapse via the right-edge handle.
    fireEvent.click(edgeHandle(/collapse sidebar/i));
    await waitFor(() => expect(isExpanded()).toBe(false));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");

    // Simulate navigating to another page (same mounted Sidebar, new pathname).
    currentPathname = "/contacts";
    rerender(
      <Sidebar
        userName="Martin Paviot"
        userEmail="martin@elevay.dev"
        userInitials="MP"
        userAvatarUrl={null}
        tenantName="Acme Inc"
        tenantLogoUrl={null}
        recentChats={[]}
        onSignOut={vi.fn()}
      />,
    );

    // The bug was: this re-expanded. It must STAY collapsed.
    expect(isExpanded()).toBe(false);
  });

  it("the right-edge handle toggles the sidebar both ways", async () => {
    renderSidebar();
    await waitFor(() => expect(isExpanded()).toBe(true));

    fireEvent.click(edgeHandle(/collapse sidebar/i));
    await waitFor(() => expect(isExpanded()).toBe(false));

    fireEvent.click(edgeHandle(/expand sidebar/i));
    await waitFor(() => expect(isExpanded()).toBe(true));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("0");
  });

  it("restores a persisted collapsed preference on mount", async () => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    renderSidebar();
    // Effect reads storage post-mount; the rail settles collapsed.
    await waitFor(() => expect(isExpanded()).toBe(false));
  });

  it("defaults to collapsed on /settings (its own sub-nav makes the CRM rail redundant)", async () => {
    currentPathname = "/settings";
    renderSidebar();
    // No stored preference → the route default collapses the rail so the
    // settings sub-nav isn't doubled by a second full-width sidebar.
    await waitFor(() => expect(isExpanded()).toBe(false));
  });

  it("an explicit expand on /settings wins over the collapsed route default", async () => {
    currentPathname = "/settings";
    const { rerender } = renderSidebar();
    await waitFor(() => expect(isExpanded()).toBe(false));

    // The founder can still force the rail open; that choice must persist and
    // beat the per-route default.
    fireEvent.click(edgeHandle(/expand sidebar/i));
    await waitFor(() => expect(isExpanded()).toBe(true));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("0");

    // Navigating within settings keeps it open (same mounted Sidebar, new
    // pathname) — the route default must not re-collapse it.
    currentPathname = "/settings/security";
    rerender(
      <Sidebar
        userName="Martin Paviot"
        userEmail="martin@elevay.dev"
        userInitials="MP"
        userAvatarUrl={null}
        tenantName="Acme Inc"
        tenantLogoUrl={null}
        recentChats={[]}
        onSignOut={vi.fn()}
      />,
    );
    expect(isExpanded()).toBe(true);
  });

  it("a narrow viewport forces collapse even when the preference is expanded", async () => {
    window.localStorage.setItem(STORAGE_KEY, "0");
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true, // narrow
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    renderSidebar();
    await waitFor(() => expect(isExpanded()).toBe(false));
  });
});
