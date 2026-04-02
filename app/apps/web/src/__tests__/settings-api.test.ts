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
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  tenants: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";

const knowledgeModule = await import("@/app/api/settings/knowledge/route");
const workspaceModule = await import("@/app/api/settings/workspace/route");
const stagesModule = await import("@/app/api/settings/stages/route");

describe("Settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/settings/knowledge", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getAuthContext).mockResolvedValue(null);
      const res = await knowledgeModule.GET();
      expect(res.status).toBe(401);
    });

    it("returns knowledge topics", async () => {
      vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1" });

      const limitFn = vi.fn().mockResolvedValue([{
        settings: { knowledge: [{ id: "k1", topic: "ICP", content: "B2B SaaS" }] },
      }]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

      const res = await knowledgeModule.GET();
      const data = await res.json();
      expect(data.knowledge).toHaveLength(1);
      expect(data.knowledge[0].topic).toBe("ICP");
    });
  });

  describe("POST /api/settings/knowledge", () => {
    it("returns 400 when topic empty", async () => {
      vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1" });

      const req = new Request("http://localhost/api/settings/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: "", content: "test" }),
      });

      const res = await knowledgeModule.POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/settings/workspace", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getAuthContext).mockResolvedValue(null);
      const res = await workspaceModule.GET();
      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/settings/stages", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(getAuthContext).mockResolvedValue(null);
      const res = await stagesModule.GET();
      expect(res.status).toBe(401);
    });

    it("returns default stages when none configured", async () => {
      vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1" });

      const limitFn = vi.fn().mockResolvedValue([{ settings: {} }]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

      const res = await stagesModule.GET();
      const data = await res.json();
      expect(data.stages.length).toBeGreaterThanOrEqual(7);
      expect(data.stages[0].name).toBe("Lead");
    });
  });
});
