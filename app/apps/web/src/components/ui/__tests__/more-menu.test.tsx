/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MoreMenu, type MoreMenuItem } from "../more-menu";

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /more/i }));
}

describe("MoreMenu", () => {
  it("renders a closed trigger; items appear on click", () => {
    render(<MoreMenu items={[{ label: "Excluded", onClick: vi.fn() }]} />);
    expect(screen.queryByRole("menu")).toBeNull();
    const trigger = screen.getByRole("button", { name: /more/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    openMenu();
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /excluded/i })).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("runs a plain item's onClick and closes the menu", () => {
    const onClick = vi.fn();
    render(<MoreMenu items={[{ label: "Describe ICP", onClick }]} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /describe icp/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("marks active items via data-checked (Excluded view on)", () => {
    render(
      <MoreMenu
        items={[
          { label: "Excluded", checked: true, onClick: vi.fn() },
          { label: "Archive", onClick: vi.fn() },
        ]}
      />,
    );
    openMenu();
    expect(
      screen.getByRole("menuitem", { name: /excluded/i }).getAttribute("data-checked"),
    ).toBe("true");
    expect(
      screen.getByRole("menuitem", { name: /archive/i }).getAttribute("data-checked"),
    ).toBeNull();
  });

  it("drills into a submenu, selects a choice, closes, and resets on reopen", () => {
    const pickAll = vi.fn();
    const pickOne = vi.fn();
    const items: MoreMenuItem[] = [
      { label: "Archive", onClick: vi.fn() },
      {
        label: "Source from",
        hint: "All profiles",
        submenu: [
          { label: "All profiles", checked: true, onClick: pickAll },
          { label: "Coeur romand (primary)", onClick: pickOne },
        ],
      },
    ];
    render(<MoreMenu items={items} />);
    openMenu();

    // Drill in — root items disappear, choices appear, nothing selected yet.
    fireEvent.click(screen.getByRole("menuitem", { name: /source from/i }));
    expect(screen.queryByRole("menuitem", { name: /archive/i })).toBeNull();
    const all = screen.getByRole("menuitemradio", { name: /all profiles/i });
    expect(all.getAttribute("aria-checked")).toBe("true");
    expect(pickAll).not.toHaveBeenCalled();

    // Choose — onClick fires once and the whole menu closes.
    fireEvent.click(screen.getByRole("menuitemradio", { name: /coeur romand/i }));
    expect(pickOne).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();

    // Reopen — back at the root list, not the drilled view.
    openMenu();
    expect(screen.getByRole("menuitem", { name: /archive/i })).toBeTruthy();
  });

  it("the drill-in Back header returns to the root list", () => {
    render(
      <MoreMenu
        items={[
          { label: "Archive", onClick: vi.fn() },
          { label: "Source from", submenu: [{ label: "A", onClick: vi.fn() }] },
        ]}
      />,
    );
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /source from/i }));
    fireEvent.click(screen.getByRole("button", { name: /source from/i }));
    expect(screen.getByRole("menuitem", { name: /archive/i })).toBeTruthy();
  });

  it("closes on an outside mousedown", () => {
    render(
      <div>
        <span data-testid="outside">elsewhere</span>
        <MoreMenu items={[{ label: "Archive", onClick: vi.fn() }]} />
      </div>,
    );
    openMenu();
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders the hint line under the label", () => {
    render(
      <MoreMenu
        items={[{ label: "Source from", hint: "Coeur romand", submenu: [] }]}
      />,
    );
    openMenu();
    expect(screen.getByText("Coeur romand")).toBeTruthy();
  });
});
