/**
 * Lead-qualification skill (_specs/title-persona-fit R8): chat quotes
 * the STORED ICP-fit column, refreshed through the shared lib — never
 * a private recomputation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/db/schema", () => ({
  contacts: { id: "id", tenantId: "tenant_id", companyId: "company_id", deletedAt: "deleted_at" },
  companies: { id: "id", name: "name", tenantId: "tenant_id", deletedAt: "deleted_at" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
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
import { leadQualificationHandler } from "@/skills/scoring/lead-qualification/handler";

const CONTACT_ROW = {
  id: "ct1",
  firstName: "Pascal",
  lastName: "Bauer",
  email: "p@ocas.ch",
  title: "Deputy Director",
  companyId: "co1",
  score: 73,
  scoreReasons: ["ICP fit: Suisse romande (73/100)"],
};

function primeSelects(contactRows: unknown[], companyRows: unknown[]) {
  const chain = (rows: unknown[]) => ({
    from: vi.fn(() => ({ where: vi.fn(async () => rows) })),
  });
  vi.mocked(db.select)
    .mockReturnValueOnce(chain(contactRows) as never)
    .mockReturnValueOnce(chain(companyRows) as never);
}

describe("leadQualificationHandler", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.clearAllMocks();
    vi.mocked(loadActiveIcps).mockResolvedValue([{ id: "i1", name: "I", priority: 1, criteria: [] }] as never);
    vi.mocked(hasContactScorableCriteria).mockReturnValue(true);
    vi.mocked(scoreContactIcpBatch).mockResolvedValue({ scored: 1 });
    vi.mocked(getSkillKnowledge).mockResolvedValue("kb");
  });

  it("refreshes through the shared lib then quotes the STORED score", async () => {
    primeSelects([CONTACT_ROW], [{ id: "co1", name: "OCAS" }]);

    const out = await leadQualificationHandler(
      { contactIds: ["ct1"], minScoreThreshold: 40 },
      { tenantId: "t1", dryRun: false } as never,
    );

    expect(scoreContactIcpBatch).toHaveBeenCalledWith("t1", ["ct1"], expect.anything());
    expect(out.leads).toHaveLength(1);
    expect(out.leads[0]).toMatchObject({
      contactId: "ct1",
      score: 73,
      grade: "B",
      qualified: true,
      companyName: "OCAS",
      reasons: ["ICP fit: Suisse romande (73/100)"],
    });
    expect(out.totalQualified).toBe(1);
  });

  it("skips the refresh when nothing is scorable and reads stored rows as-is", async () => {
    vi.mocked(hasContactScorableCriteria).mockReturnValue(false);
    primeSelects([{ ...CONTACT_ROW, score: null, scoreReasons: null }], [{ id: "co1", name: "OCAS" }]);

    const out = await leadQualificationHandler(
      { contactIds: ["ct1"], minScoreThreshold: 40 },
      { tenantId: "t1", dryRun: false } as never,
    );

    expect(scoreContactIcpBatch).not.toHaveBeenCalled();
    expect(out.leads[0]).toMatchObject({ score: 0, qualified: false, reasons: [] });
  });
});
