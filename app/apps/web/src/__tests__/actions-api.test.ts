import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
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
  sql: vi.fn(),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { db } from "@/db";
import { generateObject } from "ai";

const { GET } = await import("@/app/api/actions/route");

describe("GET /api/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("generates prioritized actions", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    // Mock db selects
    const limitFn = vi.fn().mockResolvedValue([]);
    const fromFn = vi.fn().mockReturnValue({ limit: limitFn });
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
