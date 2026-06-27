import { describe, it, expect, vi } from "vitest";
import { manualTaskExists } from "../manual-task-guard";

/** Minimal db stub: select().from().where().limit() → the seeded rows. */
function stubDb(rows: { id: string }[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
  } as unknown as Parameters<typeof manualTaskExists>[2];
}

describe("manualTaskExists", () => {
  it("true when a matching manual-task row exists", async () => {
    expect(await manualTaskExists("en1", "step1", stubDb([{ id: "act_1" }]))).toBe(true);
  });

  it("false when none exists", async () => {
    expect(await manualTaskExists("en1", "step1", stubDb([]))).toBe(false);
  });

  it("passes through the query (smoke: does not throw on a normal call)", async () => {
    const where = vi.fn(() => ({ limit: () => Promise.resolve([]) }));
    const db = { select: () => ({ from: () => ({ where }) }) } as unknown as Parameters<typeof manualTaskExists>[2];
    await manualTaskExists("en1", "step1", db);
    expect(where).toHaveBeenCalledTimes(1);
  });
});
