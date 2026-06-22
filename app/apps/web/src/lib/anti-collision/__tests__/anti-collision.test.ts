import { describe, it, expect } from "vitest";
import {
  InMemoryCollisionLock,
  acquireEnrollmentLock,
  releaseEnrollmentLock,
  detectAccountOverlap,
  type AntiCollisionDeps,
  type CollisionRecord,
} from "../index";

function deps(over: Partial<AntiCollisionDeps> = {}): { deps: AntiCollisionDeps; collisions: CollisionRecord[] } {
  const collisions: CollisionRecord[] = [];
  return {
    collisions,
    deps: {
      lock: new InMemoryCollisionLock(over.now),
      recordCollision: (r) => void collisions.push(r),
      ...over,
    },
  };
}

describe("acquireEnrollmentLock — AC1 claim + block + record", () => {
  it("first enroll wins the lock", async () => {
    const { deps: d } = deps();
    expect(await acquireEnrollmentLock("contact-1", "enroll-A", d)).toBe(true);
  });

  it("a second, different enroll on a held contact is blocked and a collision is recorded with the incumbent holder", async () => {
    const { deps: d, collisions } = deps();
    await acquireEnrollmentLock("contact-1", "enroll-A", d);
    expect(await acquireEnrollmentLock("contact-1", "enroll-B", d)).toBe(false);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toMatchObject({ contactId: "contact-1", blockedEnrollmentId: "enroll-B", heldBy: "enroll-A" });
  });

  it("re-acquiring with the SAME holder is idempotent (a retried enroll never blocks itself)", async () => {
    const { deps: d, collisions } = deps();
    await acquireEnrollmentLock("contact-1", "enroll-A", d);
    expect(await acquireEnrollmentLock("contact-1", "enroll-A", d)).toBe(true);
    expect(collisions).toHaveLength(0);
  });

  it("different contacts never collide", async () => {
    const { deps: d } = deps();
    expect(await acquireEnrollmentLock("contact-1", "enroll-A", d)).toBe(true);
    expect(await acquireEnrollmentLock("contact-2", "enroll-B", d)).toBe(true);
  });
});

describe("acquireEnrollmentLock — AC4 one winner under concurrency", () => {
  it("N concurrent enrolls on one contact yield exactly one winner", async () => {
    const { deps: d, collisions } = deps();
    const ids = Array.from({ length: 25 }, (_, i) => `enroll-${i}`);
    const results = await Promise.all(ids.map((id) => acquireEnrollmentLock("contact-hot", id, d)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(collisions).toHaveLength(24); // every loser recorded
  });
});

describe("releaseEnrollmentLock — AC3 release on terminal event", () => {
  it("after release the contact is free for a new campaign", async () => {
    const { deps: d } = deps();
    await acquireEnrollmentLock("contact-1", "enroll-A", d);
    await releaseEnrollmentLock("contact-1", d);
    expect(await acquireEnrollmentLock("contact-1", "enroll-B", d)).toBe(true);
  });

  it("releasing a free contact is a no-op (idempotent)", async () => {
    const { deps: d } = deps();
    await expect(releaseEnrollmentLock("never-locked", d)).resolves.toBeUndefined();
  });
});

describe("lock TTL — crashed enrollment self-heals", () => {
  it("an expired lock is re-acquirable by another enroll", async () => {
    let t = 1_000;
    const { deps: d } = deps({ now: () => t, ttlMs: 100 });
    expect(await acquireEnrollmentLock("contact-1", "enroll-A", d)).toBe(true);
    t += 101; // TTL elapsed without a release (crash)
    expect(await acquireEnrollmentLock("contact-1", "enroll-B", d)).toBe(true);
  });

  it("within the TTL the lock still blocks", async () => {
    let t = 1_000;
    const { deps: d } = deps({ now: () => t, ttlMs: 100 });
    await acquireEnrollmentLock("contact-1", "enroll-A", d);
    t += 50;
    expect(await acquireEnrollmentLock("contact-1", "enroll-B", d)).toBe(false);
  });
});

describe("detectAccountOverlap — AC2", () => {
  it("flags accounts targeted by >1 distinct campaign, ignores single-campaign accounts", () => {
    const overlaps = detectAccountOverlap([
      { accountId: "acct-1", campaignId: "camp-x" },
      { accountId: "acct-1", campaignId: "camp-y" },
      { accountId: "acct-2", campaignId: "camp-x" }, // only one campaign → not an overlap
      { accountId: "acct-3", campaignId: "camp-z" },
      { accountId: "acct-3", campaignId: "camp-z" }, // same campaign twice → still one distinct → not an overlap
    ]);
    expect(overlaps).toEqual([{ accountId: "acct-1", campaignIds: ["camp-x", "camp-y"] }]);
  });

  it("output is deterministic (accounts + campaigns sorted)", () => {
    const overlaps = detectAccountOverlap([
      { accountId: "b", campaignId: "2" },
      { accountId: "b", campaignId: "1" },
      { accountId: "a", campaignId: "z" },
      { accountId: "a", campaignId: "a" },
    ]);
    expect(overlaps).toEqual([
      { accountId: "a", campaignIds: ["a", "z"] },
      { accountId: "b", campaignIds: ["1", "2"] },
    ]);
  });

  it("empty input → no overlaps", () => {
    expect(detectAccountOverlap([])).toEqual([]);
  });
});
