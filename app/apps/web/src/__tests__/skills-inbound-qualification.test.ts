/**
 * Inbound-lead-qualification skill (_specs/title-persona-fit R8): the
 * quoted score is the STORED ICP-fit column (refreshed through the
 * shared lib); the source boost stays a presentation-layer adjustment;
 * duplicate detection is tenant-scoped.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({
  contacts: { id: "id", email: "email", tenantId: "tenant_id", companyId: "company_id", deletedAt: "deleted_at" },
  companies: { id: "id", name: "name", tenantId: "tenant_id", deletedAt: "deleted_at" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  ne: vi.fn(),
  isNull: vi.fn(),
}));
vi.mock("@/lib/icp/fit-recompute-core", () => ({ loadActiveIcps: vi.fn() }));
vi.mock("@/lib/scoring/contact-icp-fit", () => ({
  hasContactScorableCriteria: vi.fn(),
  scoreContactIcpBatch: vi.fn(),
}));
vi.mock("@/skills/skill-knowledge", () => ({ getSkillKnowledge: vi.fn() }));

import { db } from "@/db";
import { loadActiveIcps } from "@/lib/icp/fit-recompute-core";
import {
  hasContactScorableCriteria,
  scoreContactIcpBatch,
} from "@/lib/scoring/contact-icp-fit";
import { getSkillKnowledge } from "@/skills/skill-knowledge";
import { inboundLeadQualificationHandler } from "@/skills/scoring/inbound-lead-qualification/handler";

const CONTACT_ROW = {
  id: "ct1",
  firstName: "Aline",
  lastName: "Rey",
  email: "aline@acme.ch",
  companyId: "co1",
  score: 73,
  scoreReasons: ["ICP fit: Suisse romande (73/100)"],
};

/** Chain supporting both `await ...where()` and `...where().limit(1)`. */
function chain(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => Object.assign(Promise.resolve(rows), { limit: vi.fn(async () => rows) })),
    })),
  };
}

function primeSelects(contactRows: unknown[], dupRows: unknown[], companyRows: unknown[]) {
  vi.mocked(db.select)
    .mockReturnValueOnce(chain(contactRows) as never)
    .mockReturnValueOnce(chain(dupRows) as never)
    .mockReturnValueOnce(chain(companyRows) as never);
}

describe("inboundLeadQualificationHandler", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.clearAllMocks();
    vi.mocked(loadActiveIcps).mockResolvedValue([{ id: "i1", name: "I", priority: 1, criteria: [] }] as never);
    vi.mocked(hasContactScorableCriteria).mockReturnValue(true);
    vi.mocked(scoreContactIcpBatch).mockResolvedValue({ scored: 1 });
    vi.mocked(getSkillKnowledge).mockResolvedValue("kb");
  });

  it("quotes the stored ICP-fit score; the demo boost only shapes priority", async () => {
    primeSelects([CONTACT_ROW], [], [{ id: "co1", name: "Acme" }]);

    const out = await inboundLeadQualificationHandler(
      { contactId: "ct1", source: "demo_request" },
      { tenantId: "t1", dryRun: false } as never,
    );

    expect(scoreContactIcpBatch).toHaveBeenCalledWith("t1", ["ct1"], expect.anything());
    expect(out.score).toBe(73); // stored column, NOT boosted
    expect(out.grade).toBe("B");
    expect(out.priority).toBe("hot"); // 73 + 15 demo boost ≥ 60
    expect(out.qualified).toBe(true);
    expect(out.companyName).toBe("Acme");
    expect(out.reasons).toEqual(["ICP fit: Suisse romande (73/100)"]);
    expect(out.isDuplicate).toBe(false);
  });

  it("flags a duplicate email and reports the existing contact", async () => {
    primeSelects([CONTACT_ROW], [{ id: "ct-existing" }], [{ id: "co1", name: "Acme" }]);

    const out = await inboundLeadQualificationHandler(
      { contactId: "ct1", source: "form" },
      { tenantId: "t1", dryRun: false } as never,
    );

    expect(out.isDuplicate).toBe(true);
    expect(out.existingContactId).toBe("ct-existing");
    expect(out.priority).toBe("hot"); // 73, no boost, ≥ 60
  });
});
