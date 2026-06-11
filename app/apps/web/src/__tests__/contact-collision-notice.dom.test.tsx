// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { ContactCollisionNotice } from "@/components/collision/contact-collision-notice";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(json: unknown, ok = true) {
  const fetchMock = vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(json) } as Response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ContactCollisionNotice", () => {
  it("renders an English warning by default", async () => {
    stubFetch({
      collision: { userName: "Marie Curie", channel: "email", outcome: null, daysAgo: 2, otherUserCount: 1 },
    });
    const { container } = render(<ContactCollisionNotice contactId="c1" />);
    await waitFor(() => expect(container.textContent).toContain("Marie Curie"));
    expect(container.textContent).toContain("already emailed this prospect");
    expect(container.textContent).toContain("2 days ago");
    expect(container.textContent).toContain("Check the history first");
  });

  it("renders a French warning with lang='fr'", async () => {
    stubFetch({
      collision: { userName: "Marie Curie", channel: "call", outcome: null, daysAgo: 1, otherUserCount: 1 },
    });
    const { container } = render(<ContactCollisionNotice contactId="c1" lang="fr" />);
    await waitFor(() => expect(container.textContent).toContain("Marie Curie"));
    expect(container.textContent).toContain("a déjà appelé ce prospect");
    expect(container.textContent).toContain("hier");
    expect(container.textContent).toContain("Vérifie l'historique");
  });

  it("renders nothing when there is no collision (clear contact)", async () => {
    const fetchMock = stubFetch({ collision: null });
    const { container } = render(<ContactCollisionNotice contactId="c1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("does not fetch (and renders nothing) without a contactId", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<ContactCollisionNotice contactId={null} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });
});
