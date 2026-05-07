/**
 * Shared DB mock helpers for vitest.
 *
 * The structural overhaul (5ddbccd) changed how routes access the DB
 * via withAuthRLS + RLS. Most test mocks broke because they use
 * simplistic chainable mocks that don't handle destructuring or
 * iteration of query results.
 *
 * These helpers create properly structured mock chains that:
 * 1. Support .select().from().where().limit() chains
 * 2. Resolve to configurable data when awaited
 * 3. Support destructuring ([first] = await db.select()...)
 * 4. Support .values() for inserts
 * 5. Support .set().where() for updates
 */

import { vi } from "vitest";

export function createMockDb(defaultData: unknown[] = []) {
  const createChain = (resolveData?: unknown[]) => {
    const data = resolveData ?? defaultData;
    const chain: any = {};

    const methods = [
      "select", "from", "leftJoin", "rightJoin", "innerJoin",
      "where", "groupBy", "having", "orderBy", "limit", "offset",
      "set", "values", "returning", "onConflictDoUpdate", "onConflictDoNothing",
    ];

    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }

    // Make thenable — resolves to data array
    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      return Promise.resolve(data).then(resolve, reject);
    };

    // Support Symbol.iterator for destructuring
    chain[Symbol.iterator] = function* () {
      yield* data;
    };

    // Support array-like access
    for (let i = 0; i < data.length; i++) {
      chain[i] = data[i];
    }
    chain.length = data.length;

    return chain;
  };

  return {
    select: vi.fn().mockReturnValue(createChain()),
    insert: vi.fn().mockReturnValue(createChain()),
    update: vi.fn().mockReturnValue(createChain()),
    delete: vi.fn().mockReturnValue(createChain()),
    execute: vi.fn().mockResolvedValue([]),
    _setData: (data: unknown[]) => {
      const newChain = createChain(data);
      // Re-mock select to return chain with new data
      return newChain;
    },
  };
}
