import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/schema", () => ({
  companies: { _name: "companies", id: "id", priorityScore: "priority_score", priorityScoreComputedAt: "psc", tenantId: "tenant_id", targetingStatus: "targeting_status", excludedReason: "excluded_reason", deletedAt: "deleted_at" },
  contacts: { _name: "contacts", id: "id", companyId: "company_id", email: "email", emailStatus: "email_status", score: "score", tenantId: "tenant_id", deletedAt: "deleted_at" },
  sequenceEnrollments: { _name: "sequenceEnrollments", contactId: "contact_id", status: "status", tenantId: "tenant_id" },
  emailOptouts: { _name: "emailOptouts", emailAddress: "email_address", tenantId: "tenant_id" },
}));
vi.mock("drizzle-orm", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  and: (...a: any[]) => ({ op: "and", a }), eq: (c: any, v: any) => ({ op: "eq", c, v }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isNull: (c: any) => ({ op: "isNull", c }), inArray: (c: any, v: any) => ({ op: "inArray", c, v }), sql: (...a: any[]) => ({ op: "sql", a }),
}));

import { loadCandidates, pickBestContacts, pickContactsForCompanies, buildCandidates, isReachable, type ContactRow, type CompanyScore } from "../candidates";
import type { SignalPerson } from "@/lib/signals/record-signal";

