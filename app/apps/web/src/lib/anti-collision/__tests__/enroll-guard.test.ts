import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Spec 14 — the enrollment guard's SAFE-rollout contract: with enforcement OFF
 * a collision is recorded but the caller still proceeds (zero behavior change on
 * the live path); with it ON a collision blocks; a lock-store error always fails
 * open. The atomic one-winner property lives in the lock impl, not here.
 */

const lockState = vi.hoisted(() => ({
  acquireReturns: true,
  throws: false,
  holder: "other-enrollment" as string | null,
}));

vi.mock("../db-lock", () => ({
  collisionLockForTenant: vi.fn(() => ({
    acquire: vi.fn(async () => {
      if (lockState.throws) throw new Error("lock store down");
      return lockState.acquireReturns;
    }),
    holder: vi.fn(async () => lockState.holder),
    release: vi.fn(async () => {}),
  })),
}));

// releaseEnrollmentById resolves a contactId from the enrollment row.
const dbState = vi.hoisted(() => ({ rows: [{ contactId: "c1" }] as Array<{ contactId: string }> }));
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => dbState.rows }) }) }) },
}));
vi.mock("@/db/schema", () => ({ sequenceEnrollments: { id: "id", contactId: "contact_id" } }));
vi.mock("drizzle-orm", () => ({ eq: (col: unknown, val: unknown) => ({ col, val }) }));

import { guardEnrollment, releaseEnrollment, releaseEnrollmentById, isAntiCollisionEnforced } from "../enroll-guard";

const ORIG = process.env.ANTI_COLLISION_ENFORCE;
beforeEach(() => {
  lockState.acquireReturns = true;
  lockState.throws = false;
  lockState.holder = "other-enrollment";
  delete process.env.ANTI_COLLISION_ENFORCE;
});
afterEach(() => {
  if (ORIG === undefined) delete process.env.ANTI_COLLISION_ENFORCE;
  else process.env.ANTI_COLLISION_ENFORCE = ORIG;
});

const base = { tenantId: "t1", contactId: "c1", enrollmentId: "seq1:c1" };

describe("isAntiCollisionEnforced", () => {
  it("off by default, on for 1/true", () => {
    delete process.env.ANTI_COLLISION_ENFORCE;
    expect(isAntiCollisionEnforced()).toBe(false);
    process.env.ANTI_COLLISION_ENFORCE = "1";
    expect(isAntiCollisionEnforced()).toBe(true);
    process.env.ANTI_COLLISION_ENFORCE = "true";
    expect(isAntiCollisionEnforced()).toBe(true);
    process.env.ANTI_COLLISION_ENFORCE = "no";
    expect(isAntiCollisionEnforced()).toBe(false);
  });
});

describe("guardEnrollment", () => {
  it("won lock -> proceed, no collision", async () => {
    lockState.acquireReturns = true;
    const r = await guardEnrollment(base);
    expect(r).toEqual({ proceed: true, collidedWith: null, recordedOnly: false });
  });

  it("lost lock + enforcement OFF -> proceed (record-only) with the incumbent holder", async () => {
    lockState.acquireReturns = false;
    const r = await guardEnrollment(base);
    expect(r.proceed).toBe(true);
    expect(r.recordedOnly).toBe(true);
    expect(r.collidedWith).toBe("other-enrollment");
  });

  it("lost lock + enforcement ON -> blocked", async () => {
    process.env.ANTI_COLLISION_ENFORCE = "1";
    lockState.acquireReturns = false;
    const r = await guardEnrollment(base);
    expect(r.proceed).toBe(false);
    expect(r.recordedOnly).toBe(false);
    expect(r.collidedWith).toBe("other-enrollment");
  });

  it("lock store error -> fail open (proceed), even with enforcement ON", async () => {
    process.env.ANTI_COLLISION_ENFORCE = "1";
    lockState.throws = true;
    const r = await guardEnrollment(base);
    expect(r.proceed).toBe(true);
  });
});

describe("releaseEnrollment", () => {
  it("never throws", async () => {
    await expect(releaseEnrollment("t1", "c1")).resolves.toBeUndefined();
  });
});

describe("releaseEnrollmentById", () => {
  it("resolves the enrollment's contact and releases (never throws)", async () => {
    dbState.rows = [{ contactId: "c1" }];
    await expect(releaseEnrollmentById("enr1")).resolves.toBeUndefined();
  });
  it("no-ops when the enrollment is gone", async () => {
    dbState.rows = [];
    await expect(releaseEnrollmentById("missing")).resolves.toBeUndefined();
  });
});
