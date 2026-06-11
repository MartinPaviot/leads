import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/db/schema", () => ({
  users: {
    id: "id",
    clerkId: "clerkId",
    tenantId: "tenantId",
    avatarUrl: "avatarUrl",
    updatedAt: "updatedAt",
  },
  userPreferences: {
    id: "id",
    userId: "userId",
    resource: "resource",
    key: "key",
    value: "value",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const accountAvatarRoute = await import("@/app/api/account/avatar/route");
const serveAvatarRoute = await import("@/app/api/users/[id]/avatar/route");

const authCtx = { userId: "auth-1", tenantId: "t1", appUserId: "u1", role: "member" as const };

// 1x1 transparent PNG.
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const TINY_PNG_DATAURL = `data:image/png;base64,${TINY_PNG_B64}`;

/** Queue one select() call resolving to `rows` (select→from→where→limit). */
function queueSelect(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function mockUpdate() {
  const whereFn = vi.fn().mockResolvedValue(undefined);
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.update).mockReturnValue({ set: setFn } as never);
  return { setFn };
}

function mockInsert() {
  const valuesFn = vi.fn().mockResolvedValue(undefined);
  vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);
  return { valuesFn };
}

function mockDelete() {
  const whereFn = vi.fn().mockResolvedValue(undefined);
  vi.mocked(db.delete).mockReturnValue({ where: whereFn } as never);
  return { whereFn };
}

function makePut(body: unknown) {
  return new Request("http://localhost/api/account/avatar", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function serveParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  // mockReset (not clearAllMocks) — clearAllMocks does NOT drain
  // mockReturnValueOnce queues, and a leftover select chain from one test
  // would silently shift the next test's queue.
  vi.mocked(db.select).mockReset();
  vi.mocked(db.update).mockReset();
  vi.mocked(db.insert).mockReset();
  vi.mocked(db.delete).mockReset();
  vi.mocked(getAuthContext).mockReset();
});

describe("PUT /api/account/avatar", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null as never);
    const res = await accountAvatarRoute.PUT(makePut({ avatarDataUrl: TINY_PNG_DATAURL }));
    expect(res.status).toBe(401);
  });

  it("400 when avatarDataUrl is missing from the body", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    const res = await accountAvatarRoute.PUT(makePut({}));
    expect(res.status).toBe(400);
  });

  it("stores a valid photo and points users.avatarUrl at the versioned URL", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    queueSelect([]); // no existing preference row → insert path
    const { valuesFn } = mockInsert();
    const { setFn } = mockUpdate();

    const res = await accountAvatarRoute.PUT(makePut({ avatarDataUrl: TINY_PNG_DATAURL }));
    expect(res.status).toBe(200);

    // Bytes land in user_preferences under the AUTH user id…
    const inserted = valuesFn.mock.calls[0][0] as {
      userId: string;
      resource: string;
      key: string;
      value: { dataUrl: string; updatedAt: string };
    };
    expect(inserted.userId).toBe("auth-1");
    expect(inserted.resource).toBe("profile");
    expect(inserted.key).toBe("avatar");
    expect(inserted.value.dataUrl).toBe(TINY_PNG_DATAURL);
    expect(typeof inserted.value.updatedAt).toBe("string");

    // …and users.avatar_url gets ONLY the small versioned serving URL,
    // never the data URL itself.
    const userUpdate = setFn.mock.calls[0][0] as { avatarUrl: string };
    expect(userUpdate.avatarUrl).toContain("/api/users/u1/avatar?v=");
    expect(userUpdate.avatarUrl).not.toContain("base64");

    const body = await res.json();
    expect(body.avatarUrl).toBe(userUpdate.avatarUrl);
  });

  it("updates the existing preference row on re-upload", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    queueSelect([{ id: "pref-1" }]); // existing row → update path
    const { setFn } = mockUpdate();

    const res = await accountAvatarRoute.PUT(makePut({ avatarDataUrl: TINY_PNG_DATAURL }));
    expect(res.status).toBe(200);
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
    // Two updates: the preference row, then users.avatar_url.
    expect(setFn).toHaveBeenCalledTimes(2);
    const prefUpdate = setFn.mock.calls[0][0] as { value: { dataUrl: string } };
    expect(prefUpdate.value.dataUrl).toBe(TINY_PNG_DATAURL);
  });

  it("removes the photo on null (preference row deleted, avatarUrl cleared)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    const { whereFn } = mockDelete();
    const { setFn } = mockUpdate();

    const res = await accountAvatarRoute.PUT(makePut({ avatarDataUrl: null }));
    expect(res.status).toBe(200);
    expect(whereFn).toHaveBeenCalled();
    const userUpdate = setFn.mock.calls[0][0] as { avatarUrl: string | null };
    expect(userUpdate.avatarUrl).toBeNull();
    const body = await res.json();
    expect(body.avatarUrl).toBeNull();
  });

  it("400 on an SVG data URL and writes nothing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    const svg = `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`;
    const res = await accountAvatarRoute.PUT(makePut({ avatarDataUrl: svg }));
    expect(res.status).toBe(400);
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it("400 on an oversize payload and writes nothing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    const oversize = `data:image/png;base64,${"A".repeat(400_001)}`;
    const res = await accountAvatarRoute.PUT(makePut({ avatarDataUrl: oversize }));
    expect(res.status).toBe(400);
    expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });
});

describe("GET /api/users/[id]/avatar", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null as never);
    const res = await serveAvatarRoute.GET(new Request("http://localhost"), serveParams("u1"));
    expect(res.status).toBe(401);
  });

  it("404 when the target user is not in the requester's tenant", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    queueSelect([]); // tenant-scoped user lookup finds nothing
    const res = await serveAvatarRoute.GET(new Request("http://localhost"), serveParams("other"));
    expect(res.status).toBe(404);
  });

  it("404 when the member has no photo", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    queueSelect([{ clerkId: "auth-1" }]);
    queueSelect([]); // no preference row
    const res = await serveAvatarRoute.GET(new Request("http://localhost"), serveParams("u1"));
    expect(res.status).toBe(404);
  });

  it("404 when the stored value is malformed (fail closed)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    queueSelect([{ clerkId: "auth-1" }]);
    queueSelect([{ value: { dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" } }]);
    const res = await serveAvatarRoute.GET(new Request("http://localhost"), serveParams("u1"));
    expect(res.status).toBe(404);
  });

  it("serves the bytes with the right content type and immutable caching", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    queueSelect([{ clerkId: "auth-1" }]);
    queueSelect([{ value: { dataUrl: TINY_PNG_DATAURL, updatedAt: "2026-06-11T10:00:00.000Z" } }]);
    const res = await serveAvatarRoute.GET(new Request("http://localhost"), serveParams("u1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.equals(Buffer.from(TINY_PNG_B64, "base64"))).toBe(true);
  });
});
