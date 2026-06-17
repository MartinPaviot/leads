// @vitest-environment happy-dom
/**
 * Render test for the "To call now" list controls (T5/T6/T8, _specs/call-lists).
 * The selector was compacted from three stacked sections into two lines: the
 * by-day filter is visible (segmented), while the audience (sector) list and the
 * sort options moved into dropdowns. The test opens those menus before asserting
 * — the component-level proof the spec asks for (the end-to-end DB flow is
 * exercised in a preview/live run).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CallListSelector, type CallListsData } from "@/app/(dashboard)/call-mode/_list-selector";

afterEach(cleanup);

const data: CallListsData = {
  hasCampaign: true,
  activeListId: "L1",
  system: [
    { id: "today", name: "Tous", count: 12 },
    { id: "callbacks_due", name: "Rappels", count: 5 },
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
  it("renders the title, the by-day filter, and the active audience on its button", () => {
    setup();
    expect(screen.getByText("To call now")).toBeTruthy();
    // By-day filter is visible (segmented), no dropdown needed.
    expect(screen.getByText("Tous")).toBeTruthy();
    expect(screen.getByText("Rappels")).toBeTruthy();
    expect(screen.getByText("Nouveaux")).toBeTruthy();
    // Active audience (activeListId L1) shows on the scope button.
    expect(screen.getByText("EMS romands")).toBeTruthy();
  });

  it("the audience dropdown lists the sector with its callable count + 'Tout l'ICP'", () => {
    setup();
    fireEvent.click(screen.getByTitle(/^Audience/));
    expect(screen.getByText("Tout l'ICP")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy(); // callable count
  });

  it("selecting a by-day view fires onSelectSystem (client filter)", () => {
    const p = setup();
    fireEvent.click(screen.getByText("Rappels"));
    expect(p.onSelectSystem).toHaveBeenCalledWith("callbacks_due");
  });

  it("activating a sector / 'Tout l'ICP' fires the right callback", () => {
    const p = setup();
    fireEvent.click(screen.getByTitle(/^Audience/));
    // The active name is on the button too; the popover row is the last match.
    const matches = screen.getAllByText("EMS romands");
    fireEvent.click(matches[matches.length - 1]);
    expect(p.onActivateSector).toHaveBeenCalledWith("L1");

    fireEvent.click(screen.getByTitle(/^Audience/)); // reopen (row click closed it)
    fireEvent.click(screen.getByText("Tout l'ICP"));
    expect(p.onActivateAll).toHaveBeenCalled();
  });

  it("changing the sort fires onSortChange with the key", () => {
    const p = setup();
    fireEvent.click(screen.getByTitle("Trier : Fit ICP"));
    fireEvent.click(screen.getByText("Rappels anciens"));
    expect(p.onSortChange).toHaveBeenCalledWith("oldest_callback");
  });

  it("the audience dropdown reveals the phrase field and submits it to onCreate", () => {
    const p = setup();
    fireEvent.click(screen.getByTitle(/^Audience/));
    fireEvent.click(screen.getByTitle("Nouvelle liste par secteur"));
    fireEvent.change(screen.getByPlaceholderText("ex. les DG des EMS romands"), {
      target: { value: "les DG des cliniques" },
    });
    fireEvent.click(screen.getByText("Créer"));
    expect(p.onCreate).toHaveBeenCalledWith("les DG des cliniques");
  });

  it("hides the create affordance when there is no campaign", () => {
    setup({ data: { ...data, hasCampaign: false } });
    fireEvent.click(screen.getByTitle(/^Audience/));
    expect(screen.queryByTitle("Nouvelle liste par secteur")).toBeNull();
  });
});
