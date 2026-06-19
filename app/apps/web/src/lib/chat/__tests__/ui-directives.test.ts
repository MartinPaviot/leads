import { describe, it, expect } from "vitest";
import {
  parseUiDirective,
  navigateDirective,
  composeEmailDirective,
  invokeActionDirective,
  UI_DIRECTIVE_KEY,
  type InvokeActionDirective,
} from "../ui-directives";

/**
 * The directive contract is the single source of truth shared by the server
 * tools that EMIT directives and the client hook that PARSES them. These guard
 * the round-trip + the security boundary (only internal paths navigate).
 */

describe("navigateDirective ↔ parseUiDirective", () => {
  it("round-trips an internal navigation with a label", () => {
    const result = { opened: { id: "a1" }, ...navigateDirective("/accounts/a1", "Acme Corp") };
    expect(parseUiDirective(result)).toEqual({
      kind: "navigate",
      path: "/accounts/a1",
      label: "Acme Corp",
    });
  });

  it("round-trips without a label", () => {
    expect(parseUiDirective(navigateDirective("/opportunities/d9"))).toEqual({
      kind: "navigate",
      path: "/opportunities/d9",
    });
  });

  it("preserves hyphenated UUID paths (no over-eager rejection)", () => {
    const path = "/contacts/2f1c8e4a-9b3d-4c7e-8a1f-0123456789ab";
    expect(parseUiDirective(navigateDirective(path))).toEqual({ kind: "navigate", path });
  });
});

describe("parseUiDirective — navigation security", () => {
  it("rejects absolute external URLs", () => {
    for (const path of ["https://evil.com", "http://x.test/path", "javascript:alert(1)"]) {
      expect(parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "navigate", path } })).toBeNull();
    }
  });

  it("rejects protocol-relative and scheme-bearing paths", () => {
    for (const path of ["//evil.com", "/x://y", "/a\tb", "/a b"]) {
      expect(parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "navigate", path } })).toBeNull();
    }
  });

  it("rejects a path that isn't rooted at /", () => {
    expect(parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "navigate", path: "accounts/1" } })).toBeNull();
    expect(parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "navigate", path: 42 } })).toBeNull();
  });
});

describe("composeEmailDirective ↔ parseUiDirective", () => {
  it("round-trips a full draft", () => {
    const draft = {
      to: "jane@acme.com",
      cc: "cfo@acme.com",
      subject: "Next steps",
      body: "Hi Jane, ...",
      contactId: "c1",
      dealId: "d1",
    };
    expect(parseUiDirective(composeEmailDirective(draft))).toEqual({ kind: "composeEmail", draft });
  });

  it("defaults `to` to empty string when omitted but keeps subject+body", () => {
    const parsed = parseUiDirective(
      composeEmailDirective({ to: "", subject: "S", body: "B" }),
    );
    expect(parsed).toEqual({ kind: "composeEmail", draft: { to: "", subject: "S", body: "B" } });
  });

  it("drops empty optional fields rather than emitting empty strings", () => {
    const parsed = parseUiDirective({
      [UI_DIRECTIVE_KEY]: {
        kind: "composeEmail",
        draft: { to: "a@b.c", subject: "S", body: "B", cc: "", contactId: "  " },
      },
    });
    expect(parsed).toEqual({ kind: "composeEmail", draft: { to: "a@b.c", subject: "S", body: "B" } });
  });

  it("returns null when subject or body is missing/blank", () => {
    expect(
      parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "composeEmail", draft: { to: "a@b.c", body: "B" } } }),
    ).toBeNull();
    expect(
      parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "composeEmail", draft: { subject: "  ", body: "B" } } }),
    ).toBeNull();
  });
});

describe("parseUiDirective — malformed / absent", () => {
  it("returns null for results carrying no directive", () => {
    expect(parseUiDirective({ contacts: [] })).toBeNull();
    expect(parseUiDirective({})).toBeNull();
  });

  it("returns null for non-object results", () => {
    for (const v of [null, undefined, "x", 7, true, []]) {
      expect(parseUiDirective(v)).toBeNull();
    }
  });

  it("returns null for an unknown directive kind", () => {
    expect(parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "explode" } })).toBeNull();
    expect(parseUiDirective({ [UI_DIRECTIVE_KEY]: "not-an-object" })).toBeNull();
  });
});

describe("invokeActionDirective ↔ parseUiDirective (CLE-03)", () => {
  it("builder places the directive under the _uiDirective key", () => {
    const d = invokeActionDirective("inv-1", "opportunities.moveStage", { dealId: "d1", stage: "won" }, true);
    expect(d[UI_DIRECTIVE_KEY]).toEqual({
      kind: "invokeAction",
      invocationId: "inv-1",
      actionId: "opportunities.moveStage",
      params: { dealId: "d1", stage: "won" },
      requireConfirm: true,
    });
  });

  it("round-trips a well-formed invokeAction (ignoring sibling human fields)", () => {
    const result = { ...invokeActionDirective("inv-1", "a.b", { x: 1 }, false), human: "ran it" };
    expect(parseUiDirective(result)).toEqual({
      kind: "invokeAction",
      invocationId: "inv-1",
      actionId: "a.b",
      params: { x: 1 },
      requireConfirm: false,
    });
  });

  it("rejects a missing invocationId or actionId", () => {
    expect(
      parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "invokeAction", actionId: "a.b", params: {}, requireConfirm: false } }),
    ).toBeNull();
    expect(
      parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "invokeAction", invocationId: "i", params: {}, requireConfirm: false } }),
    ).toBeNull();
  });

  it("rejects non-object params and non-boolean requireConfirm", () => {
    expect(
      parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "invokeAction", invocationId: "i", actionId: "a.b", params: "nope", requireConfirm: false } }),
    ).toBeNull();
    expect(
      parseUiDirective({ [UI_DIRECTIVE_KEY]: { kind: "invokeAction", invocationId: "i", actionId: "a.b", params: {}, requireConfirm: "yes" } }),
    ).toBeNull();
  });
});

describe("InvokeActionDirective alias (CLE-05 Task 0)", () => {
  it("is the invokeAction arm with the four fields and a boolean requireConfirm", () => {
    // Compiles only if the alias resolves to the invokeAction arm of the union.
    const d = {
      kind: "invokeAction",
      invocationId: "i",
      actionId: "a.b",
      params: { x: 1 },
      requireConfirm: true,
    } satisfies InvokeActionDirective;
    const rc: boolean = d.requireConfirm;
    expect(rc).toBe(true);
    expect(d.kind).toBe("invokeAction");
  });
});
