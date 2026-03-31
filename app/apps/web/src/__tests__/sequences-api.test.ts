import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  sequences: { id: "id" },
  sequenceSteps: { sequenceId: "sequence_id", stepNumber: "step_number" },
  sequenceEnrollments: { sequenceId: "sequence_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";

const seqModule = await import("@/app/api/sequences/route");

describe("Sequences API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/sequences", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const res = await seqModule.GET();
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/sequences", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const req = new Request("http://localhost/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      });

      const res = await seqModule.POST(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 when name is empty", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

      const req = new Request("http://localhost/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });

      const res = await seqModule.POST(req);
      expect(res.status).toBe(400);
    });

    it("creates a sequence successfully", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

      const returningFn = vi.fn().mockResolvedValue([{ id: "seq1", name: "Cold Outreach" }]);
      const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
      vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);

      const req = new Request("http://localhost/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Cold Outreach" }),
      });

      const res = await seqModule.POST(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.sequence.name).toBe("Cold Outreach");
    });
  });
});
