// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { CollisionWarning } from "@/app/(dashboard)/call-mode/_collision-warning";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(json: unknown, ok = true) {
  const fetchMock = vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(json) } as Response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CollisionWarning", () => {
  it("shows a soft, non-blocking warning when a teammate touched the prospect", async () => {
    stubFetch({
      collision: { userName: "Marie Curie", channel: "call", outcome: null, daysAgo: 2, otherUserCount: 1 },
    });
    const { container } = render(<CollisionWarning contactId="c1" />);
    await waitFor(() => expect(container.textContent).toContain("Marie Curie"));
    expect(container.textContent).toContain("appelé ce prospect");
    expect(container.textContent).toContain("il y a 2 j");
  });

  it("renders nothing when there is no collision (clear prospect)", async () => {
    const fetchMock = stubFetch({ collision: null });
    const { container } = render(<CollisionWarning contactId="c1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("does not fetch (and renders nothing) without a contactId", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<CollisionWarning contactId={null} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });
});
