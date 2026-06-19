import { describe, it, expect } from "vitest";
import { normalizeKey, resolveKey, findConflicts } from "@/lib/inbox/keybindings";

describe("normalizeKey (INBOX-K07)", () => {
  it("builds a canonical chord with modifiers in a stable order", () => {
    expect(normalizeKey({ key: "E", shiftKey: true })).toBe("shift+e");
    expect(normalizeKey({ key: "k", ctrlKey: true, metaKey: true })).toBe("ctrl+meta+k");
    expect(normalizeKey({ key: "?" })).toBe("?");
  });
});

describe("resolveKey", () => {
  const bindings = [
    { keys: "e", action: "done" },
    { keys: "shift+e", action: "archive" },
  ];
  it("maps a chord to its action", () => {
    expect(resolveKey(bindings, "shift+e")).toBe("archive");
    expect(resolveKey(bindings, "e")).toBe("done");
  });
  it("returns null for an unbound chord", () => {
    expect(resolveKey(bindings, "z")).toBeNull();
  });
});

describe("findConflicts", () => {
  it("flags two actions bound to the same chord", () => {
    const conflicts = findConflicts([
      { keys: "e", action: "done" },
      { keys: "e", action: "expand" },
      { keys: "r", action: "reply" },
    ]);
    expect(conflicts).toEqual([{ keys: "e", actions: ["done", "expand"] }]);
  });
});
