import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory store of inserted token rows + a separate map of authUsers
// so we can assert markEmailVerified() without a real DB. Mirrors the
// approach used in password-reset.test.ts so the two stay parallel.
type VerifyRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  requestedIp: string | null;
  requestedUserAgent: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  emailVerified: Date | null;
};

let tokenRows: VerifyRow[] = [];
let userRows: UserRow[] = [];
let lastTouchedTable: "tokens" | "users" | null = null;

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  emailVerificationTokens: {
    __table: "tokens",
    id: "id",
    userId: "userId",
    tokenHash: "tokenHash",
    expiresAt: "expiresAt",
    usedAt: "usedAt",
  },
  authUsers: {
    __table: "users",
    id: "id",
    email: "email",
    emailVerified: "emailVerified",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (field: string, value: unknown) => ({ field, op: "eq", value }),
  and: (...parts: unknown[]) => ({ parts, op: "and" }),
  gt: (field: string, value: unknown) => ({ field, op: "gt", value }),
  isNull: (field: string) => ({ field, op: "isNull" }),
}));

import { db } from "@/db";

function tableOf(arg: unknown): "tokens" | "users" | null {
  if (arg && typeof arg === "object" && "__table" in arg) {
    return (arg as { __table: "tokens" | "users" }).__table;
  }
  return null;
}

function wireDb() {
  vi.mocked(db.insert).mockImplementation((table: unknown) => {
    const target = tableOf(table);
    return {
      values: vi.fn((input: Partial<VerifyRow> | Partial<VerifyRow>[]) => {
        const arr = Array.isArray(input) ? input : [input];
        for (const v of arr) {
          if (target === "tokens") {
            tokenRows.push({
              id: (v.id as string) ?? `row-${tokenRows.length + 1}`,
              userId: v.userId ?? "",
              tokenHash: v.tokenHash ?? "",
              expiresAt: v.expiresAt ?? new Date(),
              usedAt: v.usedAt ?? null,
              createdAt: v.createdAt ?? new Date(),
              requestedIp: v.requestedIp ?? null,
              requestedUserAgent: v.requestedUserAgent ?? null,
            });
          }
        }
        return Promise.resolve({});
      }),
    } as never;
  });

  vi.mocked(db.update).mockImplementation((table: unknown) => {
    const target = tableOf(table);
    lastTouchedTable = target;
    return {
      set: vi.fn((patch: Partial<VerifyRow & UserRow>) => ({
        where: vi.fn((cond: unknown) => {
          const filter = extractFilter(cond);
          if (target === "tokens") {
            for (const r of tokenRows) {
              if (matchesToken(r, filter)) Object.assign(r, patch);
            }
          } else if (target === "users") {
            for (const u of userRows) {
              if (filter.id && u.id === filter.id) Object.assign(u, patch);
            }
          }
          return Promise.resolve({});
        }),
      })),
    } as never;
  });

  vi.mocked(db.select).mockImplementation(() => {
    return {
      from: vi.fn((table: unknown) => {
        const target = tableOf(table);
        return {
          where: vi.fn((cond: unknown) => ({
            limit: vi.fn((n: number) => {
              const filter = extractFilter(cond);
              if (target === "tokens") {
                return Promise.resolve(
                  tokenRows.filter((r) => matchesToken(r, filter)).slice(0, n)
                );
              }
              if (target === "users") {
                return Promise.resolve(
                  userRows
                    .filter((u) => !filter.id || u.id === filter.id)
                    .slice(0, n)
                );
              }
              return Promise.resolve([]);
            }),
          })),
        };
      }),
    } as never;
  });
}

type Filter = Partial<{
  id: string;
  userId: string;
  tokenHash: string;
  unusedOnly: boolean;
  notExpired: Date;
}>;

function extractFilter(cond: unknown): Filter {
  const out: Filter = {};
  function visit(c: unknown) {
    if (!c || typeof c !== "object") return;
    const node = c as { op?: string; field?: string; value?: unknown; parts?: unknown[] };
    if (node.op === "and" && Array.isArray(node.parts)) {
      for (const p of node.parts) visit(p);
      return;
    }
    if (node.op === "eq" && node.field === "id") out.id = node.value as string;
    if (node.op === "eq" && node.field === "userId") out.userId = node.value as string;
    if (node.op === "eq" && node.field === "tokenHash") out.tokenHash = node.value as string;
    if (node.op === "isNull" && node.field === "usedAt") out.unusedOnly = true;
    if (node.op === "gt" && node.field === "expiresAt") out.notExpired = node.value as Date;
  }
  visit(cond);
  return out;
}

function matchesToken(r: VerifyRow, f: Filter): boolean {
  if (f.id && r.id !== f.id) return false;
  if (f.userId && r.userId !== f.userId) return false;
  if (f.tokenHash && r.tokenHash !== f.tokenHash) return false;
  if (f.unusedOnly && r.usedAt !== null) return false;
  if (f.notExpired && r.expiresAt.getTime() <= f.notExpired.getTime()) return false;
  return true;
}

