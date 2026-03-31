import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  sequences: { id: "id" },
  sequenceSteps: { sequenceId: "sequence_id", stepNumber: "step_number" },
  sequenceEnrollments: { sequenceId: "sequence_id", contactId: "contact_id" },
  contacts: { email: "email", score: "score" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: vi.fn(),
  and: vi.fn(),
  isNotNull: vi.fn(),
  gte: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";

const { POST } = await import("@/app/api/sequences/[id]/autopilot/route");

describe("POST /api/sequences/[id]/autopilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/sequences/seq1/autopilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "seq1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when sequence not found", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/sequences/seq1/autopilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "seq1" }) });
    expect(res.status).toBe(404);
  });
});
