import { describe, it, expect, vi, beforeEach } from "vitest";

type AttemptRow = {
  id: string;
  identifierHash: string;
  ip: string | null;
  attemptedAt: Date;
};

let rows: AttemptRow[] = [];

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  failedSignInAttempts: {
    id: "id",
    identifierHash: "identifierHash",
    ip: "ip",
    attemptedAt: "attemptedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (field: string, value: unknown) => ({ field, op: "eq", value }),
  and: (...parts: unknown[]) => ({ parts, op: "and" }),
  gt: (field: string, value: unknown) => ({ field, op: "gt", value }),
  lt: (field: string, value: unknown) => ({ field, op: "lt", value }),
}));

import { db } from "@/db";

function wireDb() {
  vi.mocked(db.insert).mockImplementation(() => {
    return {
      values: vi.fn((input: Partial<AttemptRow> | Partial<AttemptRow>[]) => {
        const arr = Array.isArray(input) ? input : [input];
        for (const v of arr) {
          rows.push({
            id: (v.id as string) ?? `row-${rows.length + 1}`,
            identifierHash: v.identifierHash ?? "",
            ip: v.ip ?? null,
            attemptedAt: v.attemptedAt ?? new Date(),
          });
        }
        return Promise.resolve({});
      }),
    } as never;
  });

  vi.mocked(db.select).mockImplementation(() => {
    return {
      from: vi.fn(() => ({
        where: vi.fn((cond: unknown) => {
          const filter = extractFilter(cond);
          return Promise.resolve(
            rows.filter((r) => matches(r, filter)).map((r) => ({
              attemptedAt: r.attemptedAt,
            }))
          );
        }),
      })),
    } as never;
  });

  vi.mocked(db.delete).mockImplementation(() => {
    return {
      where: vi.fn((cond: unknown) => {
        const filter = extractFilter(cond);
        rows = rows.filter((r) => !matches(r, filter));
        return Promise.resolve({});
      }),
    } as never;
  });
}

type Filter = {
  identifierHash?: string;
  attemptedAfter?: Date;
  attemptedBefore?: Date;
};

function extractFilter(cond: unknown): Filter {
  const out: Filter = {};
  function visit(c: unknown) {
    if (!c || typeof c !== "object") return;
    const node = c as { op?: string; field?: string; value?: unknown; parts?: unknown[] };
    if (node.op === "and" && Array.isArray(node.parts)) {
      for (const p of node.parts) visit(p);
      return;
    }
    if (node.op === "eq" && node.field === "identifierHash") {
      out.identifierHash = node.value as string;
    }
    if (node.op === "gt" && node.field === "attemptedAt") {
      out.attemptedAfter = node.value as Date;
    }
    if (node.op === "lt" && node.field === "attemptedAt") {
      out.attemptedBefore = node.value as Date;
    }
  }
  visit(cond);
  return out;
}

function matches(r: AttemptRow, f: Filter): boolean {
  if (f.identifierHash && r.identifierHash !== f.identifierHash) return false;
  if (f.attemptedAfter && r.attemptedAt.getTime() <= f.attemptedAfter.getTime())
    return false;
  if (
    f.attemptedBefore &&
    r.attemptedAt.getTime() >= f.attemptedBefore.getTime()
  ) {
    return false;
  }
  return true;
}

const {
  hashIdentifier,
  recordFailedSignIn,
  clearFailedSignIns,
  getLockoutStatus,
  formatRetryIn,
  LOCKOUT_THRESHOLD,
  LOCKOUT_WINDOW_MS,
} = await import("@/lib/auth-lockout");

beforeEach(() => {
  rows = [];
  vi.clearAllMocks();
  wireDb();
});

