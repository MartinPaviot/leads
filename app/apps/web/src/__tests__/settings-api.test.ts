import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler) => { const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext(); if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 }); return handler(ctx); }),
  requireAdmin: vi.fn(() => null),
}));

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(() => null),
  // CLE-12 — the knowledge route now also calls the shared matrix guard.
  // Stub it to allow (null); its role-gating is covered in route-capability.test.ts.
  requireCapabilityForRequest: vi.fn(() => null),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  trustEvents: { id: "id", tenantId: "tenant_id", eventType: "event_type", delta: "delta", reason: "reason", createdAt: "created_at" },
  systemTrustScore: { id: "id", tenantId: "tenant_id", score: "score", components: "components", createdAt: "created_at" },
  agentActions: { id: "id", tenantId: "tenant_id", agentId: "agent_id", actionType: "action_type", entityId: "entity_id", summary: "summary", approved: "approved", metadata: "metadata", createdAt: "created_at" },
  knowledgeEntries: {
    id: "id",
    tenantId: "tenantId",
    title: "title",
    content: "content",
    category: "category",
    metadata: "metadata",
    createdAt: "created_at",
    isActive: "isActive",
    scope: "scope",
    createdBy: "createdBy",
    updatedAt: "updatedAt",
    contentHash: "contentHash",
  },
  tenants: { id: "id", settings: "settings", name: "name" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  desc: vi.fn(),
}));

vi.mock("@/lib/infra/audit-log", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/guardrails/approval-mode", () => ({
  readApprovalMode: vi.fn(() => "auto-high-confidence"),
}));

vi.mock("@/lib/knowledge/retrieval", () => ({
  embedKnowledgeEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/knowledge/auto-stage", () => ({
  classifyStages: vi.fn().mockResolvedValue(["global"]),
}));

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth/auth-utils";
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

    it("returns knowledge entries", async () => {
      vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

      // The knowledge route now reads from knowledgeEntries table directly
      // via: db.select().from(knowledgeEntries).where(...).orderBy(...)
      const orderByFn = vi.fn().mockResolvedValue([
        {
          id: "k1",
          title: "ICP",
          category: "icp",
          content: "B2B SaaS",
          scope: "workspace",
          createdBy: "u1",
          isStale: false,
          updatedAt: new Date(),
          createdAt: new Date(),
        },
      ]);
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

      const res = await knowledgeModule.GET();
      const data = await res.json();
      expect(data.knowledge).toHaveLength(1);
      expect(data.knowledge[0].title).toBe("ICP");
    });
  });

  describe("POST /api/settings/knowledge", () => {
    it("returns 400 when title empty", async () => {
      vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

      const req = new Request("http://localhost/api/settings/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", content: "test" }),
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
      vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

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