const {
  generateVerifyToken,
  hashVerifyToken,
  createVerifyTokenForUser,
  validateVerifyToken,
  consumeVerifyToken,
  markEmailVerified,
  getEmailVerifiedAt,
  VERIFY_TOKEN_TTL_MS,
} = await import("@/lib/email-verification");

beforeEach(() => {
  tokenRows = [];
  userRows = [];
  lastTouchedTable = null;
  vi.clearAllMocks();
  wireDb();
});

describe("generateVerifyToken", () => {
  it("returns a base64url token + sha256 hex hash that round-trip", async () => {
    const { token, tokenHash } = await generateVerifyToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).toBe(await hashVerifyToken(token));
  });

  it("never collides across 50 calls", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add((await generateVerifyToken()).token);
    expect(seen.size).toBe(50);
  });
});

describe("createVerifyTokenForUser", () => {
  it("inserts a fresh token with TTL ≈ 24h and caller metadata", async () => {
    const before = Date.now();
    const token = await createVerifyTokenForUser("u1", "10.0.0.1", "Mozilla/5.0");
    const after = Date.now();

    expect(typeof token).toBe("string");
    expect(tokenRows).toHaveLength(1);
    const r = tokenRows[0];
    expect(r.userId).toBe("u1");
    expect(r.tokenHash).toBe(await hashVerifyToken(token));
    expect(r.requestedIp).toBe("10.0.0.1");
    expect(r.requestedUserAgent).toBe("Mozilla/5.0");
    expect(r.expiresAt.getTime()).toBeGreaterThanOrEqual(before + VERIFY_TOKEN_TTL_MS - 100);
    expect(r.expiresAt.getTime()).toBeLessThanOrEqual(after + VERIFY_TOKEN_TTL_MS + 100);
    expect(r.usedAt).toBeNull();
  });

  it("invalidates prior unused tokens for the same user", async () => {
    const t1 = await createVerifyTokenForUser("u1");
    const t2 = await createVerifyTokenForUser("u1");
    expect(t1).not.toBe(t2);
    const [hash1, hash2] = await Promise.all([hashVerifyToken(t1), hashVerifyToken(t2)]);
    const first = tokenRows.find((r) => r.tokenHash === hash1);
    const second = tokenRows.find((r) => r.tokenHash === hash2);
    expect(first?.usedAt).not.toBeNull();
    expect(second?.usedAt).toBeNull();
  });

  it("does not invalidate other users' tokens", async () => {
    const tA = await createVerifyTokenForUser("uA");
    const tB = await createVerifyTokenForUser("uB");
    const [hashA, hashB] = await Promise.all([hashVerifyToken(tA), hashVerifyToken(tB)]);
    const a = tokenRows.find((r) => r.tokenHash === hashA);
    const b = tokenRows.find((r) => r.tokenHash === hashB);
    expect(a?.usedAt).toBeNull();
    expect(b?.usedAt).toBeNull();
  });
});

describe("validateVerifyToken", () => {
  it("returns the row when the token is live + unused", async () => {
    const token = await createVerifyTokenForUser("u1");
    const row = await validateVerifyToken(token);
    expect(row).not.toBeNull();
    expect(row?.userId).toBe("u1");
  });

  it("returns null when the token is unknown", async () => {
    await createVerifyTokenForUser("u1");
    const row = await validateVerifyToken("not-a-real-token");
    expect(row).toBeNull();
  });

  it("returns null when the token has been consumed", async () => {
    const token = await createVerifyTokenForUser("u1");
    const live = await validateVerifyToken(token);
    await consumeVerifyToken(live!.id);
    expect(await validateVerifyToken(token)).toBeNull();
  });

  it("returns null when the token has expired", async () => {
    const token = await createVerifyTokenForUser("u1");
    tokenRows[0].expiresAt = new Date(Date.now() - 1000);
    expect(await validateVerifyToken(token)).toBeNull();
  });

  it("returns null for short tokens without hitting the DB", async () => {
    expect(await validateVerifyToken("x")).toBeNull();
    expect(await validateVerifyToken("")).toBeNull();
  });
});

describe("markEmailVerified / getEmailVerifiedAt", () => {
  it("stamps emailVerified on the matching user row", async () => {
    userRows.push({ id: "u1", email: "u@x.com", emailVerified: null });
    await markEmailVerified("u1");
    expect(userRows[0].emailVerified).toBeInstanceOf(Date);
    expect(lastTouchedTable).toBe("users");
  });

  it("getEmailVerifiedAt reflects the stamp", async () => {
    userRows.push({ id: "u1", email: "u@x.com", emailVerified: null });
    expect(await getEmailVerifiedAt("u1")).toBeNull();
    await markEmailVerified("u1");
    expect(await getEmailVerifiedAt("u1")).toBeInstanceOf(Date);
  });

  it("getEmailVerifiedAt returns null for an unknown user", async () => {
    expect(await getEmailVerifiedAt("nope")).toBeNull();
  });
});
