/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ColumnPicker, type PickerCategory } from "../column-picker";

const categories: PickerCategory[] = [
  { key: "tech", label: "Technologies", group: "firmographic", source: "Enrichment" },
];

describe("ColumnPicker controlled mode", () => {
  it("uncontrolled: trigger toggles the panel (existing behavior)", () => {
    render(
      <ColumnPicker categories={categories} visible={new Set()} onToggle={vi.fn()} />,
    );
    const trigger = screen.getByRole("button", { name: /categories/i });
    expect(screen.queryByText(/add category columns/i)).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByText(/add category columns/i)).toBeTruthy();
  });

  it("hideTrigger renders no trigger button", () => {
    render(
      <ColumnPicker
        categories={categories}
        visible={new Set()}
        onToggle={vi.fn()}
        open={false}
        onOpenChange={vi.fn()}
        hideTrigger
      />,
    );
    expect(screen.queryByRole("button", { name: /categories/i })).toBeNull();
  });

  it("controlled: open prop shows the panel; outside mousedown reports close", () => {
    const onOpenChange = vi.fn();
    render(
      <div>
        <span data-testid="outside">elsewhere</span>
        <ColumnPicker
          categories={categories}
          visible={new Set()}
          onToggle={vi.fn()}
          open
          onOpenChange={onOpenChange}
          hideTrigger
        />
      </div>,
    );
    expect(screen.getByText(/add category columns/i)).toBeTruthy();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders an unavailable category disabled and ignores clicks", () => {
    const onToggle = vi.fn();
    render(
      <ColumnPicker
        categories={[
          { key: "tech", label: "Technologies", group: "firmographic", source: "Enrichment" },
          {
            key: "signal:funding_crunchbase",
            label: "Funding (Crunchbase)",
            group: "signal",
            source: "Not available yet",
            available: false,
          },
        ]}
        visible={new Set()}
        onToggle={onToggle}
        open
        onOpenChange={vi.fn()}
        hideTrigger
      />,
    );
    const row = screen.getByRole("button", { name: /funding \(crunchbase\)/i }) as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    fireEvent.click(row);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows a column already on the page as checked and reports a click to uncheck it", () => {
    const onToggle = vi.fn();
    render(
      <ColumnPicker
        categories={[
          { key: "custom-field:f1", label: "Account tier", group: "custom", source: "Custom field" },
        ]}
        visible={new Set(["custom-field:f1"])}
        onToggle={onToggle}
        open
        onOpenChange={vi.fn()}
        hideTrigger
      />,
    );
    const row = screen.getByRole("button", { name: /account tier/i });
    // The checkmark icon is the "this column is on" affordance.
    expect(row.querySelector("svg")).toBeTruthy();
    fireEvent.click(row);
    expect(onToggle).toHaveBeenCalledWith("custom-field:f1");
  });
});
