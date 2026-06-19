import { describe, it, expect } from "vitest";
import { parseUiDirective, navigateDirective, UI_DIRECTIVE_KEY } from "../ui-directives";

/**
 * CLE-15 — the one additive contract field: `navigate.highlight?`. These guard
 * that it round-trips when well-formed, is DROPPED (never invalidates the
 * navigate) when malformed, and that a navigate with no highlight parses exactly
 * as before (E-11 / AC-12).
 */

describe("navigateDirective(path, label, highlight) — builder", () => {
  it("emits a well-formed highlight anchor (entityId + scope)", () => {
    const d = navigateDirective("/accounts/a1", "Acme", { entityId: "a1", scope: "accounts" });
    expect(d[UI_DIRECTIVE_KEY]).toEqual({
      kind: "navigate",
      path: "/accounts/a1",
      label: "Acme",
      highlight: { entityId: "a1", scope: "accounts" },
    });
  });

  it("strips unknown keys and keeps only the known anchor fields", () => {
    const d = navigateDirective("/opportunities/d1", undefined, {
      entityId: "d1",
      scope: "opportunities",
      field: "stage",
      focus: true,
      // @ts-expect-error — unknown key must be stripped at the builder
      bogus: "x",
    });
    expect(d[UI_DIRECTIVE_KEY]).toEqual({
      kind: "navigate",
      path: "/opportunities/d1",
      highlight: { entityId: "d1", scope: "opportunities", field: "stage", focus: true },
    });
  });

  it("drops a highlight with no usable entityId but still emits the navigate", () => {
    const d = navigateDirective("/accounts", "Accounts", { entityId: "  " });
    expect(d[UI_DIRECTIVE_KEY]).toEqual({ kind: "navigate", path: "/accounts", label: "Accounts" });
  });
});

describe("parseUiDirective — navigate.highlight", () => {
  it("accepts a navigate with a well-formed highlight", () => {
    const result = parseUiDirective(navigateDirective("/accounts/a1", "Acme", { entityId: "a1", scope: "accounts" }));
    expect(result).toEqual({
      kind: "navigate",
      path: "/accounts/a1",
      label: "Acme",
      highlight: { entityId: "a1", scope: "accounts" },
    });
  });

  it("only sets focus when it is exactly boolean true", () => {
    const ok = parseUiDirective({
      [UI_DIRECTIVE_KEY]: { kind: "navigate", path: "/x", highlight: { entityId: "e1", focus: true } },
    });
    expect(ok).toEqual({ kind: "navigate", path: "/x", highlight: { entityId: "e1", focus: true } });
    const noFocus = parseUiDirective({
      [UI_DIRECTIVE_KEY]: { kind: "navigate", path: "/x", highlight: { entityId: "e1", focus: "yes" } },
    });
    expect(noFocus).toEqual({ kind: "navigate", path: "/x", highlight: { entityId: "e1" } });
  });

  it("DROPS a malformed highlight (number / empty entityId / missing entityId) but KEEPS the navigate (E-11)", () => {
    for (const bad of [123, "x", { scope: "accounts" }, { entityId: "" }, { entityId: "   " }, null]) {
      const parsed = parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "navigate", path: "/accounts/a1", highlight: bad } });
      expect(parsed).toEqual({ kind: "navigate", path: "/accounts/a1" });
    }
  });

  it("a navigate with NO highlight parses byte-identically to today (regression)", () => {
    expect(parseUiDirective(navigateDirective("/opportunities/d9"))).toEqual({ kind: "navigate", path: "/opportunities/d9" });
    expect(parseUiDirective(navigateDirective("/accounts/a1", "Acme"))).toEqual({
      kind: "navigate",
      path: "/accounts/a1",
      label: "Acme",
    });
  });

  it("never throws on a fully malformed result and still returns null (AC-12)", () => {
    expect(parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "navigate", path: "//evil.com", highlight: { entityId: "x" } } })).toBeNull();
    expect(parseUiDirective({ [UI_DIRECTIVE_KEY]: "nope" })).toBeNull();
  });
});
