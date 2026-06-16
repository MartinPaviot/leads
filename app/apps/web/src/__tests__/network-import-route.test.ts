/**
 * POST /api/network/import — contract tests. The route is thin glue; the
 * import work is mocked here (its logic is covered by the parser + planner
 * unit tests). Under test: auth + rate-limit gates run first; csv is read from
 * JSON or rejected when missing; the service result is passed through; a
 * non-LinkedIn file (service ok:false) is a 400.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/infra/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/network/import-service", () => ({ importLinkedInConnections: vi.fn() }));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { importLinkedInConnections } from "@/lib/network/import-service";

const { POST } = await import("@/app/api/network/import/route");

const AUTH_CTX = { userId: "u1", appUserId: "au1", tenantId: "t1", role: "admin" };
const OK_RESULT = {
  ok: true,
  headerFound: true,
  parsed: 3,
  duplicatesInFile: 1,
  skipped: 0,
  alreadyInDb: 1,
  imported: 2,
  companiesCreated: 1,
  scored: 2,
};

function jsonReq(body: unknown): Request {
  return new Request("http://localhost/api/network/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/network/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthContext).mockResolvedValue(AUTH_CTX as never);
    vi.mocked(checkRateLimit).mockResolvedValue(null);
    vi.mocked(importLinkedInConnections).mockResolvedValue(OK_RESULT as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await POST(jsonReq({ csv: "x" }));
    expect(res.status).toBe(401);
    expect(importLinkedInConnections).not.toHaveBeenCalled();
  });

  it("returns the rate-limit response untouched when limited", async () => {
    const limited = Response.json({ error: "Too many requests" }, { status: 429 });
    vi.mocked(checkRateLimit).mockResolvedValue(limited);
    const res = await POST(jsonReq({ csv: "x" }));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("bulk", "u1");
    expect(importLinkedInConnections).not.toHaveBeenCalled();
  });

  it("returns 400 when the JSON body has no csv", async () => {
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
    expect(importLinkedInConnections).not.toHaveBeenCalled();
  });

  it("imports from a JSON csv and passes the service result through", async () => {
    const res = await POST(jsonReq({ csv: "First Name,Last Name,URL\nJane,Doe,x" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, imported: 2, scored: 2, alreadyInDb: 1 });
    expect(importLinkedInConnections).toHaveBeenCalledWith({
      tenantId: "t1",
      userId: "au1",
      csv: "First Name,Last Name,URL\nJane,Doe,x",
    });
  });

  it("returns 400 with the service error for a non-LinkedIn file", async () => {
    vi.mocked(importLinkedInConnections).mockResolvedValue({
      ok: false,
      headerFound: false,
      error: "Not a LinkedIn Connections export (no header row found).",
    } as never);
    const res = await POST(jsonReq({ csv: "foo,bar\n1,2" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/LinkedIn/);
  });
});
