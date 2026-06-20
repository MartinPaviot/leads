import { describe, it, expect } from "vitest";
import { formatAssignmentEvent, type AssignmentEvent } from "../assignment-trail";

/** B8 B3 — the assignment-event formatter (pure, injectable clock). */

const names = { ada: "Ada", bob: "Bob", cleo: "Cleo" };
const AT = "2026-06-19T10:00:00.000Z";
const atMs = Date.parse(AT);
const ev = (over: Partial<AssignmentEvent>): AssignmentEvent => ({ actorId: "ada", fromAssigneeId: null, toAssigneeId: "bob", at: AT, ...over });

describe("formatAssignmentEvent", () => {
  it("assign (null -> X)", () => {
    expect(formatAssignmentEvent(ev({ fromAssigneeId: null, toAssigneeId: "bob" }), names, atMs)).toBe(
      "Ada assigned this to Bob · just now",
    );
  });

  it("reassign (X -> Y)", () => {
    expect(formatAssignmentEvent(ev({ fromAssigneeId: "bob", toAssigneeId: "cleo" }), names, atMs)).toBe(
      "Ada reassigned this from Bob to Cleo · just now",
    );
  });

  it("unassign (X -> null)", () => {
    expect(formatAssignmentEvent(ev({ fromAssigneeId: "bob", toAssigneeId: null }), names, atMs)).toBe(
      "Ada unassigned this · just now",
    );
  });

  it("falls back to a non-empty name for an unknown actor / assignee", () => {
    const line = formatAssignmentEvent(ev({ actorId: "ghost", toAssigneeId: "spectre" }), names, atMs);
    expect(line).toBe("a teammate assigned this to a teammate · just now");
  });

  it("phrases relative time from the injected now", () => {
    expect(formatAssignmentEvent(ev({}), names, atMs + 2 * 3600_000)).toBe("Ada assigned this to Bob · 2h ago");
    expect(formatAssignmentEvent(ev({}), names, atMs + 3 * 86_400_000)).toBe("Ada assigned this to Bob · 3d ago");
  });
});
