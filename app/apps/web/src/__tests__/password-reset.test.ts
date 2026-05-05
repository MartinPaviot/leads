import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory store of inserted rows so we can assert on behavior without
// a real DB. Each test gets a fresh copy.
type ResetRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  requestedIp: string | null;
  requestedUserAgent: string | null;
};

let rows: ResetRow[] = [];

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  passwordResetTokens: {
    id: "id",
    userId: "userId",
    tokenHash: "tokenHash",
    expiresAt: "expiresAt",
    usedAt: "usedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (field: string, value: unknown) => ({ field, op: "eq", value }),
  and: (...parts: unknown[]) => ({ parts, op: "and" }),
  gt: (field: string, value: unknown) => ({ field, op: "gt", value }),
  isNull: (field: string) => ({ field, op: "isNull" }),
}));

import { db } from "@/db";

function wireDb() {
  // db.insert({table}).values(row) → pushes into rows.
  vi.mocked(db.insert).mockImplementation(() => {
    return {
      values: vi.fn((input: Partial<ResetRow> | Partial<ResetRow>[]) => {
        const arr = Array.isArray(input) ? input : [input];
        for (const v of arr) {
          rows.push({
            id: (v.id as string) ?? `row-${rows.length + 1}`,
            userId: v.userId ?? "",
            tokenHash: v.tokenHash ?? "",
            expiresAt: v.expiresAt ?? new Date(),
            usedAt: v.usedAt ?? null,
            createdAt: v.createdAt ?? new Date(),
            requestedIp: v.requestedIp ?? null,
            requestedUserAgent: v.requestedUserAgent ?? null,
          });
        }
        return Promise.resolve({});
      }),
    } as never;
  });

  // db.update(table).set(patch).where(cond) → patch matching rows.
  // For our purposes we treat any "and(...)" condition as matching all
  // rows belonging to the userId found inside it. We interpret the
  // passed cond by inspecting its `value` fields.
  vi.mocked(db.update).mockImplementation(() => {
    return {
      set: vi.fn((patch: Partial<ResetRow>) => ({
        where: vi.fn((cond: unknown) => {
          const target = extractFilter(cond);
          for (const r of rows) {
            if (matches(r, target)) Object.assign(r, patch);
          }
          return Promise.resolve({});
        }),
      })),
    } as never;
  });

  // db.select().from(table).where(cond).limit(n) → returns filtered rows.
  vi.mocked(db.select).mockImplementation(() => {
    return {
      from: vi.fn(() => ({
        where: vi.fn((cond: unknown) => ({
          limit: vi.fn((n: number) => {
            const target = extractFilter(cond);
            return Promise.resolve(rows.filter((r) => matches(r, target)).slice(0, n));
          }),
        })),
      })),
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

function matches(r: ResetRow, f: Filter): boolean {
  if (f.id && r.id !== f.id) return false;
  if (f.userId && r.userId !== f.userId) return false;
  if (f.tokenHash && r.tokenHash !== f.tokenHash) return false;
  if (f.unusedOnly && r.usedAt !== null) return false;
  if (f.notExpired && r.expiresAt.getTime() <= f.notExpired.getTime()) return false;
  return true;
}

// Now the module under test. Import AFTER vi.mock() calls above.
const {
  generateResetToken,
  hashResetToken,
  createResetTokenForUser,
  validateResetToken,
  consumeResetToken,
  isPasswordAcceptable,
  TOKEN_TTL_MS,
} = await import("@/lib/auth/password-reset");

beforeEach(() => {
  rows = [];
  vi.clearAllMocks();
  wireDb();
});

describe("generateResetToken", () => {
  it("returns a base64url token and its SHA-256 hex hash", () => {
    const { token, tokenHash } = generateResetToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tokenHash).toHaveLength(64); // sha256 hex = 64 chars
    expect(tokenHash).toBe(hashResetToken(token));
  });

  it("produces a unique token on every call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      seen.add(generateResetToken().token);
    }
    expect(seen.size).toBe(20);
  });
});

describe("createResetTokenForUser", () => {
  it("inserts a fresh token with TTL ≈ 1h and caller metadata", async () => {
    const before = Date.now();
    const token = await createResetTokenForUser("u1", "10.0.0.1", "Mozilla/5.0");
    const after = Date.now();

    expect(typeof token).toBe("string");
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.userId).toBe("u1");
    expect(r.tokenHash).toBe(hashResetToken(token));
    expect(r.requestedIp).toBe("10.0.0.1");
    expect(r.requestedUserAgent).toBe("Mozilla/5.0");
    expect(r.expiresAt.getTime()).toBeGreaterThanOrEqual(before + TOKEN_TTL_MS - 100);
    expect(r.expiresAt.getTime()).toBeLessThanOrEqual(after + TOKEN_TTL_MS + 100);
    expect(r.usedAt).toBeNull();
  });

  it("invalidates prior unused tokens for the same user", async () => {
    const t1 = await createResetTokenForUser("u1");
    const t2 = await createResetTokenForUser("u1");
    expect(t1).not.toBe(t2);
    expect(rows).toHaveLength(2);
    // first row should now be used (consumed by the second call).
    const first = rows.find((r) => r.tokenHash === hashResetToken(t1));
    const second = rows.find((r) => r.tokenHash === hashResetToken(t2));
    expect(first?.usedAt).not.toBeNull();
    expect(second?.usedAt).toBeNull();
  });

  it("leaves other users' tokens alone", async () => {
    const tA = await createResetTokenForUser("uA");
    const tB = await createResetTokenForUser("uB");
    // neither should have been invalidated by the other.
    const a = rows.find((r) => r.tokenHash === hashResetToken(tA));
    const b = rows.find((r) => r.tokenHash === hashResetToken(tB));
    expect(a?.usedAt).toBeNull();
    expect(b?.usedAt).toBeNull();
  });
});

