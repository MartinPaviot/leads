import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: vi.fn(), requireAdmin: vi.fn(() => null) }));
vi.mock("@/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("@/db/schema", () => ({ customSkillTemplates: { id: "id", tenantId: "tenantId", slug: "slug" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), or: vi.fn(), sql: vi.fn() }));
vi.mock("@/skills/custom/executor", () => ({ listAvailableSkills: vi.fn(async () => []), forkSkill: vi.fn() }));
vi.mock("@/skills/registry", () => ({
  listSkills: vi.fn(() => [
    { slug: "tam-builder", name: "TAM Builder", description: "Builds a TAM", category: "enrichment" },
  ]),
}));
vi.mock("@/skills/register-all", () => ({ registerAllSkills: vi.fn() }));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { registerAllSkills } from "@/skills/register-all";

const route = await import("@/app/api/settings/skills/route");

describe("GET /api/settings/skills — registry warm (R4)", () => {
  beforeEach(() => vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never));

  it("warms the skill registry so System skills are never empty on a cold process", () => {
    // registerAllSkills() runs at module load — importing the route triggers it.
    expect(vi.mocked(registerAllSkills)).toHaveBeenCalled();
  });

  it("returns the registered system skills in the payload", async () => {
    const res = await route.GET(new Request("http://localhost/api/settings/skills"));
    const data = await res.json();
    expect(res.status).toBe(200);
    const system = data.skills.filter((s: { scope?: string }) => s.scope === "system");
    expect(system.length).toBeGreaterThan(0);
    expect(system[0].slug).toBe("tam-builder");
  });
});
