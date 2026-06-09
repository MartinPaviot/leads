import { describe, it, expect } from "vitest";
import { deriveSurface } from "../surface-from-path";

describe("deriveSurface", () => {
  it("treats root and /home as the global workspace surface", () => {
    for (const p of ["/", "/home"]) {
      const s = deriveSurface(p);
      expect(s.contextType).toBeUndefined();
      expect(s.icon).toBe("globe");
      expect(s.hidden).toBeFalsy();
    }
  });

  it("hides the dock on the full chat page", () => {
    expect(deriveSurface("/chat").hidden).toBe(true);
    expect(deriveSurface("/chat?thread=abc").hidden).toBe(true);
  });

  it("scopes entity detail routes to the right contextType + id", () => {
    expect(deriveSurface("/accounts/abc-123")).toMatchObject({
      contextType: "account",
      contextId: "abc-123",
      label: "Account",
      icon: "building",
    });
    expect(deriveSurface("/contacts/c1")).toMatchObject({ contextType: "contact", contextId: "c1" });
    expect(deriveSurface("/opportunities/d1")).toMatchObject({ contextType: "deal", contextId: "d1" });
    expect(deriveSurface("/meetings/m1")).toMatchObject({ contextType: "meeting", contextId: "m1" });
  });

  it("scopes known list routes to a list surface seeded with the resource", () => {
    expect(deriveSurface("/accounts")).toMatchObject({ contextType: "list", contextId: "accounts", label: "Accounts" });
    expect(deriveSurface("/contacts")).toMatchObject({ contextType: "list", contextId: "contacts" });
    expect(deriveSurface("/opportunities")).toMatchObject({ contextType: "list", contextId: "opportunities", label: "Pipeline" });
    expect(deriveSurface("/meetings")).toMatchObject({ contextType: "list", contextId: "meetings" });
    expect(deriveSurface("/tasks")).toMatchObject({ contextType: "list", contextId: "tasks" });
    expect(deriveSurface("/sequences")).toMatchObject({ contextType: "list", contextId: "sequences" });
  });

  it("does NOT treat reserved subpaths as record ids", () => {
    // /accounts/new is the create form, not an account detail.
    expect(deriveSurface("/accounts/new")).toMatchObject({ contextType: "list", contextId: "accounts" });
  });

  it("labels known global pages but keeps them global (no contextType)", () => {
    const settings = deriveSurface("/settings/profile");
    expect(settings.contextType).toBeUndefined();
    expect(settings.label).toBe("Settings");

    const calls = deriveSurface("/call-mode");
    expect(calls.contextType).toBeUndefined();
    expect(calls.label).toBe("Call Mode");
  });

  it("falls back to a generic global surface for unknown routes", () => {
    const s = deriveSurface("/objects/widgets/xyz");
    expect(s.contextType).toBeUndefined();
    expect(s.label).toBe("Workspace");
  });

  it("normalises trailing slashes, query, and hash", () => {
    expect(deriveSurface("/accounts/")).toMatchObject({ contextType: "list", contextId: "accounts" });
    expect(deriveSurface("/accounts/abc?tab=notes#top")).toMatchObject({ contextType: "account", contextId: "abc" });
  });

  it("handles null/empty pathname as global", () => {
    expect(deriveSurface(null).contextType).toBeUndefined();
    expect(deriveSurface(undefined).contextType).toBeUndefined();
    expect(deriveSurface("").contextType).toBeUndefined();
  });
});
