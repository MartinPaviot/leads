import { describe, it, expect, vi } from "vitest";

const { mockRows } = vi.hoisted(() => ({
  mockRows: [
    { id: "u1", email: "marie@x.com", firstName: "Marie", lastName: "Curie" },
    { id: "u2", email: "paul@x.com", firstName: null, lastName: null },
    // A removed/deactivated member — must still be NAMED (no deactivatedAt filter).
    { id: "u3", email: "gone@x.com", firstName: "Gone", lastName: "User" },
  ] as Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null }>,
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(mockRows) }) }),
  },
}));

import { getTenantMemberNames } from "../member-names";

describe("getTenantMemberNames", () => {
  it("composes first+last, falls back to email, includes deactivated members", async () => {
    const map = await getTenantMemberNames("tenant-1");
    expect(map.get("u1")).toBe("Marie Curie");
    expect(map.get("u2")).toBe("paul@x.com"); // names null → email fallback
    expect(map.get("u3")).toBe("Gone User"); // deactivated still resolvable
    expect(map.size).toBe(3);
  });
});
