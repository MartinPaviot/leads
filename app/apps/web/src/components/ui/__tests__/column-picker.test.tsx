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
});
