/**
 * POST /api/score-contacts — ICP-profile contact scoring (replaces the
 * legacy flat-settings composite). Contracts under test:
 *   - auth + rate-limit gates run before any work;
 *   - bad body (neither contactIds nor all:true) is a 400;
 *   - the contact-scoped guard surfaces "nothing scorable" as 422;
 *   - { all: true } runs the tenant-wide path;
 *   - { contactIds } runs the batch path with the loaded ICPs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/infra/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/icp/fit-recompute-core", () => ({
  loadActiveIcps: vi.fn(),
}));

vi.mock("@/lib/scoring/contact-icp-fit", () => ({
  CONTACT_SCORE_BATCH_SIZE: 100,
  hasContactScorableCriteria: vi.fn(),
  scoreAllContactsIcp: vi.fn(),
  scoreContactIcpBatch: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { loadActiveIcps } from "@/lib/icp/fit-recompute-core";
import {
  hasContactScorableCriteria,
  scoreAllContactsIcp,
  scoreContactIcpBatch,
} from "@/lib/scoring/contact-icp-fit";

const { POST } = await import("@/app/api/score-contacts/route");

const AUTH_CTX = { userId: "u1", appUserId: "au1", tenantId: "t1", role: "admin" };
const ICPS = [
  {
    id: "icp1",
    name: "Coeur romand",
    priority: 1,
    criteria: [
      { id: "c1", fieldKey: "industry", operator: "eq", value: "software", weight: 1, isRequired: false },
    ],
  },
];

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/score-contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/score-contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthContext).mockResolvedValue(AUTH_CTX as never);
    vi.mocked(checkRateLimit).mockResolvedValue(null);
    vi.mocked(loadActiveIcps).mockResolvedValue(ICPS as never);
    vi.mocked(hasContactScorableCriteria).mockReturnValue(true);
    vi.mocked(scoreAllContactsIcp).mockResolvedValue({ scored: 42, total: 42 });
    vi.mocked(scoreContactIcpBatch).mockResolvedValue({ scored: 2 });
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await POST(makeReq({ all: true }));
    expect(res.status).toBe(401);
    expect(scoreAllContactsIcp).not.toHaveBeenCalled();
  });

  it("returns the rate-limit response untouched when limited", async () => {
    const limited = Response.json({ error: "Too many requests" }, { status: 429 });
    vi.mocked(checkRateLimit).mockResolvedValue(limited);
    const res = await POST(makeReq({ all: true }));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith("bulk", "u1");
    expect(scoreAllContactsIcp).not.toHaveBeenCalled();
  });

  it("returns 400 when neither contactIds nor all:true is given", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(scoreAllContactsIcp).not.toHaveBeenCalled();
    expect(scoreContactIcpBatch).not.toHaveBeenCalled();
  });

  it("returns 422 when no active ICP has contact-scorable criteria", async () => {
    vi.mocked(hasContactScorableCriteria).mockReturnValue(false);
    const res = await POST(makeReq({ all: true }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/ICP/);
    expect(scoreAllContactsIcp).not.toHaveBeenCalled();
  });

  it("{ all: true } runs the tenant-wide path", async () => {
    const res = await POST(makeReq({ all: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, scored: 42, total: 42 });
    expect(scoreAllContactsIcp).toHaveBeenCalledWith("t1", ICPS);
    expect(scoreContactIcpBatch).not.toHaveBeenCalled();
  });

  it("{ contactIds } runs the batch path with the loaded ICPs", async () => {
    const res = await POST(makeReq({ contactIds: ["a", "b"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, scored: 2, total: 2 });
    expect(scoreContactIcpBatch).toHaveBeenCalledWith("t1", ["a", "b"], ICPS);
    expect(scoreAllContactsIcp).not.toHaveBeenCalled();
  });

  it("filters non-string ids out of contactIds", async () => {
    const res = await POST(makeReq({ contactIds: ["a", 7, null, "b"] }));
    expect(res.status).toBe(200);
    expect(scoreContactIcpBatch).toHaveBeenCalledWith("t1", ["a", "b"], ICPS);
  });

  it("rejects oversized explicit id lists instead of truncating", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `c${i}`);
    const res = await POST(makeReq({ contactIds: ids }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/all:true/);
    expect(scoreContactIcpBatch).not.toHaveBeenCalled();
    expect(scoreAllContactsIcp).not.toHaveBeenCalled();
  });
});
