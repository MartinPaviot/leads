import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/lib/infra/audit-log", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/guardrails/approval-mode", () => ({
  readApprovalMode: vi.fn().mockReturnValue("review-each"),
}));

vi.mock("@/db", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

vi.mock("@/db/schema", () => ({
  tenants: { id: "id", name: "name", settings: "settings", updatedAt: "updatedAt" },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/infra/audit-log";
import { db } from "@/db";

const workspaceRoute = await import("@/app/api/settings/workspace/route");
const logoRoute = await import("@/app/api/settings/workspace/logo/route");

const authAdmin = { userId: "auth-1", tenantId: "t1", appUserId: "u1", role: "admin" as const };

// 1x1 transparent PNG.
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TINY_PNG_DATAURL = `data:image/png;base64,${TINY_PNG_B64}`;

function mockSelectRows(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);
}

function mockUpdate() {
  const whereFn = vi.fn().mockResolvedValue(undefined);
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.update).mockReturnValue({ set: setFn } as never);
  return { setFn };
}

function makePut(body: unknown) {
  return new Request("http://localhost/api/settings/workspace", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePermission).mockReturnValue(null as never);
});

describe("PUT /api/settings/workspace — logoDataUrl", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null as never);
    const res = await workspaceRoute.PUT(makePut({ logoDataUrl: TINY_PNG_DATAURL }));
    expect(res.status).toBe(401);
  });

  it("denied when the role lacks settings:write", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin as never);
    vi.mocked(requirePermission).mockReturnValue(
      Response.json({ error: "Forbidden" }, { status: 403 }) as never,
    );
    const res = await workspaceRoute.PUT(makePut({ logoDataUrl: TINY_PNG_DATAURL }));
    expect(res.status).toBe(403);
  });

  it("stores a valid raster logo and stamps logoUpdatedAt", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin as never);
    mockSelectRows([{ name: "Pilae", settings: {} }]);
    const { setFn } = mockUpdate();

    const res = await workspaceRoute.PUT(makePut({ logoDataUrl: TINY_PNG_DATAURL }));
    expect(res.status).toBe(200);

    const written = setFn.mock.calls[0][0] as { settings: Record<string, unknown> };
    expect(written.settings.logoDataUrl).toBe(TINY_PNG_DATAURL);
    expect(typeof written.settings.logoUpdatedAt).toBe("string");

    // Audit logs booleans only — never the image bytes.
    const audit = vi.mocked(logAudit).mock.calls[0][0] as {
      changes: Record<string, { old: unknown; new: unknown }>;
    };
    expect(audit.changes.logo).toEqual({ old: false, new: true });
  });

  it("removes the logo on null", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin as never);
    mockSelectRows([{ name: "Pilae", settings: { logoDataUrl: TINY_PNG_DATAURL, logoUpdatedAt: "x" } }]);
    const { setFn } = mockUpdate();

    const res = await workspaceRoute.PUT(makePut({ logoDataUrl: null }));
    expect(res.status).toBe(200);

    const written = setFn.mock.calls[0][0] as { settings: Record<string, unknown> };
    expect(written.settings.logoDataUrl).toBeNull();

    const audit = vi.mocked(logAudit).mock.calls[0][0] as {
      changes: Record<string, { old: unknown; new: unknown }>;
    };
    expect(audit.changes.logo).toEqual({ old: true, new: false });
  });

  it("400 on an SVG data URL and writes nothing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin as never);
    mockSelectRows([{ name: "Pilae", settings: {} }]);
    mockUpdate();

    const svg = `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`;
    const res = await workspaceRoute.PUT(makePut({ logoDataUrl: svg }));
    expect(res.status).toBe(400);
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it("400 on an oversize payload and writes nothing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin as never);
    mockSelectRows([{ name: "Pilae", settings: {} }]);
    mockUpdate();

    const oversize = `data:image/png;base64,${"A".repeat(400_001)}`;
    const res = await workspaceRoute.PUT(makePut({ logoDataUrl: oversize }));
    expect(res.status).toBe(400);
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });
});

describe("GET /api/settings/workspace — logoUrl", () => {
  it("returns a versioned logoUrl when a logo is stored", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin as never);
    mockSelectRows([
      {
        name: "Pilae",
        settings: { logoDataUrl: TINY_PNG_DATAURL, logoUpdatedAt: "2026-06-11T08:00:00.000Z" },
      },
    ]);
    const res = await workspaceRoute.GET();
    const body = await res.json();
    expect(body.logoUrl).toBe(
      `/api/settings/workspace/logo?v=${encodeURIComponent("2026-06-11T08:00:00.000Z")}`,
    );
  });

  it("returns null logoUrl when no logo is stored", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin as never);
    mockSelectRows([{ name: "Pilae", settings: {} }]);
    const res = await workspaceRoute.GET();
    const body = await res.json();
    expect(body.logoUrl).toBeNull();
  });
});

describe("GET /api/settings/workspace/logo", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null as never);
    const res = await logoRoute.GET();
    expect(res.status).toBe(401);
  });

  it("404 when the tenant has no logo", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin as never);
    mockSelectRows([{ settings: {} }]);
    const res = await logoRoute.GET();
    expect(res.status).toBe(404);
  });

  it("404 when the stored value is malformed (fail closed)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin as never);
    mockSelectRows([{ settings: { logoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=" } }]);
    const res = await logoRoute.GET();
    expect(res.status).toBe(404);
  });

  it("serves the bytes with the right content type and immutable caching", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authAdmin as never);
    mockSelectRows([{ settings: { logoDataUrl: TINY_PNG_DATAURL } }]);
    const res = await logoRoute.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.equals(Buffer.from(TINY_PNG_B64, "base64"))).toBe(true);
  });
});