describe("hashIdentifier", () => {
  it("normalises case + whitespace before hashing", async () => {
    expect(await hashIdentifier("Alice@Example.com")).toBe(
      await hashIdentifier("  alice@example.com  ")
    );
  });

  it("never returns the raw email (anti-enumeration)", async () => {
    const h = await hashIdentifier("alice@example.com");
    expect(h).not.toContain("alice");
    expect(h).not.toContain("@");
    expect(h).toHaveLength(64);
  });

  it("differs across distinct emails", async () => {
    expect(await hashIdentifier("a@x.com")).not.toBe(await hashIdentifier("b@x.com"));
  });
});

describe("recordFailedSignIn + getLockoutStatus", () => {
  it("does not lock before the threshold", async () => {
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
      await recordFailedSignIn("alice@example.com");
    }
    const status = await getLockoutStatus("alice@example.com");
    expect(status.locked).toBe(false);
    expect(status.attemptsInWindow).toBe(LOCKOUT_THRESHOLD - 1);
    expect(status.retryAt).toBeNull();
  });

  it("locks once the threshold is hit", async () => {
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await recordFailedSignIn("alice@example.com");
    }
    const status = await getLockoutStatus("alice@example.com");
    expect(status.locked).toBe(true);
    expect(status.attemptsInWindow).toBeGreaterThanOrEqual(LOCKOUT_THRESHOLD);
    expect(status.retryAt).toBeInstanceOf(Date);
    // retryAt should fall within the next window length.
    const ms = status.retryAt!.getTime() - Date.now();
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(LOCKOUT_WINDOW_MS + 1000);
  });

  it("ignores attempts older than the window", async () => {
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await recordFailedSignIn("alice@example.com");
    }
    // Backdate every attempt so they fall out of the rolling window.
    for (const r of rows) {
      r.attemptedAt = new Date(Date.now() - LOCKOUT_WINDOW_MS - 60_000);
    }
    const status = await getLockoutStatus("alice@example.com");
    expect(status.locked).toBe(false);
    expect(status.attemptsInWindow).toBe(0);
  });

  it("isolates lockouts per identifier", async () => {
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await recordFailedSignIn("alice@example.com");
    }
    const alice = await getLockoutStatus("alice@example.com");
    const bob = await getLockoutStatus("bob@example.com");
    expect(alice.locked).toBe(true);
    expect(bob.locked).toBe(false);
  });

  it("locks unknown emails too (anti-enumeration)", async () => {
    // Same code path, same response — an attacker can't tell whether
    // the email is registered just from the lockout response.
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await recordFailedSignIn("not-a-real-user@example.com");
    }
    const status = await getLockoutStatus("not-a-real-user@example.com");
    expect(status.locked).toBe(true);
  });
});

describe("clearFailedSignIns", () => {
  it("wipes the counter on success", async () => {
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
      await recordFailedSignIn("alice@example.com");
    }
    expect((await getLockoutStatus("alice@example.com")).attemptsInWindow).toBe(
      LOCKOUT_THRESHOLD - 1
    );
    await clearFailedSignIns("alice@example.com");
    expect((await getLockoutStatus("alice@example.com")).attemptsInWindow).toBe(
      0
    );
  });

  it("only clears the matching identifier", async () => {
    await recordFailedSignIn("alice@example.com");
    await recordFailedSignIn("bob@example.com");
    await clearFailedSignIns("alice@example.com");
    expect((await getLockoutStatus("alice@example.com")).attemptsInWindow).toBe(
      0
    );
    expect((await getLockoutStatus("bob@example.com")).attemptsInWindow).toBe(
      1
    );
  });
});

describe("formatRetryIn", () => {
  it("rounds up to the nearest minute and pluralises correctly", () => {
    expect(formatRetryIn(new Date(Date.now() + 30_000))).toBe("in 1 minute");
    expect(formatRetryIn(new Date(Date.now() + 60_000))).toBe("in 1 minute");
    expect(formatRetryIn(new Date(Date.now() + 61_000))).toBe("in 2 minutes");
    expect(formatRetryIn(new Date(Date.now() + 14 * 60_000))).toBe("in 14 minutes");
  });

  it("never returns negative time", () => {
    expect(formatRetryIn(new Date(Date.now() - 60_000))).toBe("in a moment");
  });
});
