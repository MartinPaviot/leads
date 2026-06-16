import { describe, it, expect } from "vitest";
import {
  partitionAccountsForPreview,
  IN_ICP_SCORE_THRESHOLD,
  type PreviewAccountInput,
} from "@/lib/accounts/sourcing-preview";

const acct = (over: Partial<PreviewAccountInput> & { id: string }): PreviewAccountInput => ({
  name: over.id,
  domain: `${over.id}.com`,
  score: 80,
  ...over,
});

describe("partitionAccountsForPreview", () => {
  it("classifies in-ICP / out-of-ICP / unscored / no-domain", () => {
    const { accounts, summary } = partitionAccountsForPreview([
      acct({ id: "a", score: 82 }), // A → in-ICP
      acct({ id: "b", score: 50 }), // C → in-ICP (>= 40)
      acct({ id: "c", score: 25 }), // D → out (< 40)
      acct({ id: "d", score: null }), // unscored
      acct({ id: "e", score: 90, domain: null }), // in-ICP score but no domain
    ]);

    const by = Object.fromEntries(accounts.map((a) => [a.accountId, a]));
    expect(by.a.inIcp).toBe(true);
    expect(by.a.grade).toBe("A");
    expect(by.b.inIcp).toBe(true);
    expect(by.c.inIcp).toBe(false);
    expect(by.c.grade).toBe("D");
    expect(by.d.inIcp).toBe(false);
    expect(by.d.grade).toBeNull();
    expect(by.e.hasDomain).toBe(false);

    expect(summary).toEqual({
      total: 5,
      inIcp: 2, // a, b (e has no domain so not sourceable)
      outIcp: 1, // c
      noDomain: 1, // e
      unscored: 1, // d
    });
  });

  it("samples in-ICP-with-domain accounts first, capped at sampleSize", () => {
    const { sampleAccountIds } = partitionAccountsForPreview(
      [
        acct({ id: "low", score: 10 }),
        acct({ id: "hi1", score: 90 }),
        acct({ id: "hi2", score: 85 }),
        acct({ id: "nod", score: 95, domain: null }),
        acct({ id: "hi3", score: 70 }),
      ],
      { sampleSize: 2 },
    );
    // in-ICP-with-domain first (hi1, hi2, hi3 in input order), capped at 2.
    expect(sampleAccountIds).toEqual(["hi1", "hi2"]);
    expect(sampleAccountIds).not.toContain("nod"); // no domain → never sampled
  });

  it("falls back to out-of-ICP-with-domain when nothing is in-ICP (still shows something real)", () => {
    const { sampleAccountIds } = partitionAccountsForPreview(
      [acct({ id: "x", score: 5 }), acct({ id: "y", score: 0 })],
      { sampleSize: 3 },
    );
    expect(sampleAccountIds).toEqual(["x", "y"]);
  });

  it("the threshold is grade C (40)", () => {
    expect(IN_ICP_SCORE_THRESHOLD).toBe(40);
    const { accounts } = partitionAccountsForPreview([
      acct({ id: "edge", score: 40 }),
      acct({ id: "below", score: 39 }),
    ]);
    expect(accounts.find((a) => a.accountId === "edge")?.inIcp).toBe(true);
    expect(accounts.find((a) => a.accountId === "below")?.inIcp).toBe(false);
  });
});