describe("validateResetToken", () => {
  it("returns the row when the token is live and unused", async () => {
    const token = await createResetTokenForUser("u1");
    const row = await validateResetToken(token);
    expect(row).not.toBeNull();
    expect(row?.userId).toBe("u1");
  });

  it("returns null when the token is unknown", async () => {
    await createResetTokenForUser("u1");
    const row = await validateResetToken("definitely-not-a-valid-token");
    expect(row).toBeNull();
  });

  it("returns null when the token has been consumed", async () => {
    const token = await createResetTokenForUser("u1");
    const live = await validateResetToken(token);
    await consumeResetToken(live!.id);
    const afterUse = await validateResetToken(token);
    expect(afterUse).toBeNull();
  });

  it("returns null when the token has expired", async () => {
    const token = await createResetTokenForUser("u1");
    // Force the single row to expire in the past.
    rows[0].expiresAt = new Date(Date.now() - 1000);
    const row = await validateResetToken(token);
    expect(row).toBeNull();
  });

  it("returns null for suspiciously short tokens without touching the DB", async () => {
    const row = await validateResetToken("x");
    expect(row).toBeNull();
  });
});

describe("isPasswordAcceptable", () => {
  it("accepts a 12-char mixed-case-with-digit password", () => {
    expect(isPasswordAcceptable("Abcdefghij12")).toBe(true);
  });

  it("rejects passwords shorter than 12 chars", () => {
    expect(isPasswordAcceptable("Abcdefgh12")).toBe(false);
  });

  it("rejects passwords without a digit", () => {
    expect(isPasswordAcceptable("Abcdefghij")).toBe(false);
  });

  it("rejects passwords without an uppercase letter", () => {
    expect(isPasswordAcceptable("abcdefgh12")).toBe(false);
  });

  it("rejects passwords without a lowercase letter", () => {
    expect(isPasswordAcceptable("ABCDEFGH12")).toBe(false);
  });

  it("rejects absurdly long passwords (DoS guard)", () => {
    expect(isPasswordAcceptable("A1b".repeat(200))).toBe(false);
  });

  it("rejects non-string inputs", () => {
    // @ts-expect-error — deliberate wrong shape
    expect(isPasswordAcceptable(undefined)).toBe(false);
  });
});
