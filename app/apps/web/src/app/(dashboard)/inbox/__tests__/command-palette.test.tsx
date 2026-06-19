// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CommandPalette, type PaletteCommand } from "../_command-palette";

/**
 * B6.1 — lock the SHIPPED palette behaviour so the B6 extension cannot regress
 * it: open renders commands, fuzzy-filters, ArrowDown+Enter runs the active row,
 * Esc closes. B6.2 — the new `shortcut` kbd glyph renders when set, is omitted
 * otherwise, and does NOT change fuzzy ranking (which matches on `label` only).
 */

function cmds(run: () => void = () => {}): PaletteCommand[] {
  return [
    { id: "a", label: "Mark current conversation done", hint: "Action", shortcut: "e", run },
    { id: "b", label: "Snooze current conversation for 1 day", hint: "Action", shortcut: "s", run },
    { id: "c", label: "Go to Attention", hint: "Lane", run },
  ];
}

describe("CommandPalette — B6.1 baseline behaviour", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<CommandPalette open={false} onClose={vi.fn()} commands={cmds()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders every command's label when open", () => {
    render(<CommandPalette open onClose={vi.fn()} commands={cmds()} />);
    expect(screen.getByText("Mark current conversation done")).toBeTruthy();
    expect(screen.getByText("Go to Attention")).toBeTruthy();
  });

  it("fuzzy-filters the list against the query and shows 'No matches' on a miss", () => {
    render(<CommandPalette open onClose={vi.fn()} commands={cmds()} />);
    const input = screen.getByPlaceholderText(/Search conversations and actions/i);
    fireEvent.change(input, { target: { value: "snooze" } });
    expect(screen.getByText("Snooze current conversation for 1 day")).toBeTruthy();
    expect(screen.queryByText("Go to Attention")).toBeNull();
    fireEvent.change(input, { target: { value: "zzzznomatch" } });
    expect(screen.getByText("No matches")).toBeTruthy();
  });

  it("ArrowDown then Enter runs the SECOND command and closes", () => {
    const onClose = vi.fn();
    const ran: string[] = [];
    const commands: PaletteCommand[] = [
      { id: "a", label: "Alpha", run: () => ran.push("a") },
      { id: "b", label: "Bravo", run: () => ran.push("b") },
    ];
    render(<CommandPalette open onClose={onClose} commands={commands} />);
    const input = screen.getByPlaceholderText(/Search conversations and actions/i);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(ran).toEqual(["b"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("Esc closes without running anything", () => {
    const onClose = vi.fn();
    const ran: string[] = [];
    render(<CommandPalette open onClose={onClose} commands={[{ id: "a", label: "Alpha", run: () => ran.push("a") }]} />);
    fireEvent.keyDown(screen.getByPlaceholderText(/Search conversations and actions/i), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(ran).toEqual([]);
  });

  it("clicking a row runs its command and closes", () => {
    const onClose = vi.fn();
    const ran: string[] = [];
    render(<CommandPalette open onClose={onClose} commands={[{ id: "a", label: "Alpha", run: () => ran.push("a") }]} />);
    fireEvent.click(screen.getByText("Alpha"));
    expect(ran).toEqual(["a"]);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("CommandPalette — B6.2 shortcut kbd glyph", () => {
  it("renders the shortcut key as a kbd glyph when set", () => {
    render(<CommandPalette open onClose={vi.fn()} commands={cmds()} />);
    const kbds = document.querySelectorAll("kbd");
    const glyphs = [...kbds].map((k) => k.textContent);
    expect(glyphs).toContain("e");
    expect(glyphs).toContain("s");
  });

  it("omits the kbd glyph for a command with no shortcut", () => {
    render(<CommandPalette open onClose={vi.fn()} commands={[{ id: "c", label: "Go to Attention", hint: "Lane", run: vi.fn() }]} />);
    expect(document.querySelector("kbd")).toBeNull();
    expect(screen.getByText("Lane")).toBeTruthy();
  });

  it("the kbd glyph does not change fuzzy ranking (label-only match)", () => {
    // Query matches the label 'Go to Attention' but equals no shortcut; the
    // shortcut-bearing rows must NOT rank above it via their glyph.
    render(<CommandPalette open onClose={vi.fn()} commands={cmds()} />);
    const input = screen.getByPlaceholderText(/Search conversations and actions/i);
    fireEvent.change(input, { target: { value: "attention" } });
    expect(screen.getByText("Go to Attention")).toBeTruthy();
    expect(screen.queryByText("Mark current conversation done")).toBeNull();
  });
});
