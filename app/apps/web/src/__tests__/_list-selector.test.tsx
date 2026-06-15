// @vitest-environment happy-dom
/**
 * Render test for the "To call now" list selector (T5/T6/T8, _specs/call-lists).
 * Proves the two axes + sort render, counts show, and each interaction fires the
 * right callback — the component-level proof the spec asks for (the end-to-end
 * DB flow is exercised in a preview/live run).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CallListSelector, type CallListsData } from "@/app/(dashboard)/call-mode/_list-selector";

afterEach(cleanup);

const data: CallListsData = {
  hasCampaign: true,
  activeListId: "L1",
  system: [
    { id: "today", name: "Aujourd'hui", count: 12 },
    { id: "callbacks_due", name: "Rappels dus", count: 5 },
    { id: "new", name: "Nouveaux", count: 7 },
  ],
  sector: [{ id: "L1", name: "EMS romands", counts: { total: 40, withPhone: 20, callable: 9 } }],
};

function setup(overrides: Partial<React.ComponentProps<typeof CallListSelector>> = {}) {
  const props = {
    data,
    selectedSystemId: "today",
    busySectorId: null,
    sortKey: "fit" as const,
    onSelectSystem: vi.fn(),
    onActivateSector: vi.fn(),
    onActivateAll: vi.fn(),
    onCreate: vi.fn(),
    onSortChange: vi.fn(),
    creating: false,
    ...overrides,
  };
  render(<CallListSelector {...props} />);
  return props;
}

describe("CallListSelector", () => {
  it("renders the two axes + sort, with the sector's callable count", () => {
    setup();
    expect(screen.getByText("To call now")).toBeTruthy();
    expect(screen.getByText("Par jour")).toBeTruthy();
    expect(screen.getByText("Par secteur")).toBeTruthy();
    expect(screen.getByText("Trier")).toBeTruthy();
    expect(screen.getByText("EMS romands")).toBeTruthy();
    expect(screen.getByText("Tout l'ICP")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
  });

  it("selecting a by-day view fires onSelectSystem (client filter)", () => {
    const p = setup();
    fireEvent.click(screen.getByText("Rappels dus"));
    expect(p.onSelectSystem).toHaveBeenCalledWith("callbacks_due");
  });

  it("clicking a sector list activates it; 'Tout l'ICP' clears the sprint", () => {
    const p = setup();
    fireEvent.click(screen.getByText("EMS romands"));
    expect(p.onActivateSector).toHaveBeenCalledWith("L1");
    fireEvent.click(screen.getByText("Tout l'ICP"));
    expect(p.onActivateAll).toHaveBeenCalled();
  });

  it("changing the sort fires onSortChange with the key", () => {
    const p = setup();
    fireEvent.click(screen.getByText("Rappels anciens"));
    expect(p.onSortChange).toHaveBeenCalledWith("oldest_callback");
  });

  it("the '+' reveals the phrase field and submits it to onCreate", () => {
    const p = setup();
    fireEvent.click(screen.getByTitle("Nouvelle liste par secteur"));
    fireEvent.change(screen.getByPlaceholderText("ex. les DG des EMS romands"), {
      target: { value: "les DG des cliniques" },
    });
    fireEvent.click(screen.getByText("Créer"));
    expect(p.onCreate).toHaveBeenCalledWith("les DG des cliniques");
  });

  it("hides the '+' when there is no campaign", () => {
    setup({ data: { ...data, hasCampaign: false } });
    expect(screen.queryByTitle("Nouvelle liste par secteur")).toBeNull();
  });
});
