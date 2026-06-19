import { describe, it, expect } from "vitest";
import { resolveAssignee, INBOX_ASSIGNMENT_ENTITY_TYPE } from "@/lib/inbox/assignment";

const members = [
  { id: "u1", name: "Ada" },
  { id: "u2", name: "Bob" },
];

describe("resolveAssignee (INBOX-X01)", () => {
  it("returns null when unassigned", () => {
    expect(resolveAssignee(null, members)).toBeNull();
  });

  it("resolves an id to its member", () => {
    expect(resolveAssignee("u2", members)).toEqual({ id: "u2", name: "Bob" });
  });

  it("falls back for an id no longer in the member list", () => {
    expect(resolveAssignee("gone", members)).toEqual({ id: "gone", name: "Unknown member" });
  });
});

describe("assignment entity type", () => {
  it("is a synthetic entity, not a CRM one", () => {
    expect(INBOX_ASSIGNMENT_ENTITY_TYPE).toBe("inbox_assignment");
  });
});
