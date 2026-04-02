import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  deals: {},
  companies: {},
  contacts: {},
  sequenceEnrollments: {},
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => "mock-anthropic-model"),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mock-openai-model"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: vi.fn(),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { generateObject } from "ai";

const { GET } = await import("@/app/api/actions/route");

describe("GET /api/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("generates prioritized actions", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1" });

    // Mock db selects — route does 4 queries:
    // 1. deals: .where().limit() -> []
    // 2. companies: .where() -> []
    // 3. contacts: .where() -> []
    // 4. sequenceEnrollments: no .where() -> []
    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn, then: (cb: (v: unknown) => void) => Promise.resolve([]).then(cb) });
    const fromFn = vi.fn()
      .mockReturnValueOnce({ where: whereFn })   // deals (has .where().limit())
      .mockReturnValueOnce({ where: whereFn })   // companies (has .where())
      .mockReturnValueOnce({ where: whereFn })   // contacts (has .where())
      .mockResolvedValueOnce([]);                 // sequenceEnrollments (no .where)
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    vi.mocked(generateObject).mockResolvedValue({
      object: {
        actions: [
          {
            action: "Build your TAM",
            why: "No companies in pipeline yet",
            dealName: null,
            priority: "critical",
            category: "research",
          },
          {
            action: "Create cold outreach sequence",
            why: "No active sequences to engage prospects",
            dealName: null,
            priority: "high",
            category: "follow_up",
          },
        ],
      },
    } as never);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.actions).toHaveLength(2);
    expect(data.actions[0].priority).toBe("critical");
  });
});
