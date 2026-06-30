// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n/locale";
import { ListsMenu } from "../_lists-menu";

afterEach(cleanup);

const LISTS = [
  { id: "1", name: "Hot leads", count: 12 },
  { id: "2", name: "Warm", count: 5 },
  { id: "3", name: "Cold", count: 30 },
];

function setup(activeListId: string | null = null) {
  const onSelect = vi.fn();
  const onRename = vi.fn();
  const onDelete = vi.fn();
  render(
    <LocaleProvider initialLocale="en">
      <ListsMenu
        lists={LISTS}
        activeListId={activeListId}
        onSelect={onSelect}
        onRename={onRename}
        onDelete={onDelete}
      />
    </LocaleProvider>,
  );
  return { onSelect, onRename, onDelete };
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Account lists" }));
}

describe("ListsMenu — account-lists dropdown", () => {
  it("is closed by default and shows 'Lists' + the list count on the trigger", () => {
    setup();
    const trigger = screen.getByRole("button", { name: "Account lists" });
    expect(within(trigger).getByText("Lists")).toBeTruthy();
    expect(within(trigger).getByText("3")).toBeTruthy(); // total list count
    expect(screen.queryByText("Hot leads")).toBeNull(); // rows hidden until open
  });

  it("opens and lists every list with its member count", () => {
    setup();
    openMenu();
    expect(screen.getByText("Hot leads")).toBeTruthy();
    expect(screen.getByText("Warm")).toBeTruthy();
    expect(screen.getByText("Cold")).toBeTruthy();
  });

  it("scopes to a list on row click and closes", () => {
    const { onSelect } = setup();
    openMenu();
    fireEvent.click(screen.getByText("Hot leads"));
    expect(onSelect).toHaveBeenCalledWith("1");
    expect(screen.queryByText("Warm")).toBeNull(); // closed
  });

  it("surfaces the active list on the trigger and clears it via Leave", () => {
    const { onSelect } = setup("2");
    const trigger = screen.getByRole("button", { name: "Account lists" });
    expect(within(trigger).getByText("Warm")).toBeTruthy();
    openMenu();
    fireEvent.click(screen.getByText("Leave list"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("renames a list inline (commit on blur)", () => {
    const { onRename } = setup();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Rename list Hot leads" }));
    const input = screen.getByLabelText("Rename list Hot leads") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Hottest" } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith("1", "Hottest");
  });

  it("deletes a list from its row action", () => {
    const { onDelete } = setup();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Delete list Cold" }));
    expect(onDelete).toHaveBeenCalledWith("3", "Cold");
  });

  it("closes on Escape", () => {
    setup();
    openMenu();
    expect(screen.getByText("Hot leads")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Hot leads")).toBeNull();
  });
});
