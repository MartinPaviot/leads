// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { AddToListModal } from "../_add-to-list-modal";

afterEach(() => cleanup());

const LISTS = [
  { id: "l1", name: "Hot leads", count: 12 },
  { id: "l2", name: "Romandie SaaS", count: 3 },
];

describe("AddToListModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <AddToListModal open={false} onClose={() => {}} selectedCount={2} lists={[]} busy={false} onCreate={() => {}} onAddToExisting={() => {}} />,
    );
    expect(container.textContent).toBe("");
  });

  // The modal localizes via useT(); rendered without a LocaleProvider it
  // resolves to the default locale (EN), so assertions are on the EN strings.
  it("shows the selected count and creates a list from the trimmed name", () => {
    const onCreate = vi.fn();
    const { getByPlaceholderText, getByText, container } = render(
      <AddToListModal open onClose={() => {}} selectedCount={1} lists={[]} busy={false} onCreate={onCreate} onAddToExisting={() => {}} />,
    );
    expect(container.textContent).toContain("1 account"); // singular (EN)
    const input = getByPlaceholderText(/Hot leads Q3/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Hot leads Q3  " } });
    fireEvent.click(getByText("Create"));
    expect(onCreate).toHaveBeenCalledWith("Hot leads Q3");
  });

  it("does not fire create on an empty / whitespace-only name", () => {
    const onCreate = vi.fn();
    const { getByText, getByPlaceholderText } = render(
      <AddToListModal open onClose={() => {}} selectedCount={5} lists={[]} busy={false} onCreate={onCreate} onAddToExisting={() => {}} />,
    );
    fireEvent.change(getByPlaceholderText(/Hot leads Q3/i), { target: { value: "   " } });
    fireEvent.click(getByText("Create"));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("lists existing lists with counts and adds the selection to the clicked one", () => {
    const onAddToExisting = vi.fn();
    const { getByText, container } = render(
      <AddToListModal open onClose={() => {}} selectedCount={3} lists={LISTS} busy={false} onCreate={() => {}} onAddToExisting={onAddToExisting} />,
    );
    expect(container.textContent).toContain("3 accounts"); // plural (EN)
    expect(getByText("Romandie SaaS")).toBeTruthy();
    fireEvent.click(getByText("Hot leads"));
    expect(onAddToExisting).toHaveBeenCalledWith("l1");
  });

  it("disables actions while busy", () => {
    const onCreate = vi.fn();
    const onAddToExisting = vi.fn();
    const { getByText } = render(
      <AddToListModal open onClose={() => {}} selectedCount={2} lists={LISTS} busy onCreate={onCreate} onAddToExisting={onAddToExisting} />,
    );
    // Existing-list buttons are disabled; clicking is a no-op.
    fireEvent.click(getByText("Hot leads"));
    expect(onAddToExisting).not.toHaveBeenCalled();
  });
});
