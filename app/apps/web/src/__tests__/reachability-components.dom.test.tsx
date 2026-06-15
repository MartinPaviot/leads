// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
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
    expect(container.textContent).not.toContain("Mobile suisse"); // hidden until hover
    fireEvent.mouseEnter(container.firstChild as Element);
    await waitFor(() => expect(container.textContent).toContain("Mobile suisse"));
  });

  it("offers a find-mobile action only when there is no number", async () => {
    const { container, getByText } = render(
      <ReachabilityInfo delay={0} contactId="c2" phone={null} />,
    );
    fireEvent.mouseEnter(container.firstChild as Element);
    await waitFor(() => expect(container.textContent).toContain("Pas de mobile"));
    expect(getByText("Trouver le mobile")).toBeTruthy();
  });

  it("fires the enrich request and confirms, without throwing", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ requested: 1 }) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    const { container, getByText } = render(<ReachabilityInfo delay={0} contactId="c3" phone={null} />);
    fireEvent.mouseEnter(container.firstChild as Element);
    await waitFor(() => getByText("Trouver le mobile"));
    fireEvent.click(getByText("Trouver le mobile"));
    await waitFor(() => expect(container.textContent).toContain("Demandé"));
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
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.contactIds).toEqual(["c"]); // only the null-phone row
  });
});
