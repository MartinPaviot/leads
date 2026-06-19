// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import { ReachabilityInfo } from "@/app/(dashboard)/call-mode/_reachability-info";
import { ReachabilitySummary } from "@/app/(dashboard)/call-mode/_reachability-summary";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReachabilityInfo (row affordance)", () => {
  it("renders the icon, then reveals facts on hover", async () => {
    const { container, getByLabelText } = render(
      <ReachabilityInfo
        delay={0}
        contactId="c1"
        phone="+41 79 658 97 85"
        accessibilityScore={0.9}
        lastEnrichedAt="2026-06-14T12:00:00Z"
      />,
    );
    expect(getByLabelText(/Joignabilité/)).toBeTruthy();
    // The hover panel is portaled to <body>, so assert against the document.
    expect(document.body.textContent).not.toContain("Mobile suisse"); // hidden until hover
    fireEvent.mouseEnter(container.firstChild as Element);
    await waitFor(() => expect(document.body.textContent).toContain("Mobile suisse"));
  });

  it("offers a find-mobile action only when there is no number", async () => {
    const { container } = render(
      <ReachabilityInfo delay={0} contactId="c2" phone={null} />,
    );
    fireEvent.mouseEnter(container.firstChild as Element);
    await waitFor(() => expect(document.body.textContent).toContain("Pas de mobile"));
    expect(screen.getByText("Trouver le mobile")).toBeTruthy();
  });

  it("fires the enrich request and confirms, without throwing", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ requested: 1 }) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<ReachabilityInfo delay={0} contactId="c3" phone={null} />);
    fireEvent.mouseEnter(container.firstChild as Element);
    await waitFor(() => screen.getByText("Trouver le mobile"));
    fireEvent.click(screen.getByText("Trouver le mobile"));
    await waitFor(() => expect(document.body.textContent).toContain("Demandé"));
    expect(fetchMock).toHaveBeenCalledWith("/api/contacts/fullenrich-enrich", expect.objectContaining({ method: "POST" }));
  });
});

describe("ReachabilitySummary (list header)", () => {
  const items = [
    { contactId: "a", phone: "+41 79 658 97 85", accessibilityScore: 0.9 },
    { contactId: "b", phone: "+33 6 49 11 99 21" },
    { contactId: "c", phone: null },
  ];

  it("shows the aggregate counts and a bulk action for the missing numbers", () => {
    const { container, getByText } = render(<ReachabilitySummary items={items} />);
    expect(container.textContent).toContain("1 prêt");
    expect(container.textContent).toContain("à vérifier");
    expect(container.textContent).toContain("sans mobile");
    expect(getByText(/Trouver 1 mobile/)).toBeTruthy();
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<ReachabilitySummary items={[]} />);
    expect(container.textContent).toBe("");
  });

  it("bulk action posts only the numberless contacts", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ requested: 1 }) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    const { getByText } = render(<ReachabilitySummary items={items} />);
    fireEvent.click(getByText(/Trouver 1 mobile/));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(calls[0][1].body as string);
    expect(body.contactIds).toEqual(["c"]); // only the null-phone row
  });
});
