/**
 * Tests for @/db/rls — the pooler-sound tenant-context primitive.
 *
 * Regression guard for the 2026-06-10 incident: session-scoped
 * `set_config('app.tenant_id', ..., false)` calls poisoned Supavisor's
 * pooled backends (the SET and its clear land on different backends in
 * transaction-mode pooling), which made the 0074 RLS WITH CHECK reject
 * the first-sign-in `INSERT INTO users` for every new tenant. The only
 * sound form is SET LOCAL inside a real transaction — `withTenantTx`.
 * Post-mortem: _audit/2026-06-10-rls-session-poison.md.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Mock the db module before importing rls
vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(),
  },
}));

import { withTenantTx } from "@/db/rls";
import { db } from "@/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock
const mockTransaction = db.transaction as any as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockTransaction.mockReset();
});

describe("withTenantTx", () => {
  it("runs the callback inside db.transaction with SET LOCAL set_config first", async () => {
    const executed: unknown[] = [];
    const tx = {
      execute: vi.fn(async (q: unknown) => {
        executed.push(q);
      }),
    };
    mockTransaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

    const result = await withTenantTx("tenant-abc", async (innerTx) => {
      expect(innerTx).toBe(tx);
      // set_config must already have been issued on the SAME tx
      expect(tx.execute).toHaveBeenCalledTimes(1);
      return "payload";
    });

    expect(result).toBe("payload");
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // The bound statement carries the tenant id as a parameter and uses
    // transaction-local scope (third argument true).
    const queryChunks = JSON.stringify(executed[0]);
    expect(queryChunks).toContain("set_config");
    expect(queryChunks).toContain("app.tenant_id");
    expect(queryChunks).toContain("true");
    expect(queryChunks).toContain("tenant-abc");
  });

  it("propagates callback errors (transaction rollback path)", async () => {
    const tx = { execute: vi.fn(async () => undefined) };
    mockTransaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

    await expect(
      withTenantTx("tenant-err", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("is the module's only export — the session-scoped helpers are gone", async () => {
    const mod = await import("@/db/rls");
    expect(Object.keys(mod).sort()).toEqual(["withTenantTx"]);
  });
});

describe("tripwire: no session-scoped app.tenant_id set_config in src", () => {
  // A session-scoped set_config('app.tenant_id', <x>, false) anywhere in
  // the app re-introduces the pool-poisoning bug. Scan every source file
  // (comments stripped per line) and fail loudly on a match.
  const SRC_ROOT = join(__dirname, "..");
  const SESSION_SET = /set_config\(\s*'app\.tenant_id'\s*,[^)]*,\s*false\s*\)/;

  function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        yield* walk(full);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        yield full;
      }
    }
  }

  it("no source file issues a session-scoped tenant set_config", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const code = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => {
          const t = line.trim();
          return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
        })
        .join("\n");
      if (SESSION_SET.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
