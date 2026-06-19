// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ColumnFilter } from "@/components/ui/column-filter";

afterEach(() => cleanup());

/**
 * The header column filter shows "(N)" next to each enum value so the user has
 * an order of magnitude before applying a filter (Industry / Geography / Size /
 * Score / Stage …). Counts are an optional, value→N map; when absent the menu
 * renders exactly as before.
 */
describe("ColumnFilter — per-value counts", () => {
  const baseProps = {
    label: "Industry",
    kind: "enum" as const,
    options: ["Healthcare", "Technology", "Education"],
    state: undefined,
    onChange: () => {},
    onOpenChange: () => {},
  };

  it("renders (N) next to each value when counts are provided", () => {
    const { container } = render(
      <ColumnFilter
        {...baseProps}
        open
        counts={{ Healthcare: 120, Technology: 1234, Education: 7 }}
      />,
    );
    // Every option carries its own parenthesised count. The thousands separator
    // is locale-dependent (ICU build), so match it separator-agnostically.
    const text = container.textContent ?? "";
    expect(text).toContain("(120)");
    expect(text).toContain("(7)");
    expect(text).toMatch(/\(1[,.\s]?234\)/);
  });

  it("omits the badge for a value with no count, and renders none without a counts map", () => {
    const { container, queryByText } = render(
      <ColumnFilter {...baseProps} open counts={{ Healthcare: 5 }} />,
    );
    expect(queryByText("(5)")).toBeTruthy();
    // Technology / Education have no entry in the map → no parenthesis.
    expect(container.textContent).not.toContain("(0)");
    expect(container.textContent).toContain("Technology");

    cleanup();
    const { container: c2 } = render(<ColumnFilter {...baseProps} open />);
    // No counts prop at all → no parentheses anywhere, options still listed.
    expect(c2.textContent).toContain("Healthcare");
    expect(c2.textContent).not.toMatch(/\(\d/);
  });

  it("does not show counts for a text-kind filter", () => {
    const { container } = render(
      <ColumnFilter
        {...baseProps}
        kind="text"
        open
        counts={{ Healthcare: 120 }}
      />,
    );
    expect(container.textContent).not.toContain("(120)");
  });
});
