/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HotVisitorsWidget } from "@/components/hot-visitors-widget";

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(items: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          items,
          since: new Date().toISOString(),
        }),
      }) as unknown as Response,
    ),
  );
}

const baseItem = {
  visitorId: "vis-1",
  companyId: "co-1",
  companyName: "Acme Corp",
  companyDomain: "acme.io",
  companyScore: 80,
  lastUrl: "https://acme.io/pricing",
  lastVisitAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  visitCount: 3,
  openDeal: null,
  activeEnrollments: 0,
};

describe("HotVisitorsWidget", () => {
  it("hides itself when there are no items", async () => {
    stubFetch([]);
    const { container } = render(<HotVisitorsWidget />);
    await waitFor(() => {
      // Wait for the loading skeleton to clear.
      expect(container.querySelector(".animate-pulse")).toBeNull();
    });
    // Empty → component returns null → container is empty.
    expect(container.firstChild).toBeNull();
  });

  it("renders a card per visitor with company name + path", async () => {
    stubFetch([baseItem]);
    render(<HotVisitorsWidget />);
    await waitFor(() => expect(screen.getByText(/Acme Corp/i)).toBeDefined());
    expect(screen.getByText(/\/pricing/)).toBeDefined();
    expect(screen.getByText(/3 visits/)).toBeDefined();
    expect(screen.getByText(/score 80/)).toBeDefined();
  });

  it("shows 'Open deal' badge when openDeal is present", async () => {
    stubFetch([
      { ...baseItem, openDeal: { id: "d-1", name: "Acme Q4", stage: "demo" } },
    ]);
    render(<HotVisitorsWidget />);
    await waitFor(() => expect(screen.getByText(/Open deal/i)).toBeDefined());
    expect(screen.getByText(/demo/i)).toBeDefined();
  });

  it("shows 'in sequence' badge when activeEnrollments > 0", async () => {
    stubFetch([{ ...baseItem, activeEnrollments: 2 }]);
    render(<HotVisitorsWidget />);
    await waitFor(() => expect(screen.getByText(/2 in sequence/i)).toBeDefined());
  });

  it("does not show badges when openDeal is null and activeEnrollments is 0", async () => {
    stubFetch([baseItem]);
    render(<HotVisitorsWidget />);
    await waitFor(() => expect(screen.getByText(/Acme Corp/i)).toBeDefined());
    expect(screen.queryByText(/Open deal/i)).toBeNull();
    expect(screen.queryByText(/in sequence/i)).toBeNull();
  });

  it("links to /accounts/:companyId when companyId is present", async () => {
    stubFetch([baseItem]);
    render(<HotVisitorsWidget />);
    await waitFor(() => expect(screen.getByText(/Acme Corp/i)).toBeDefined());
    const link = screen.getByText(/Acme Corp/i).closest("a");
    expect(link?.getAttribute("href")).toBe("/accounts/co-1");
  });

  it("displays relative time in the right rail", async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    stubFetch([{ ...baseItem, lastVisitAt: fiveMinAgo }]);
    render(<HotVisitorsWidget />);
    await waitFor(() => expect(screen.getByText(/5m ago/i)).toBeDefined());
  });

  it("falls back to domain initial when companyName is null", async () => {
    stubFetch([
      { ...baseItem, companyName: null, companyDomain: "stripe.com" },
    ]);
    render(<HotVisitorsWidget />);
    await waitFor(() =>
      expect(screen.getByText("stripe.com")).toBeDefined(),
    );
  });
});
