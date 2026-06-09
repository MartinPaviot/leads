import { describe, it, expect, vi, beforeEach } from "vitest";

// resolveFromNumber is DB-bound: it validates an explicit override against the
// tenant's active pool, then falls back to local-presence auto-selection. We
// mock @/db so the pool lookup returns a controllable set of rows and assert
// the discriminated result the route relies on (honour / 409 / 503).

interface PoolRow {
  e164: string;
  twilioSid: string;
  tenantId: string;
  countryCode: string | null;
  areaCode: string | null;
  active: boolean;
}

let pool: PoolRow[] = [];

// Minimal where-predicate evaluation: the route passes (tenantId, e164?,
// countryCode?, areaCode?, active) filters. We re-derive intent from the
// captured eq() tuples so the mock honours the same matching the real query
// would, rather than blindly returning the first row.
type EqTuple = [string, unknown];

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (clauses: unknown) => ({
          limit: async () => {
            const eqs = flattenEqs(clauses);
            const filtered = pool.filter((row) =>
              eqs.every(([col, val]) => {
                if (col === "tenant_id") return row.tenantId === val;
                if (col === "e164") return row.e164 === val;
                if (col === "country_code") return row.countryCode === val;
                if (col === "area_code") return row.areaCode === val;
                if (col === "active") return row.active === val;
                return true;
              }),
            );
            return filtered.slice(0, 1).map((r) => ({
              e164: r.e164,
              twilioSid: r.twilioSid,
            }));
          },
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  phoneNumberPool: {
    e164: "e164",
    twilioSid: "twilio_sid",
    tenantId: "tenant_id",
    countryCode: "country_code",
    areaCode: "area_code",
    active: "active",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...clauses: unknown[]) => ({ __and: clauses }),
  eq: (col: unknown, val: unknown): EqTuple => [col as string, val],
}));

function flattenEqs(clauses: unknown): EqTuple[] {
  // `where(and(eq(...), eq(...)))` → { __and: [ [col,val], ... ] }
  if (clauses && typeof clauses === "object" && "__and" in clauses) {
    return (clauses as { __and: unknown[] }).__and.flatMap(flattenEqs);
  }
  if (Array.isArray(clauses) && clauses.length === 2 && typeof clauses[0] === "string") {
    return [clauses as EqTuple];
  }
  return [];
}

import { resolveFromNumber } from "@/lib/voice/number-selector";

const TENANT = "tenant-1";

function frNumber(e164: string, active = true): PoolRow {
  return { e164, twilioSid: `sid-${e164}`, tenantId: TENANT, countryCode: "FR", areaCode: "6", active };
}

describe("resolveFromNumber", () => {
  beforeEach(() => {
    pool = [];
  });

  it("honours a valid override that is active in the tenant pool", async () => {
    pool = [frNumber("+33600000001"), frNumber("+33600000002")];
    const res = await resolveFromNumber(TENANT, "+33611223344", "+33600000002");
    expect(res).toEqual({ ok: true, e164: "+33600000002" });
  });

  it("rejects an override that is not in the pool (409 path)", async () => {
    pool = [frNumber("+33600000001")];
    const res = await resolveFromNumber(TENANT, "+33611223344", "+33699999999");
    expect(res).toEqual({ ok: false, reason: "invalid_override" });
  });

  it("rejects an override that exists but is inactive", async () => {
    pool = [frNumber("+33600000001", /* active */ false)];
    const res = await resolveFromNumber(TENANT, "+33611223344", "+33600000001");
    expect(res).toEqual({ ok: false, reason: "invalid_override" });
  });

  it("rejects an override owned by a different tenant", async () => {
    pool = [{ ...frNumber("+33600000001"), tenantId: "other-tenant" }];
    const res = await resolveFromNumber(TENANT, "+33611223344", "+33600000001");
    expect(res).toEqual({ ok: false, reason: "invalid_override" });
  });

  it("falls back to local-presence auto-selection when no override is given", async () => {
    pool = [frNumber("+33600000001")];
    const res = await resolveFromNumber(TENANT, "+33611223344");
    expect(res).toEqual({ ok: true, e164: "+33600000001" });
  });

  it("returns no_pool_number when the tenant has no active numbers", async () => {
    pool = [];
    const res = await resolveFromNumber(TENANT, "+33611223344");
    expect(res).toEqual({ ok: false, reason: "no_pool_number" });
  });

  it("treats an empty-string override as 'no override' (auto-select)", async () => {
    pool = [frNumber("+33600000001")];
    const res = await resolveFromNumber(TENANT, "+33611223344", "");
    expect(res).toEqual({ ok: true, e164: "+33600000001" });
  });
});
