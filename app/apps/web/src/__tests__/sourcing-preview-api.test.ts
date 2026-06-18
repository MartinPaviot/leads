import { describe, it, expect, vi, beforeEach } from "vitest";

let authCtx: { tenantId: string; userId: string; role: string } | null = {
  tenantId: "t1",
  userId: "u1",
  role: "admin",
};
let permissionDenied: Response | null = null;
let selectResult: Array<{ id: string; name: string; domain: string | null; score: number | null }> = [];
let apolloAvailable = false;

vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: async () => authCtx }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: () => permissionDenied }));
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => selectResult }) }) },
}));
vi.mock("@/db/schema", () => ({
  companies: { id: "id", name: "name", domain: "domain", score: "score", tenantId: "tenant_id", deletedAt: "deleted_at" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  inArray: (...a: unknown[]) => a,
  isNull: (...a: unknown[]) => a,
}));
vi.mock("@/lib/integrations/apollo-client", () => ({
  isApolloAvailable: () => apolloAvailable,
  searchPeople: vi.fn(),
}));
vi.mock("@/lib/icp/person-targeting", () => ({
  getIcpPersonTargeting: async () => ({ titles: ["CEO", "Head of HR"], seniorities: ["c_suite"], source: "icp_profiles" }),
}));

const { POST } = await import("@/app/api/accounts/extract-contacts/preview/route");

const req = (body: unknown) =>
  new Request("http://x/api/accounts/extract-contacts/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  authCtx = { tenantId: "t1", userId: "u1", role: "admin" };
  permissionDenied = null;
  selectResult = [];
  apolloAvailable = false;
});

describe("POST /api/accounts/extract-contacts/preview", () => {
  it("401 without auth", async () => {
    authCtx = null;
    expect((await POST(req({ accountIds: ["a"] }))).status).toBe(401);
  });

  it("delegates to the permission gate (viewer denied)", async () => {
    permissionDenied = Response.json({ error: "forbidden" }, { status: 403 });
    expect((await POST(req({ accountIds: ["a"] }))).status).toBe(403);
  });

  it("400 when accountIds missing", async () => {
    expect((await POST(req({}))).status).toBe(400);
  });

  it("returns targeting + partition; no Apollo sample when key absent", async () => {
    apolloAvailable = false;
    selectResult = [
      { id: "a", name: "Acme", domain: "acme.com", score: 82 }, // in-ICP
      { id: "b", name: "Weak", domain: "weak.com", score: 10 }, // out-of-ICP
      { id: "c", name: "NoDom", domain: null, score: 90 }, // no domain
    ];
    const res = await POST(req({ accountIds: ["a", "b", "c"] }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      targeting: { titles: string[]; seniorities: string[] };
      summary: { total: number; inIcp: number; outIcp: number; noDomain: number };
      accounts: Array<{ accountId: string; inIcp: boolean }>;
      samples: unknown[];
      apolloAvailable: boolean;
    };
    expect(data.targeting.titles).toEqual(["CEO", "Head of HR"]);
    expect(data.summary).toMatchObject({ total: 3, inIcp: 1, outIcp: 1, noDomain: 1 });
    expect(data.apolloAvailable).toBe(false);
    expect(data.samples).toEqual([]); // no Apollo key → no live sample
  });
});