// db stub: routes each query by the from() table's _name; companies query also
// supports .orderBy().limit().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubDb(data: Record<string, any[]>) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from: (table: any) => ({
        where: () => {
          const rows = data[table._name] ?? [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p: any = Promise.resolve(rows);
          p.orderBy = () => ({ limit: () => Promise.resolve(rows) });
          return p;
        },
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const con = (over: Partial<ContactRow> & { id: string; companyId: string }): ContactRow => ({ email: `${over.id}@x.com`, emailStatus: null, score: 0, ...over });

describe("isReachable", () => {
  it("present email + not verified-invalid → reachable", () => {
    expect(isReachable({ email: "a@x.com", emailStatus: null })).toBe(true);
    expect(isReachable({ email: "a@x.com", emailStatus: "valid" })).toBe(true);
    expect(isReachable({ email: "", emailStatus: null })).toBe(false);
    expect(isReachable({ email: null, emailStatus: null })).toBe(false);
    expect(isReachable({ email: "a@x.com", emailStatus: "invalid" })).toBe(false);
  });
});

describe("pickBestContacts", () => {
  it("keeps the highest-score reachable contact per company; tie → contactId asc", () => {
    const best = pickBestContacts([
      con({ id: "c1", companyId: "co1", score: 10 }),
      con({ id: "c2", companyId: "co1", score: 90 }), // best for co1
      con({ id: "bad", companyId: "co1", score: 100, emailStatus: "invalid" }), // unreachable, ignored
      con({ id: "z", companyId: "co2", score: 5 }),
      con({ id: "a", companyId: "co2", score: 5 }), // tie → "a" < "z"
    ]);
    expect(best.get("co1")?.id).toBe("c2");
    expect(best.get("co2")?.id).toBe("a");
  });

  it("drops contacts with no company or no reachable email", () => {
    const best = pickBestContacts([
      con({ id: "x", companyId: "" as unknown as string, score: 9 }),
      con({ id: "y", companyId: "co1", email: null }),
    ]);
    expect(best.size).toBe(0);
  });
});

describe("pickContactsForCompanies — Monaco signal→person", () => {
  const rows: ContactRow[] = [
    con({ id: "ceo", companyId: "co1", score: 90, firstName: "Ada", lastName: "King", title: "CEO" }), // score-best
    con({ id: "mgr", companyId: "co1", score: 10, firstName: "Bo", lastName: "Lee", title: "Eng Manager" }), // the hinted person
    con({ id: "x", companyId: "co2", score: 5 }),
  ];

  it("no hints → identical to pickBestContacts (score-best)", () => {
    const out = pickContactsForCompanies(rows, new Map());
    expect(out.get("co1")?.id).toBe("ceo");
    expect(out.get("co2")?.id).toBe("x");
  });

  it("a resolving hint re-targets to the named contact over the score-best", () => {
    const hints = new Map<string, SignalPerson>([["co1", { contactId: "mgr" }]]);
    const out = pickContactsForCompanies(rows, hints);
    expect(out.get("co1")?.id).toBe("mgr"); // hinted, not the CEO
    expect(out.get("co2")?.id).toBe("x"); // untouched
  });

  it("a hint that doesn't resolve falls back to score-best", () => {
    const hints = new Map<string, SignalPerson>([["co1", { email: "stranger@nope.com" }]]);
    expect(pickContactsForCompanies(rows, hints).get("co1")?.id).toBe("ceo");
  });

  it("a hint to an UNREACHABLE contact falls back to score-best (email channel needs an email)", () => {
    const withUnreachable: ContactRow[] = [
      con({ id: "ceo", companyId: "co1", score: 90 }),
      con({ id: "mgr", companyId: "co1", score: 10, email: null }), // hinted but unreachable
    ];
    const hints = new Map<string, SignalPerson>([["co1", { contactId: "mgr" }]]);
    expect(pickContactsForCompanies(withUnreachable, hints).get("co1")?.id).toBe("ceo");
  });

  it("a hint to an INELIGIBLE (opted-out/enrolled) contact falls back to the eligible alternate — does NOT strand the account", () => {
    const rows: ContactRow[] = [
      con({ id: "ceo", companyId: "co1", score: 90 }), // eligible alternate
      con({ id: "mgr", companyId: "co1", score: 10 }), // reachable BUT ineligible (e.g. already enrolled)
    ];
    const hints = new Map<string, SignalPerson>([["co1", { contactId: "mgr" }]]);
    const isEligible = (c: ContactRow) => c.id !== "mgr";
    const out = pickContactsForCompanies(rows, hints, isEligible);
    expect(out.get("co1")?.id).toBe("ceo"); // covered via the alternate, not dropped
  });

  it("a company whose ONLY contact is ineligible yields no pick (correctly dropped)", () => {
    const rows: ContactRow[] = [con({ id: "only", companyId: "co1", score: 5 })];
    const out = pickContactsForCompanies(rows, new Map(), () => false);
    expect(out.has("co1")).toBe(false);
  });
});

describe("buildCandidates", () => {
  it("maps best contacts to candidates, carrying the company score + computedAt", () => {
    const best = new Map([["co1", con({ id: "c1", companyId: "co1" })]]);
    const scores = new Map<string, CompanyScore>([["co1", { priorityScore: 88, priorityScoreComputedAt: 1234 }]]);
    expect(buildCandidates(best, scores)).toEqual([{ contactId: "c1", companyId: "co1", priorityScore: 88, priorityScoreComputedAt: 1234, reachable: true }]);
  });
});

describe("loadCandidates (IO)", () => {
  it("limit <= 0 → empty pool, no query", async () => {
    const pool = await loadCandidates("t1", 0, stubDb({}));
    expect(pool.candidates).toEqual([]);
  });

  it("no targeted companies → empty pool", async () => {
    expect((await loadCandidates("t1", 10, stubDb({ companies: [] }))).candidates).toEqual([]);
  });

  it("picks the eligible contact per company (skips enrolled/suppressed BEFORE choosing) — no stranding", async () => {
    const db = stubDb({
      companies: [
        { id: "co1", priorityScore: 90, computedAt: new Date(1000) },
        { id: "co2", priorityScore: 50, computedAt: new Date(2000) },
      ],
      contacts: [
        { id: "k1", companyId: "co1", email: "K1@X.com", emailStatus: null, score: 1 }, // eligible alternate
        { id: "k2", companyId: "co1", email: "k2@x.com", emailStatus: null, score: 9 }, // higher score BUT enrolled
        { id: "k3", companyId: "co2", email: "k3@x.com", emailStatus: null, score: 3 }, // co2's only contact, suppressed
      ],
      sequenceEnrollments: [{ contactId: "k2" }], // k2 already enrolled → ineligible
      emailOptouts: [{ emailAddress: "k3@x.com" }], // k3 suppressed → ineligible
    });
    const pool = await loadCandidates("t1", 10, db);
    // co1 falls back to the eligible k1 (NOT stranded on the enrolled k2);
    // co2's only contact is suppressed → correctly dropped.
    expect(pool.candidates.map((c) => c.contactId)).toEqual(["k1"]);
    expect(pool.candidates[0].priorityScore).toBe(90); // still co1's priority
    // Chosen contacts are eligible by construction → exclusion sets are empty.
    expect([...pool.alreadyEnrolledContactIds]).toEqual([]);
    expect([...pool.suppressedContactIds]).toEqual([]);
  });

  it("a company with only unreachable contacts yields no candidate", async () => {
    const db = stubDb({
      companies: [{ id: "co1", priorityScore: 90, computedAt: null }],
      contacts: [{ id: "bad", companyId: "co1", email: "bad@x.com", emailStatus: "invalid", score: 9 }],
    });
    expect((await loadCandidates("t1", 10, db)).candidates).toEqual([]);
  });
});
