import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({ emailOptouts: { emailAddress: "email_address", tenantId: "tenant_id" } }));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn(), inArray: vi.fn(), sql: vi.fn(() => ({})) }));

import { checkContactEligibility } from "@/lib/sequences/enrollment-eligibility";
import { db } from "@/db";
import { loadSuppressedEmails, isEmailSuppressed } from "@/lib/sequences/suppression";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockRows(rows: Array<{ email: string }>) {
  vi.mocked(db.select).mockReturnValue({ from: () => ({ where: () => Promise.resolve(rows) }) } as never);
}

describe("checkContactEligibility — suppression (P0-5)", () => {
  const base = { email: "a@x.com", deletedAt: null, companyExcludedReason: null };

  it("suppressed -> ineligible reason 'suppressed'", () => {
    expect(checkContactEligibility({ ...base, suppressedReason: "hard_bounce" })).toEqual({
      eligible: false,
      reason: "suppressed",
    });
  });

  it("order: deleted > no_email > suppressed > excluded_company", () => {
    expect(checkContactEligibility({ ...base, deletedAt: new Date(), suppressedReason: "complaint" }).eligible).toBe(false);
    expect(checkContactEligibility({ ...base, deletedAt: new Date(), suppressedReason: "complaint" })).toMatchObject({ reason: "deleted" });
    expect(checkContactEligibility({ ...base, email: null, suppressedReason: "complaint" })).toMatchObject({ reason: "no_email" });
    // suppressed beats excluded_company (deliverability wins)
    expect(checkContactEligibility({ ...base, suppressedReason: "opt_out", companyExcludedReason: "competitor" })).toMatchObject({ reason: "suppressed" });
    expect(checkContactEligibility({ ...base, companyExcludedReason: "competitor" })).toMatchObject({ reason: "excluded_company" });
  });

  it("backward compatible: no suppressedReason -> eligible", () => {
    expect(checkContactEligibility(base)).toEqual({ eligible: true });
  });
});

describe("loadSuppressedEmails / isEmailSuppressed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("empty / all-null input -> empty set, no query", () => {
    return loadSuppressedEmails("t1", [null, undefined]).then((set) => {
      expect(set.size).toBe(0);
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  it("returns lower-cased suppressed emails", async () => {
    mockRows([{ email: "A@x.com" }]);
    const set = await loadSuppressedEmails("t1", ["a@x.com", "b@x.com"]);
    expect(set.has("a@x.com")).toBe(true);
    expect(set.has("b@x.com")).toBe(false);
  });

  it("isEmailSuppressed true/false (case-insensitive)", async () => {
    mockRows([{ email: "burned@x.com" }]);
    expect(await isEmailSuppressed("t1", "Burned@X.com")).toBe(true);
    mockRows([]);
    expect(await isEmailSuppressed("t1", "fresh@x.com")).toBe(false);
    expect(await isEmailSuppressed("t1", null)).toBe(false);
  });
});
