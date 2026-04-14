import { describe, it, expect } from "vitest";
import { parseCombo } from "@/hooks/use-hotkey";

describe("parseCombo", () => {
  it("parses a plain key", () => {
    expect(parseCombo("/")).toEqual({ key: "/" });
    expect(parseCombo("Escape")).toEqual({ key: "escape" });
  });

  it("parses cmd/mod/meta as the portable modifier", () => {
    expect(parseCombo("cmd+k")).toEqual({ key: "k", cmd: true });
    expect(parseCombo("mod+k")).toEqual({ key: "k", cmd: true });
    expect(parseCombo("meta+k")).toEqual({ key: "k", cmd: true });
  });

  it("treats ctrl as strictCtrl separate from cmd", () => {
    expect(parseCombo("ctrl+k")).toEqual({ key: "k", strictCtrl: true });
  });

  it("stacks shift + alt modifiers", () => {
    expect(parseCombo("cmd+shift+p")).toEqual({
      key: "p",
      cmd: true,
      shift: true,
    });
    expect(parseCombo("alt+option+n")).toEqual({ key: "n", alt: true });
  });

  it("is case-insensitive on modifiers and key", () => {
    expect(parseCombo("Cmd+K")).toEqual({ key: "k", cmd: true });
  });
});
