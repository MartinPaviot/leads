import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerShortcut,
  unregisterShortcut,
  getRegisteredShortcuts,
  subscribeShortcuts,
  _resetShortcutRegistry,
} from "@/lib/hotkey-registry";

beforeEach(() => {
  _resetShortcutRegistry();
});

describe("hotkey-registry", () => {
  it("stores a registered shortcut and returns an unregister fn", () => {
    const unregister = registerShortcut({
      combo: "cmd+k",
      description: "Command palette",
      group: "General",
    });
    expect(getRegisteredShortcuts()).toHaveLength(1);
    unregister();
    expect(getRegisteredShortcuts()).toHaveLength(0);
  });

  it("deduplicates by combo (last registration wins)", () => {
    registerShortcut({ combo: "c", description: "Create", group: "General" });
    registerShortcut({ combo: "c", description: "Compose", group: "Email" });
    const all = getRegisteredShortcuts();
    expect(all).toHaveLength(1);
    expect(all[0].description).toBe("Compose");
  });

  it("notifies subscribers on register/unregister", () => {
    const listener = vi.fn();
    const unsub = subscribeShortcuts(listener);
    const unreg = registerShortcut({
      combo: "/",
      description: "Search",
      group: "Nav",
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unreg();
    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
  });

  it("unregisterShortcut removes by combo", () => {
    registerShortcut({ combo: "?", description: "Help", group: "Help" });
    unregisterShortcut("?");
    expect(getRegisteredShortcuts()).toHaveLength(0);
  });
});
